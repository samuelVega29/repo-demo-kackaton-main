import { useEffect, useMemo, useRef, useState } from 'react'
import { artifactUrl, getAnalysisHeatmap, getAnalysisTrajectories, getAnalysisZones, videoUrl } from '../services/analyses'
import { inverseHomography, projectFloor } from '../utils/homography'
import { formatTime } from '../utils/format'

const VIEW_MODES = [['original', 'Original'], ['heatmap', 'Mapa de calor'], ['pickup', 'Pick-ups'], ['zones', 'Zonas'], ['trajectories', 'Trayectorias']]
const zoneStyles = {
  hot: ['rgba(255, 107, 61, .28)', 'rgba(255, 107, 61, .86)'],
  normal: ['rgba(31, 111, 235, .18)', 'rgba(31, 111, 235, .72)'],
  cold: ['rgba(97, 222, 192, .16)', 'rgba(24, 151, 122, .72)'],
}

const flat = (matrix) => matrix?.flat?.() ?? matrix

function invert3x3(matrix) {
  const m = flat(matrix)
  if (!m || m.length !== 9) return null
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-10) return null
  return [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ]
}

function renderedVideoBox(video) {
  const rect = video.getBoundingClientRect()
  const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
  const elementRatio = rect.width / Math.max(1, rect.height)
  if (elementRatio > ratio) {
    const width = rect.height * ratio
    return { x: (rect.width - width) / 2, y: 0, width, height: rect.height }
  }
  const height = rect.width / ratio
  return { x: 0, y: (rect.height - height) / 2, width: rect.width, height }
}

function centroid(points) {
  const sum = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [sum[0] / points.length, sum[1] / points.length]
}

