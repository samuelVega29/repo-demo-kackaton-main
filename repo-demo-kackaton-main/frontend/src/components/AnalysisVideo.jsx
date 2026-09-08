import { Clock, Flame, MessageCircle, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { artifactUrl, getAnalysisHeatmap, getAnalysisTrajectories, getAnalysisZones, videoUrl } from '../services/analyses'
import { inverseHomography, projectFloor } from '../utils/homography'
import { pointInPolygon } from '../utils/floorOutline'
import { formatTime } from '../utils/format'

const findingDotColor = { evidence: '#ff6b3d', recommendation: '#22c55e', quality: '#151323' }

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
  const [opacity, setOpacity] = useState(0.35)
  const [showHotZones, setShowHotZones] = useState(true)
  const [showColdZones, setShowColdZones] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [box, setBox] = useState(null)
  const [videoRatio, setVideoRatio] = useState(16 / 9)
  const [heatmapData, setHeatmapData] = useState(null)
  const [trajectoryData, setTrajectoryData] = useState(null)
  const [zoneData, setZoneData] = useState(null)
  const [eventFilter, setEventFilter] = useState('all')
  const [showZoneBoundaries, setShowZoneBoundaries] = useState(true)

  const videoEnded = duration > 0 && time >= duration - 0.2
  const coldIntense = videoEnded && showColdZones

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
    const onMetadata = () => {
      if (video.videoWidth && video.videoHeight) setVideoRatio(video.videoWidth / video.videoHeight)
      update()
    }
    video.addEventListener('loadedmetadata', onMetadata)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      video.removeEventListener('loadedmetadata', onMetadata)
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
  // El overlay acumula los puntos de TODO el video: cualquier frame de evidencia sirve de
  // fondo, asi que se fija uno solo (el del medio) en vez de recalcularlo con el scrubber -
  // eso era lo que producia el efecto fantasma al mezclar el overlay con el video en marcha.
  const overlayFrame = overlays.length ? overlays[Math.floor((overlays.length - 1) / 2)] : null
  const heatmapSrc = overlayFrame || (coordinateSystem === 'normalized' ? floorHeatmap : null)
  const trajectories = trajectoryData?.trajectories || result.trajectories || []
  const zones = zoneData?.zones || result.zones || []
  const findings = result.findings || []
  const peopleTotal = result.metrics?.tracked_presences ?? result.metrics?.people_detected ?? 0
  const interactionsTotal = result.metrics?.interaction_events ?? 0
  const hotZonesTotal = zones.filter((zone) => zone.classification === 'hot' || (zone.heat_index || 0) > 0).length
  const zoneVisits = zones.reduce((sum, zone) => sum + (zone.visits || 0), 0)
  const zoneDwellSeconds = zones.reduce((sum, zone) => sum + (zone.dwell_seconds || 0), 0)
  const avgDwellTotal = zoneVisits ? zoneDwellSeconds / zoneVisits : 0
  const pickupEvents = result.pickup_events_log || []
  const interactionEvents = result.interaction_events_log || []
  // Los eventos de interaccion/pick-up se guardan en el espacio interno (pixeles
  // en modo fast, metros en advanced). El resto del mapa usa coordenadas expuestas:
  // normalizadas en fast. Aqui se convierten para que matcheen con las zonas y el canvas.
  const toExposed = (x, z) => {
    if (coordinateSystem === 'normalized') {
      const videoW = result.video?.width || 1
      const videoH = result.video?.height || 1
      return [x / videoW, z / videoH]
    }
    return [x, z]
  }

  // Metricas principales dinamicas: se recalculan segun el instante actual del video.
  // - Personas detectadas   -> presentes AHORA (track_id unicos en la ultima muestra <= time)
  // - Permanencia promedio  -> duracion media de presencia de las personas vistas hasta el instante
  // - Zonas calientes       -> zonas con actividad caliente (interaccion/pick-up) hasta el instante
  // - Interacciones         -> eventos de interaccion (+ pick-ups) ocurridos hasta el instante
  // Si no hay muestreo en vivo (sin frame_detections) se cae a los totales del analisis.
  const liveMetrics = useMemo(() => {
    const samples = result.frame_detections || []
    if (!samples.length) {
      return {
        people: peopleTotal,
        avgDwell: avgDwellTotal,
        hotZones: hotZonesTotal,
        interactions: interactionsTotal,
      }
    }

    let lastPeople = 0
    const firstSeen = {}
    const lastSeen = {}
    let seenCount = 0
    const hotPoints = []
    for (let index = 0; index < samples.length && samples[index].timestamp <= time; index++) {
      const sample = samples[index]
      const present = new Set()
      for (const detection of sample.detections || []) {
        const id = detection.track_id
        if (id === undefined || id === null) continue
        present.add(id)
        if (!(id in firstSeen)) {
          firstSeen[id] = sample.timestamp
          seenCount++
        }
        lastSeen[id] = sample.timestamp
        // Misma clasificacion que dibuja los circulos calientes del mapa: interaccion,
        // engagement o aproximacion a una gondola.
        const state = detection.state || 'PASS'
        const isNearGondola = !!detection.gondola_id
        if (detection.floor_point && (state === 'INTERACTION' || state === 'ENGAGED' || (isNearGondola && state === 'APPROACH'))) {
          hotPoints.push(detection.floor_point)
        }
      }
      lastPeople = present.size
    }

    const avgDwell = (() => {
      if (!seenCount) return avgDwellTotal
      let total = 0
      for (const id of Object.keys(firstSeen)) {
        total += (lastSeen[id] ?? firstSeen[id]) - firstSeen[id]
      }
      return total / seenCount
    })()

    // Puntos calientes de eventos (pick-ups e interacciones) hasta el instante
    // actual, igual que los picos que pinta el mapa de calor.
    const eventSources = [...interactionEvents, ...pickupEvents]
    for (const event of eventSources) {
      if (typeof event.t !== 'number' || event.t > time) continue
      if (typeof event.x === 'number' && typeof event.z === 'number') hotPoints.push(toExposed(event.x, event.z))
    }

    // Zonas calientes: cualquier zona que contenga un punto caliente (detection
    // con interaccion/engagement/aproximacion a gondola o evento) cuenta como tal.
    const hotZoneIds = new Set()
    for (const point of hotPoints) {
      for (const zone of zones) {
        if (!hotZoneIds.has(zone.id) && pointInPolygon(point[0], point[1], zone.polygon)) hotZoneIds.add(zone.id)
      }
    }

    let interactions = 0
    for (const event of interactionEvents) if (typeof event.t === 'number' && event.t <= time) interactions++
    for (const event of pickupEvents) if (typeof event.t === 'number' && event.t <= time) interactions++

    return {
      people: lastPeople,
      avgDwell,
      hotZones: hotZoneIds.size,
      interactions,
    }
  }, [time, result, zones, peopleTotal, avgDwellTotal, hotZonesTotal, interactionsTotal, interactionEvents, pickupEvents])
  const visibleEvents = eventFilter === 'pickup' ? pickupEvents : eventFilter === 'interaction' ? interactionEvents : [...pickupEvents, ...interactionEvents].sort((a, b) => (a.t || 0) - (b.t || 0))
  const projectionMatrix = useMemo(() => flat(camera.homography_inv) || invert3x3(camera.homography) || inverseHomography(camera), [camera])

  // Acumulador en vivo del mapa de calor: mientras el video corre se van sumando
  // los puntos de contacto ya vistos (calientes = interacción/engagement, fríos =
  // tránsito de paso). Al hacer seek hacia atrás se rellena desde t=0 hasta el
  // tiempo actual para que el resultado sea siempre la densidad acumulada real.
  const heatAccum = useRef({
    calibrated: false,
    hot: { size: 0, filled: 0, points: [], events: [] },
    cold: { size: 0, filled: 0, points: [], events: [] },
  })

  const buildLiveHeatmap = (until) => {
    const acc = heatAccum.current
    if (!acc.calibrated) {
      const frameSamples = result.frame_detections || []
      acc.hot.size = frameSamples.length
      acc.cold.size = frameSamples.length
      acc.hot.points = new Array(frameSamples.length)
      acc.cold.points = new Array(frameSamples.length)
      acc.calibrated = true
    }
    acc.hot.filled = 0
    acc.cold.filled = 0
    const samples = result.frame_detections || []
    for (let index = 0; index < samples.length && samples[index].timestamp <= until; index++) {
      const sample = samples[index]
      const hot = []
      const cold = []
      for (const detection of sample.detections || []) {
        const state = detection.state || 'PASS'
        if (!detection.floor_point) continue
        const isNearGondola = !!detection.gondola_id
        if (state === 'INTERACTION' || state === 'ENGAGED' || (isNearGondola && state === 'APPROACH')) hot.push(detection.floor_point)
        else cold.push(detection.floor_point)
      }
      acc.hot.points[index] = hot
      acc.cold.points[index] = cold
      acc.hot.filled = index + 1
      acc.cold.filled = index + 1
    }
    // Picos calientes de interacción/pick-up ya ocurridos hasta el instante actual:
    // son la señal mas fuerte de que hubo contacto con una gondola o producto.
    const hotEvents = []
    const eventSources = [...(result.pickup_events_log || []), ...(result.interaction_events_log || [])]
    for (const event of eventSources) {
      if (typeof event.t !== 'number' || event.t > until) continue
      if (typeof event.x === 'number' && typeof event.z === 'number') hotEvents.push(toExposed(event.x, event.z))
    }
    acc.hot.events = hotEvents
    // Agregar posiciones de pickups e interacciones como puntos calientes
    // en la capa principal para que se vean como zonas de calor (no solo picos).
    if (hotEvents.length) {
      for (let index = 0; index < acc.hot.filled; index++) {
        if (!acc.hot.points[index]) acc.hot.points[index] = []
        acc.hot.points[index] = acc.hot.points[index].concat(hotEvents)
      }
    }
  }

  const collectLiveHeat = (until) => {
    const acc = heatAccum.current
    buildLiveHeatmap(until)
    return acc
  }

  useEffect(() => {
    if (viewMode === 'heatmap') buildLiveHeatmap(time)
  }, [time, viewMode])

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

    if (viewMode === 'heatmap') {
      const frameSamples = result.frame_detections || []
      const live = frameSamples.length > 0
      if (live) {
        const acc = collectLiveHeat(time)
        // Calientes primero (arriba) y frías debajo: cada punto acumula peso por
        // cada paso, asi las zonas donde hubo interacciones se ven mas intensas.
        const paint = (points, colorCenter, colorMid, radius, maxWeight, baseAlpha, colorEdge = 'rgba(255, 107, 61, 0)') => {
          for (const chunk of points) {
            if (!chunk) continue
            for (const point of chunk) {
              const px = projectPoint(point)
              if (!px) continue
              const r = radius
              const gradient = ctx.createRadialGradient(px[0], px[1], 0, px[0], px[1], r)
              gradient.addColorStop(0, colorCenter)
              gradient.addColorStop(0.55, colorMid)
              gradient.addColorStop(1, colorEdge)
              ctx.globalAlpha = Math.max(baseAlpha, opacity)
              ctx.fillStyle = gradient
              ctx.beginPath()
              ctx.arc(px[0], px[1], r, 0, Math.PI * 2)
              ctx.fill()
            }
          }
          ctx.globalAlpha = 1
        }
        if (showColdZones) {
          // Zonas frias: transito y aproximacion (cian/azul), menos calor.
          // Al finalizar el video se intensifican las zonas que no recibieron
          // interacciones/pick-ups para resaltar el transito limpio.
          const coldCenter = coldIntense ? opacity * 0.6 : opacity * 0.38
          const coldMid = coldIntense ? opacity * 0.34 : opacity * 0.20
          const coldBase = coldIntense ? opacity * 0.22 : opacity * 0.12
          paint(acc.cold.points.slice(0, acc.cold.filled), `rgba(97, 222, 192, ${coldCenter})`, `rgba(64, 170, 210, ${coldMid})`, 40, coldBase)
        }
        if (showHotZones) {
          // Zonas calientes: interacciones y pick-ups (naranja/rojo), mas calor y radio mayor.
          paint(acc.hot.points.slice(0, acc.hot.filled), `rgba(255, 45, 35, ${Math.min(0.30, opacity + 0.04)})`, `rgba(255, 209, 102, ${(opacity) * 0.12})`, 34, opacity * 0.08, 'rgba(41, 98, 255, 0)')
          // Picos calientes: un anillo mas amplio y brillante en cada contacto real
          // con gondola/producto, para que se lea claramente como zona caliente.
          paint([acc.hot.events || []], `rgba(255, 24, 20, ${Math.min(0.35, opacity + 0.12)})`, 'rgba(255, 168, 77, 0.16)', 45, opacity * 0.40, 'rgba(41, 98, 255, 0)')
        }
      } else if (!heatmapSrc) {
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
    }

    if (viewMode === 'pickup') {
      pickupEvents.forEach((event) => {
        const px = projectPoint(toExposed(event.x, event.z))
        if (!px) return
        ctx.beginPath()
        ctx.arc(px[0], px[1], 15, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 107, 61, ${Math.max(.22, opacity)})`
        ctx.fill()
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(255,255,255,.92)'
        ctx.stroke()
        {
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

    if (viewMode === 'zones' || (viewMode === 'heatmap' && showZoneBoundaries)) {
      const onHeatmap = viewMode === 'heatmap'
      zones.forEach((zone) => {
        const points = (zone.polygon || []).map(projectPoint).filter(Boolean)
        if (points.length < 3) return
        const [fill, stroke] = zoneStyles[zone.classification] || zoneStyles.normal
        ctx.beginPath()
        ctx.moveTo(...points[0])
        points.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        if (onHeatmap) {
          // Sobre la foto del calor solo interesa el contorno con el nombre; el
          // relleno de color competiria con la escala de calor ya pintada.
          ctx.setLineDash([6, 4])
          ctx.strokeStyle = 'rgba(11,17,26,.85)'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          ctx.fillStyle = fill
          ctx.strokeStyle = stroke
          ctx.lineWidth = 2
          ctx.fill()
          ctx.stroke()
        }
        if (zone.name) {
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
  }, [box, coordinateSystem, coldIntense, heatmapSrc, opacity, pickupEvents, projectionMatrix, result, showColdZones, showHotZones, showZoneBoundaries, time, trajectories, videoEnded, viewMode, zones])

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
        <div className="relative mx-auto bg-black" style={{ height: `min(${box ? `${box.width / videoRatio}px` : '100%'}, 72vh)` }}>
          <video ref={videoRef} src={videoUrl(analysis.id)} playsInline className="block h-full w-full bg-black object-contain" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
          {viewMode === 'heatmap' && !(result.frame_detections || []).length && heatmapSrc && box && <img src={artifactUrl(analysis.id, heatmapSrc)} alt="Densidad acumulada de movimiento sobre la camara" className="pointer-events-none absolute object-fill" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />}
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
        </div>

        {viewMode === 'heatmap' ? (
          <div className="text-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#101722] p-4">
              <span className="text-[11px] text-white/60">Mapa de calor en vivo · corre el video y se acumulan las zonas calientes (interacción) y frías (tránsito)</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-[10px] text-white/80">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff6b3d]" />Zona caliente
                  <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-[#42aac9]" />Zona fría
                </div>
                {zones.length > 0 && (
                  <button className="text-[11px] font-bold text-[#ff6b3d] underline underline-offset-2" onClick={() => setShowZoneBoundaries((value) => !value)}>
                    {showZoneBoundaries ? 'Ocultar' : 'Mostrar'} limites de gondola
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 bg-[#101722] p-4 text-white md:grid-cols-[auto_1fr_auto_auto] md:items-center">
              <div className="flex items-center gap-3">
                <button className="grid h-10 w-10 place-items-center rounded-full border border-[#ff6b3d] bg-[#ff6b3d] text-[13px] font-bold text-white" onClick={() => { const video = videoRef.current; if (!video) return; video.paused ? video.play().catch(() => {}) : video.pause() }}>{playing ? 'II' : '▶'}</button>
                <span className="font-[ui-monospace,monospace] text-[12px]">{formatTime(time)} / {formatTime(duration)}</span>
              </div>
              <input className="w-full accent-[#ff6b3d]" type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} />
              <label className="flex items-center gap-2 text-[11px] text-white/75">Opacidad<input className="w-28 accent-[#ff6b3d]" type="range" min="0.05" max="0.7" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
              <label className="flex items-center gap-2 text-[11px] text-white/75"><input className="accent-[#ff6b3d]" type="checkbox" checked={showHotZones} onChange={(event) => setShowHotZones(event.target.checked)} />Zonas calientes</label>
              <label className="flex items-center gap-2 text-[11px] text-white/75"><input className="accent-[#42aac9]" type="checkbox" checked={showColdZones} onChange={(event) => setShowColdZones(event.target.checked)} />Zonas frías</label>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 border-t border-white/10 bg-[#101722] p-4 text-white md:grid-cols-[auto_1fr_auto_auto] md:items-center">
            <div className="flex items-center gap-3">
              <button className="grid h-10 w-10 place-items-center rounded-full border border-[#ff6b3d] bg-[#ff6b3d] text-[13px] font-bold text-white" onClick={() => { const video = videoRef.current; if (!video) return; video.paused ? video.play().catch(() => {}) : video.pause() }}>{playing ? 'II' : '▶'}</button>
              <span className="font-[ui-monospace,monospace] text-[12px]">{formatTime(time)} / {formatTime(duration)}</span>
            </div>
            <input className="w-full accent-[#ff6b3d]" type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} />
            <label className="flex items-center gap-2 text-[11px] text-white/75">Opacidad<input className="w-28 accent-[#ff6b3d]" type="range" min="0.05" max="0.7" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
            <label className="flex items-center gap-2 text-[11px] text-white/75"><input className="accent-[#ff6b3d]" type="checkbox" checked={showHotZones} onChange={(event) => setShowHotZones(event.target.checked)} />Zonas calientes</label>
            <label className="flex items-center gap-2 text-[11px] text-white/75"><input className="accent-[#42aac9]" type="checkbox" checked={showColdZones} onChange={(event) => setShowColdZones(event.target.checked)} />Zonas frías</label>
          </div>
        )}
        </div>

        <aside className="max-h-[72vh] overflow-y-auto border-t border-white/10 bg-white p-4 xl:border-l xl:border-t-0">
          <div className="mb-5">
            <h3 className="mb-3 text-[11px] font-black uppercase tracking-wide text-[#7d8392]">Metricas principales</h3>
            <div className="grid grid-cols-2 gap-2">
              <Metric icon={<Users size={18} />} label="Personas detectadas" value={liveMetrics.people} />
              <Metric icon={<Clock size={18} />} label="Permanencia promedio" value={`${liveMetrics.avgDwell.toFixed(1)} s`} />
              <Metric icon={<Flame size={18} />} label="Zonas calientes" value={liveMetrics.hotZones} />
              <Metric icon={<MessageCircle size={18} />} label="Interacciones" value={liveMetrics.interactions} />
            </div>
          </div>

          {findings.length > 0 && (
            <div className="mb-5 border-t border-[#e5e7ee] pt-4">
              <h3 className="mb-3 text-[11px] font-black uppercase tracking-wide text-[#7d8392]">Hallazgos clave</h3>
              <ul className="grid gap-2">
                {findings.slice(0, 4).map((finding, index) => (
                  <li key={`${finding.title}-${index}`} className="flex items-start gap-2 text-xs leading-snug text-[#3f4858]">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: findingDotColor[finding.type] || '#ff6b3d' }} />
                    <span>{finding.title}</span>
                  </li>
                ))}
              </ul>
              <a href="#hallazgos" className="mt-3 inline-block text-[11px] font-bold text-[#ff6b3d] hover:underline">Ver recomendaciones →</a>
            </div>
          )}

          <div className="mb-4 flex items-start justify-between gap-3 border-t border-[#e5e7ee] pt-4">
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
            <div className="grid gap-2 pr-1">
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

function Metric({ icon, label, value }) {
  return (
    <article className="flex items-center gap-2 rounded-lg border border-[#e5e7ee] bg-white p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#fff1eb] text-[#ff5b12]">{icon}</span>
      <span className="min-w-0">
        <b className="block truncate text-lg font-black text-[#151323]">{value}</b>
        <span className="block text-[10px] font-bold leading-tight text-[#7d8392]">{label}</span>
      </span>
    </article>
  )
}
