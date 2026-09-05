import { useEffect, useRef, useState } from 'react'
import { videoUrl } from '../../api/client'
import { gondolaCorners } from '../../lib/homography'

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
      const width = canvas.width = video.videoWidth
      const height = canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, width, height)
      const config = configurationRef.current
      const matrix = config.camera?.homography_inv
      const px = (x, z) => {
        if (!matrix) return null
        const flat = matrix.flat()
        const denominator = flat[6] * x + flat[7] * z + flat[8]
        if (!denominator) return null
        return [(flat[0] * x + flat[1] * z + flat[2]) / denominator * width, (flat[3] * x + flat[4] * z + flat[5]) / denominator * height]
      }
      const quad = (corners, fill, stroke, lineWidth, dash) => {
        const points = corners.map(([x, z]) => px(x, z)).filter(Boolean)
        if (points.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...points[0])
        points.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        if (fill) { ctx.fillStyle = fill; ctx.fill() }
        ctx.strokeStyle = stroke
        ctx.lineWidth = lineWidth
        if (dash) ctx.setLineDash(dash)
        ctx.stroke()
        ctx.setLineDash([])
      }

      if (matrix && showGeo) {
        quad([[0, 0], [floor.width, 0], [floor.width, floor.depth || 0], [0, floor.depth || 0]], null, 'rgba(126, 154, 143, .75)', 2, [8, 6])
      }

      ;(showGeo ? config.gondolas || [] : []).forEach((gondola) => {
        const corners = gondolaCorners(gondola)
        const selected = gondola.id === selectedRef.current
        const p0 = px(gondola.x, gondola.z)
        quad(corners, selected ? 'rgba(212, 255, 112, .30)' : 'rgba(97, 222, 192, .06)', selected ? '#d9fe6b' : '#65dfc2', selected ? 6 : 3, selected ? null : [5, 5])
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
  const maxPickupCount = pickupHistogram ? Math.max(1, ...pickupHistogram.buckets.map((bucket) => bucket.count)) : 1

  return (
    <section className="analysis-video">
      <div className="section-title"><span className="eyebrow">REPRODUCCIÓN DEL ANÁLISIS</span><h2>El video, con geografía</h2><p>Reproduce el video real. El mapa de góndolas y zonas es opcional: activalo con «Geografía».</p></div>
      <div className="analysis-video-layout">
        <div className="analysis-video-stage">
          <video
            ref={videoRef}
            src={videoUrl(analysis.id)}
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onEnded={() => setPlaying(false)}
          />
          <canvas ref={canvasRef} className="analysis-overlay" />
          <div className="analysis-video-controls">
            <button className="play-toggle" onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) { video.play().catch(() => {}) } else { video.pause() } }}>{playing ? '❚❚' : '▶'}</button>
            <strong>{formatTime(time)}</strong>
            <span>/</span>
            <b>{formatTime(duration)}</b>
            <label className="heat-toggle"><input type="checkbox" checked={showGeo} onChange={(event) => setShowGeo(event.target.checked)} />Geografía</label>
          </div>
          <div className="video-timeline">
            <input type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} />
            {events.map((event, index) => (
              <button key={`${event.t}-${index}`} className="event-tick" style={{ left: `${Math.min(100, event.t / Math.max(1, duration) * 100)}%` }} title={`${event.gondola_name} · ${formatTime(event.t)}`} onClick={() => seekToEvent(event)} />
            ))}
            {pickups.map((event, index) => (
              <button key={`${event.t}-${index}`} className="event-tick pickup" style={{ left: `${Math.min(100, event.t / Math.max(1, duration) * 100)}%` }} title={`Pick-up · ${event.gondola_name} · ${formatTime(event.t)}`} onClick={() => seekToEvent(event)} />
            ))}
          </div>
          <small className="analysis-video-note">Overlay fijo: la cámara estática mantiene la proyección alineada durante toda la reproducción.</small>
        </div>
        <aside className="interaction-panel">
          <div className="interaction-heading">
            <span className="eyebrow">FLUJO DE INTERACCIÓN</span>
            <b>{events.length} eventos · {pickups.length} pick-ups</b>
          </div>
          {histogram && histogram.buckets.some((bucket) => bucket.count > 0)
            ? <div className="interaction-histogram">{histogram.buckets.map((bucket) => (
              <div key={bucket.index} className="hist-column" title={`${formatTime(bucket.start)}–${formatTime(bucket.end)} · ${bucket.count} evento${bucket.count === 1 ? '' : 's'}`}>
                <i style={{ height: `${Math.max(4, bucket.count / maxCount * 100)}%` }} />
                <small>{formatTime(bucket.start)}</small>
              </div>))}</div>
            : <p className="interaction-empty">Sin eventos de interacción inferidos en este video.</p>}
          {pickupHistogram && pickupHistogram.buckets.some((bucket) => bucket.count > 0)
            ? <div className="interaction-histogram pickup">{pickupHistogram.buckets.map((bucket) => (
              <div key={bucket.index} className="hist-column" title={`Pick-ups ${formatTime(bucket.start)}–${formatTime(bucket.end)} · ${bucket.count}`}>
                <i style={{ height: `${Math.max(4, bucket.count / maxPickupCount * 100)}%` }} />
                <small>{formatTime(bucket.start)}</small>
              </div>))}</div>
            : null}
          <div className="interaction-list">
            {events.length > 0 || pickups.length > 0
              ? <div className="interaction-scroll">{[...pickups].reverse().map((event, index) => (
                <button className="interaction-event pickup" key={`pick-${event.t}-${index}`} onClick={() => seekToEvent(event)}>
                  <b>{formatTime(event.t)}</b>
                  <span>{event.gondola_name}</span>
                  <i>⚡</i>
                </button>))}{[...events].reverse().map((event, index) => (
                <button className="interaction-event" key={`${event.t}-${index}`} onClick={() => seekToEvent(event)}>
                  <b>{formatTime(event.t)}</b>
                  <span>{event.gondola_name}</span>
                  <i>→</i>
                </button>))}</div>
              : <p className="interaction-empty">Lista de eventos vacía: se completa al inferir interacciones de proximidad, velocidad y tiempo frente a las góndolas.</p>}
          </div>
        </aside>
      </div>
    </section>
  )
}