export default function AnalysisVideo({ analysis }) {
  const result = analysis.result || {}
  const configuration = result.site?.configuration || {}
  const camera = configuration.camera || {}
  const duration = result.video?.duration_seconds || 0
  const coordinateSystem = result.coordinate_system || result.quality?.coordinate_system
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [viewMode, setViewMode] = useState('heatmap')
  const [opacity, setOpacity] = useState(0.58)
  const [showLabels, setShowLabels] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [box, setBox] = useState(null)
  const [heatmapData, setHeatmapData] = useState(null)
  const [trajectoryData, setTrajectoryData] = useState(null)
  const [zoneData, setZoneData] = useState(null)
  const [eventFilter, setEventFilter] = useState('all')

  useEffect(() => {
    let active = true
    Promise.allSettled([getAnalysisHeatmap(analysis.id), getAnalysisTrajectories(analysis.id), getAnalysisZones(analysis.id)]).then(([heatmap, trajectories, zones]) => {
      if (!active) return
      if (heatmap.status === 'fulfilled') setHeatmapData(heatmap.value)
      if (trajectories.status === 'fulfilled') setTrajectoryData(trajectories.value)
      if (zones.status === 'fulfilled') setZoneData(zones.value)
    })
    return () => { active = false }
  }, [analysis.id])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    const update = () => setBox(renderedVideoBox(video))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(video)
    window.addEventListener('resize', update)
    video.addEventListener('loadedmetadata', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      video.removeEventListener('loadedmetadata', update)
    }
  }, [])

  const heatmaps = heatmapData?.heatmaps || result.heatmaps || {}
  const overlayMetric = viewMode === 'pickup' ? 'pickup' : 'traffic'
  const overlays = heatmaps.overlays?.[overlayMetric] || heatmaps.overlays?.traffic || heatmaps.overlays?.dwell || []
  const slices = heatmaps.slices || []
  const activeSlice = useMemo(() => {
    if (!slices.length) return null
    return slices.find((slice) => time >= slice.start && time <= slice.end) || slices[slices.length - 1]
  }, [slices, time])
  const floorHeatmap = activeSlice?.[overlayMetric] || heatmaps[overlayMetric]
  const overlayFrame = overlays.length ? overlays[Math.min(overlays.length - 1, Math.floor(time / Math.max(1, duration) * overlays.length))] : null
  const heatmapSrc = overlayFrame || (coordinateSystem === 'normalized' ? floorHeatmap : null)
  const trajectories = trajectoryData?.trajectories || result.trajectories || []
  const zones = zoneData?.zones || result.zones || []
  const pickupEvents = result.pickup_events_log || []
  const interactionEvents = result.interaction_events_log || []
  const visibleEvents = eventFilter === 'pickup' ? pickupEvents : eventFilter === 'interaction' ? interactionEvents : [...pickupEvents, ...interactionEvents].sort((a, b) => (a.t || 0) - (b.t || 0))
  const projectionMatrix = useMemo(() => flat(camera.homography_inv) || invert3x3(camera.homography) || inverseHomography(camera), [camera])

  const projectPoint = (point) => {
    if (!box) return null
    const [x, y] = point
    if (coordinateSystem === 'normalized') return [box.x + x * box.width, box.y + y * box.height]
    const projected = projectFloor(projectionMatrix, x, y)
    if (!projected) return null
    return [box.x + projected[0] * box.width, box.y + projected[1] * box.height]
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video || !box) return
    const dpr = window.devicePixelRatio || 1
    const rect = video.getBoundingClientRect()
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    if ((viewMode === 'heatmap' || viewMode === 'pickup') && !heatmapSrc) {
      trajectories.forEach((trajectory) => {
        ;(trajectory.points || []).forEach((point) => {
          const px = projectPoint(point)
          if (!px) return
          const gradient = ctx.createRadialGradient(px[0], px[1], 0, px[0], px[1], 46)
          gradient.addColorStop(0, `rgba(255, 107, 61, ${opacity * 0.42})`)
          gradient.addColorStop(0.55, `rgba(255, 209, 102, ${opacity * 0.2})`)
          gradient.addColorStop(1, 'rgba(255, 107, 61, 0)')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(px[0], px[1], 46, 0, Math.PI * 2)
          ctx.fill()
        })
      })
    }

    if (viewMode === 'pickup') {
      pickupEvents.forEach((event) => {
        const px = projectPoint([event.x, event.z])
        if (!px) return
        ctx.beginPath()
        ctx.arc(px[0], px[1], 15, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 107, 61, ${Math.max(.22, opacity)})`
        ctx.fill()
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(255,255,255,.92)'
        ctx.stroke()
        if (showLabels) {
          const label = event.product || event.gondola_name || `Pick-up ${formatTime(event.t || 0)}`
          ctx.font = '700 12px Poppins, system-ui, sans-serif'
          const width = ctx.measureText(label).width + 18
          ctx.fillStyle = 'rgba(16,23,34,.88)'
          ctx.beginPath()
          ctx.roundRect(px[0] - width / 2, px[1] - 42, width, 26, 8)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.fillText(label, px[0] - width / 2 + 9, px[1] - 25)
        }
      })
    }

    if (viewMode === 'zones') {
      zones.forEach((zone) => {
        const points = (zone.polygon || []).map(projectPoint).filter(Boolean)
        if (points.length < 3) return
        const [fill, stroke] = zoneStyles[zone.classification] || zoneStyles.normal
        ctx.beginPath()
        ctx.moveTo(...points[0])
        points.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = 2
        ctx.fill()
        ctx.stroke()
        if (showLabels && zone.name) {
          const [x, y] = centroid(points)
          const label = `${zone.name}${zone.classification ? ` · ${zone.classification}` : ''}`
          ctx.font = '600 12px Poppins, system-ui, sans-serif'
          const width = ctx.measureText(label).width + 18
          ctx.fillStyle = 'rgba(255, 255, 255, .92)'
          ctx.beginPath()
          ctx.roundRect(x - width / 2, y - 14, width, 28, 8)
          ctx.fill()
          ctx.fillStyle = '#141b24'
          ctx.fillText(label, x - width / 2 + 9, y + 4)
        }
      })
    }

    if (viewMode === 'trajectories') {
      trajectories.forEach((trajectory) => {
        const points = (trajectory.points || []).map(projectPoint).filter(Boolean)
        if (points.length < 2) return
        ctx.beginPath()
        ctx.moveTo(...points[0])
        points.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.strokeStyle = `rgba(31, 111, 235, ${Math.max(.2, opacity)})`
        ctx.lineWidth = 3
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.stroke()
      })
    }
  }, [box, coordinateSystem, heatmapSrc, opacity, pickupEvents, projectionMatrix, showLabels, trajectories, viewMode, zones])

  const seek = (seconds) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(seconds, video.duration || duration))
  }

  const jumpToEvent = (event) => {
    seek(Math.max(0, (event.t || 0) - 1))
    videoRef.current?.play().catch(() => {})
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#ff6b3d]">VIDEO INTERACTIVO</span>
          <h2 className="mt-[9px] text-[clamp(32px,4vw,52px)] tracking-[-.045em] text-[#151323]">Analitica sobre el video real</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="tablist">
          {VIEW_MODES.map(([value, label]) => (
            <button key={value} role="tab" aria-selected={viewMode === value} className={`rounded-full border px-4 py-2 text-[11px] font-bold transition ${viewMode === value ? 'border-[#ff6b3d] bg-[#ff6b3d] text-white' : 'border-[#e5e7ee] bg-white text-[#3f4858] hover:border-[#ff6b3d]'}`} onClick={() => setViewMode(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid overflow-hidden rounded-lg border border-[#e5e7ee] bg-[#05070a] shadow-[0_30px_90px_-45px_rgba(20,27,36,.55)] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
        <div className="relative mx-auto max-h-[72vh] bg-black">
          <video ref={videoRef} src={videoUrl(analysis.id)} playsInline className="block h-auto max-h-[72vh] w-full bg-black object-contain" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
          {viewMode === 'heatmap' && heatmapSrc && box && <img src={artifactUrl(analysis.id, heatmapSrc)} alt="" className="pointer-events-none absolute object-fill mix-blend-screen" style={{ left: box.x, top: box.y, width: box.width, height: box.height, opacity }} />}
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
        </div>

        <div className="grid gap-3 border-t border-white/10 bg-[#101722] p-4 text-white md:grid-cols-[auto_1fr_auto_auto] md:items-center">
          <div className="flex items-center gap-3">
            <button className="grid h-10 w-10 place-items-center rounded-full border border-[#ff6b3d] bg-[#ff6b3d] text-[13px] font-bold text-white" onClick={() => { const video = videoRef.current; if (!video) return; video.paused ? video.play().catch(() => {}) : video.pause() }}>{playing ? 'II' : '▶'}</button>
            <span className="font-[ui-monospace,monospace] text-[12px]">{formatTime(time)} / {formatTime(duration)}</span>
          </div>
          <input className="w-full accent-[#ff6b3d]" type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} />
          <label className="flex items-center gap-2 text-[11px] text-white/75">Opacidad<input className="w-28 accent-[#ff6b3d]" type="range" min="0.15" max="0.9" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
          <label className="flex items-center gap-2 text-[11px] text-white/75"><input className="accent-[#ff6b3d]" type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} />Etiquetas</label>
        </div>
        </div>

        <aside className="border-t border-white/10 bg-white p-4 xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-[#151323]">Eventos del video</h3>
              <p className="mt-1 text-xs text-[#7d8392]">Salta al segundo exacto detectado por el analisis.</p>
            </div>
            <b className="rounded-full bg-[#fff1eb] px-3 py-1 text-[11px] text-[#ff6b3d]">{pickupEvents.length} pick-ups</b>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-1">
            {['all', 'pickup', 'interaction'].map((value) => <button key={value} className={`rounded-md px-2 py-2 text-[10px] font-bold ${eventFilter === value ? 'bg-[#1f6feb] text-white' : 'bg-[#f6f6f4] text-[#7d8392]'}`} onClick={() => setEventFilter(value)}>{value === 'all' ? 'Todos' : value === 'pickup' ? 'Pick-ups' : 'Interacciones'}</button>)}
          </div>
          {visibleEvents.length ? (
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
              {visibleEvents.map((event, index) => {
                const isPickup = pickupEvents.includes(event)
                return (
                  <button key={`${event.t}-${event.track_id}-${index}`} className="rounded-lg border border-[#e5e7ee] bg-white p-3 text-left transition hover:border-[#ff6b3d]" onClick={() => jumpToEvent(event)}>
                    <div className="flex items-center justify-between gap-2">
                      <b className={`font-[ui-monospace,monospace] text-sm ${isPickup ? 'text-[#ff6b3d]' : 'text-[#1f6feb]'}`}>{formatTime(event.t || 0)}</b>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isPickup ? 'bg-[#fff1eb] text-[#ff6b3d]' : 'bg-[#eef5ff] text-[#1f6feb]'}`}>{isPickup ? 'Pick-up' : 'Interaccion'}</span>
                    </div>
                    <p className="mt-2 text-xs text-[#151323]">{event.product || event.gondola_name || `Track ${event.track_id}`}</p>
                    {typeof event.row !== 'undefined' && typeof event.column !== 'undefined' && <p className="mt-1 text-[11px] text-[#7d8392]">Nivel {event.row + 1} · Seccion {event.column + 1}</p>}
                  </button>
                )
              })}
            </div>
          ) : <p className="rounded-lg border border-dashed border-[#e5e7ee] bg-[#f6f6f4] p-4 text-sm text-[#7d8392]">Este analisis no reporto eventos de pick-up o interaccion.</p>}
        </aside>
      </div>
    </section>
  )
}
