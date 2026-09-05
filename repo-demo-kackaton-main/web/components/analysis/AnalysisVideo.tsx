'use client'

import { useEffect, useRef, useState } from 'react'
import { videoUrl } from '@/lib/api'
import { gondolaCorners } from '@/lib/homography'

const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function AnalysisVideo({ analysis, selectedId, onSelect }) {
  const result = analysis.result
  const configuration = result.site.configuration
  const floor = configuration.floor || {}
  const duration = result.video.duration_seconds || 0
  const events = result.interaction_events_log || []
  const pickups = result.pickup_events_log || []
  const histogram = result.interaction_histogram
  const pickupHistogram = result.pickup_histogram
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const configurationRef = useRef(configuration)
  configurationRef.current = configuration
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [showGeo, setShowGeo] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    let frame = 0

    const draw = () => {
      if (!video.videoWidth) return
      const width = (canvas.width = video.videoWidth)
      const height = (canvas.height = video.videoHeight)
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, width, height)
      const config = configurationRef.current
      const matrix = config.camera?.homography_inv
      const px = (x, z) => {
        if (!matrix) return null
        const flat = matrix.flat()
        const denominator = flat[6] * x + flat[7] * z + flat[8]
        if (!denominator) return null
        return [
          (((flat[0] * x + flat[1] * z + flat[2]) / denominator) * width),
          (((flat[3] * x + flat[4] * z + flat[5]) / denominator) * height),
        ]
      }
      const quad = (corners, fill, stroke, lineWidth, dash) => {
        const points = corners.map(([x, z]) => px(x, z)).filter(Boolean)
        if (points.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...points[0])
        points.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        if (fill) {
          ctx.fillStyle = fill
          ctx.fill()
        }
        ctx.strokeStyle = stroke
        ctx.lineWidth = lineWidth
        if (dash) ctx.setLineDash(dash)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (matrix && showGeo) {
        quad(
          [
            [0, 0],
            [floor.width, 0],
            [floor.width, floor.depth || 0],
            [0, floor.depth || 0],
          ],
          null,
          'rgba(126, 154, 143, .75)',
          2,
          [8, 6],
        )
      }

      ;(showGeo ? config.gondolas || [] : []).forEach((gondola) => {
        const corners = gondolaCorners(gondola)
        const selected = gondola.id === selectedRef.current
        const p0 = px(gondola.x, gondola.z)
        quad(
          corners,
          selected ? 'rgba(212, 255, 112, .30)' : 'rgba(97, 222, 192, .06)',
          selected ? '#d9fe6b' : '#65dfc2',
          selected ? 6 : 3,
          selected ? null : [5, 5],
        )
        if (p0 && gondola.name) {
          ctx.fillStyle = selected ? '#d9fe6b' : 'rgba(8, 18, 15, .75)'
          if (!selected) ctx.fillRect(p0[0], p0[1] - 24, ctx.measureText(gondola.name).width + 16, 22)
          ctx.fillStyle = selected ? '#0c1714' : '#e8f2ed'
          ctx.font = `${selected ? 14 : 12}px ui-monospace, monospace`
          ctx.fillText(gondola.name, p0[0] + 8, p0[1] - 8)
        }
      })

      ;(showGeo ? config.zones || [] : []).forEach((zone) => {
        quad(zone.polygon || [], 'rgba(97, 222, 192, .05)', 'rgba(97, 222, 192, .4)', 2, [4, 4])
      })
    }

    const loop = () => {
      draw()
      frame = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(frame)
  }, [floor.width, floor.depth, showGeo])

  const seek = (seconds) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(seconds, video.duration || duration))
    video.play().catch(() => {})
  }

  const seekToEvent = (event) => {
    onSelect(event.gondola_id)
    seek(event.t - 1)
  }

  const maxCount = histogram ? Math.max(1, ...histogram.buckets.map((bucket) => bucket.count)) : 1
  const maxPickupCount = pickupHistogram
    ? Math.max(1, ...pickupHistogram.buckets.map((bucket) => bucket.count))
    : 1

  return (
    <section className="flex flex-col gap-4">
      <div className="section-title">
        <span className="eyebrow">REPRODUCCIÓN DEL ANÁLISIS</span>
        <h2 className="mt-1 text-base font-semibold">El video, con geografía</h2>
        <p className="m-0 text-xs leading-5 text-muted">
          Reproduce el video real. El mapa de góndolas y zonas es opcional: activalo con «Geografía».
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-2">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
            <video
              ref={videoRef}
              src={videoUrl(analysis.id)}
              playsInline
              className="block h-auto w-full"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onEnded={() => setPlaying(false)}
            />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          </div>
          <div className="flex items-center gap-3 px-1">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full border border-acid text-sm text-acid transition-colors hover:bg-acid hover:text-base"
              onClick={() => {
                const video = videoRef.current
                if (!video) return
                if (video.paused) video.play().catch(() => {})
                else video.pause()
              }}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <strong className="font-mono text-xs text-ink">{formatTime(time)}</strong>
            <span className="text-muted">/</span>
            <b className="font-mono text-xs text-muted">{formatTime(duration)}</b>
            <label className="ml-auto flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              <input
                type="checkbox"
                checked={showGeo}
                onChange={(event) => setShowGeo(event.target.checked)}
                className="accent-acid"
              />
              Geografía
            </label>
          </div>
          <div className="relative h-2 rounded-full bg-panel2">
            <input
              type="range"
              min="0"
              max={Math.max(1, duration)}
              step="0.1"
              value={Math.min(time, duration)}
              onChange={(event) => seek(Number(event.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent"
            />
            {events.map((event, index) => (
              <button
                key={`${event.t}-${index}`}
                className="absolute top-1/2 z-10 h-2.5 w-1 -translate-y-1/2 bg-mint"
                style={{ left: `${Math.min(100, (event.t / Math.max(1, duration)) * 100)}%` }}
                title={`${event.gondola_name} · ${formatTime(event.t)}`}
                onClick={() => seekToEvent(event)}
              />
            ))}
            {pickups.map((event, index) => (
              <button
                key={`${event.t}-${index}`}
                className="absolute top-1/2 z-10 h-2.5 w-1 -translate-y-1/2 bg-ember"
                style={{ left: `${Math.min(100, (event.t / Math.max(1, duration)) * 100)}%` }}
                title={`Pick-up · ${event.gondola_name} · ${formatTime(event.t)}`}
                onClick={() => seekToEvent(event)}
              />
            ))}
          </div>
          <small className="px-1 text-[11px] text-muted">
            Overlay fijo: la cámara estática mantiene la proyección alineada durante toda la
            reproducción.
          </small>
        </div>
        <aside className="flex h-fit flex-col gap-3 rounded-2xl border border-line bg-panel p-4 lg:max-h-[560px]">
          <div className="flex items-center justify-between">
            <span className="eyebrow">FLUJO DE INTERACCIÓN</span>
            <b className="font-mono text-[11px] text-muted">
              {events.length} eventos · {pickups.length} pick-ups
            </b>
          </div>
          {histogram && histogram.buckets.some((bucket) => bucket.count > 0) ? (
            <div className="flex h-20 items-end gap-1">
              {histogram.buckets.map((bucket) => (
                <div
                  key={bucket.index}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                  title={`${formatTime(bucket.start)}–${formatTime(bucket.end)} · ${bucket.count} evento${bucket.count === 1 ? '' : 's'}`}
                >
                  <i
                    className="w-full rounded-sm bg-mint transition-opacity group-hover:opacity-70"
                    style={{ height: `${Math.max(4, (bucket.count / maxCount) * 100)}%` }}
                  />
                  <small className="font-mono text-[8px] text-muted">{formatTime(bucket.start)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-xs text-muted">Sin eventos de interacción inferidos en este video.</p>
          )}
          {pickupHistogram && pickupHistogram.buckets.some((bucket) => bucket.count > 0) ? (
            <div className="flex h-16 items-end gap-1">
              {pickupHistogram.buckets.map((bucket) => (
                <div
                  key={bucket.index}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                  title={`Pick-ups ${formatTime(bucket.start)}–${formatTime(bucket.end)} · ${bucket.count}`}
                >
                  <i
                    className="w-full rounded-sm bg-ember transition-opacity group-hover:opacity-70"
                    style={{ height: `${Math.max(4, (bucket.count / maxPickupCount) * 100)}%` }}
                  />
                  <small className="font-mono text-[8px] text-muted">{formatTime(bucket.start)}</small>
                </div>
              ))}
            </div>
          ) : null}
          <div className="scroll max-h-[300px] overflow-y-auto pr-1">
            {events.length > 0 || pickups.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {[...pickups]
                  .reverse()
                  .map((event, index) => (
                    <button
                      className="flex items-center gap-2 rounded-lg border border-ember/30 bg-ember/5 px-2.5 py-2 text-left transition-colors hover:border-ember"
                      key={`pick-${event.t}-${index}`}
                      onClick={() => seekToEvent(event)}
                    >
                      <b className="font-mono text-xs text-ember">{formatTime(event.t)}</b>
                      <span className="truncate text-xs text-ink">{event.gondola_name}</span>
                      <i className="ml-auto font-mono text-xs text-ember">⚡</i>
                    </button>
                  ))}
                {[...events]
                  .reverse()
                  .map((event, index) => (
                    <button
                      className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:border-mint/50"
                      key={`${event.t}-${index}`}
                      onClick={() => seekToEvent(event)}
                    >
                      <b className="font-mono text-xs text-mint">{formatTime(event.t)}</b>
                      <span className="truncate text-xs text-ink">{event.gondola_name}</span>
                      <i className="ml-auto font-mono text-xs text-mint">→</i>
                    </button>
                  ))}
              </div>
            ) : (
              <p className="m-0 text-xs leading-4 text-muted">
                Lista de eventos vacía: se completa al inferir interacciones de proximidad, velocidad
                y tiempo frente a las góndolas.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}