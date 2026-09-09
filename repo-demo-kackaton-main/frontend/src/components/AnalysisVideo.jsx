import { useEffect, useMemo, useRef, useState } from 'react'
import { artifactUrl, getAnalysisHeatmap, getAnalysisTrajectories, getAnalysisZones, videoUrl } from '../services/analyses'
import { inverseHomography, projectFloor } from '../utils/homography'
import { pointInPolygon } from '../utils/floorOutline'
import { formatTime } from '../utils/format'
import usersIcon from '../assets/images/icono_usuarios_3d.png'
import clockIcon from '../assets/images/icon4.png'
import hotIcon from '../assets/images/icono_bombillo_3d.png'
import interactionIcon from '../assets/images/icono_carrito_3d.png'
import cameraIcon from '../assets/images/icono_camara_3d.png'
import robotAnalyst from '../assets/images/analista_robot.png'
import { HEATMAP_CONFIG, accumulateSample, createGrid, normalizeGrid, projectFeetThroughHomography, renderHeatmap } from '../utils/heatmap'

const findingDotColor = { evidence: '#ff7a1a', recommendation: '#22c55e', quality: '#151323' }

const VIEW_MODES = [['original', 'Original'], ['heatmap', 'Mapa de calor'], ['pickup', 'Pick-ups'], ['zones', 'Zonas'], ['trajectories', 'Trayectorias']]
const VIEW_MODE_ICONS = {
  original: 'Video',
  heatmap: 'Calor',
  pickup: 'Pick',
  zones: 'Zonas',
  trajectories: 'Rutas',
}
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

// roundRect no existe en navegadores antiguos; ruta manual equivalente.
function roundedRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  const radius = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export default function AnalysisVideo({ analysis }) {
  const result = analysis.result || {}
  const configuration = result.site?.configuration || {}
  const camera = configuration.camera || {}
  const duration = result.video?.duration_seconds || 0
  const anonymized = Boolean(result.video?.anonymized)
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

  // Métricas del video dinamicas: se recalculan segun el instante actual del video.
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
        // Misma clasificacion que dibuja los circulos calientes del mapa: solo
        // interacciones reales (mano tocando el producto), no aproximaciones.
        const state = detection.state || 'PASS'
        if (detection.floor_point && state === 'INTERACTION') {
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

  // Acumulador en vivo del mapa de calor:
  // - Capa fría (tráfico): rejilla por kernel, un voto por track por frame en el
  //   punto de los pies de la caja. Al hacer seek hacia atrás se rellena desde 0
  //   hasta el tiempo actual para que el resultado sea siempre la densidad real.
  // - Capa caliente: solo activaciones confirmadas de góndola (interacción real
  //   o pick-up), dibujadas en la zona exacta donde ocurren.
  const trafficGridRef = useRef(null)
  const trafficToTimeRef = useRef(-1)
  const trafficFromIndexRef = useRef(0)
  const heatAccum = useRef({ events: [] })

  const buildLiveHeatmap = (until) => {
    const samples = result.frame_detections || []
    const videoW = result.video?.width || 1
    const videoH = result.video?.height || 1
    // La homografía proyecta al plano del piso en METROS: la rejilla se indexa
    // normalizada contra el piso real del sitio (mismo criterio que el backend,
    // backend/app/cv/heatmaps.py -> x/floor.width, z/floor.depth).
    const siteFloor = result.site?.configuration?.floor || {}
    const floorW = Number(siteFloor.width) || HEATMAP_CONFIG.FLOOR_WIDTH
    const floorD = Number(siteFloor.depth) || HEATMAP_CONFIG.FLOOR_DEPTH
    const gridConfig = { ...HEATMAP_CONFIG, FLOOR_WIDTH: floorW, FLOOR_DEPTH: floorD }
    if (!trafficGridRef.current) trafficGridRef.current = createGrid(gridConfig)
    // Scrubber hacia atrás: reinicia la rejilla para ser fiel al instante actual.
    if (until < trafficToTimeRef.current) {
      trafficGridRef.current.fill(0)
      trafficFromIndexRef.current = 0
      trafficToTimeRef.current = -1
    }
    let index = trafficFromIndexRef.current
    while (index < samples.length && samples[index].timestamp <= until) {
      const sample = samples[index]
      for (const detection of sample.detections || []) {
        const state = detection.state || 'PASS'
        // Las interacciones reales no van a la rejilla de tráfico: van a la
        // capa caliente dibujada como punto rojo en la zona activada.
        if (state === 'INTERACTION') continue
        let point = null
        const bbox = detection.bbox
        // Acepta bbox tanto como array [x1,y1,x2,y2] como objeto
        // {x1/y1/x2/y2}, según cómo lo devuelva el backend de cada modo.
        const box =
          bbox && Array.isArray(bbox)
            ? bbox
            : bbox && [bbox.x1 ?? bbox.left ?? bbox[0], bbox.y1 ?? bbox.top ?? bbox[1], bbox.x2 ?? bbox.right ?? bbox[2], bbox.y2 ?? bbox.bottom ?? bbox[3]]
        if (box && box[3] != null) {
          // Punto de los pies: extremo inferior-central de la caja (spec §2).
          // Con homografía real se proyecta al plano del piso (spec §4);
          // si no, se acumula en coordenadas de imagen normalizadas.
          const hasRealHomography = camera?.homography && coordinateSystem !== 'normalized'
          point = hasRealHomography
            ? projectFeetThroughHomography(box, videoW, videoH, camera.homography, gridConfig)
            : [((box[0] + box[2]) / 2) / videoW, box[3] / videoH]
        } else if (detection.floor_point) {
          point = coordinateSystem === 'normalized'
            ? detection.floor_point
            : [detection.floor_point[0] / floorW, detection.floor_point[1] / floorD]
        }
        accumulateSample(trafficGridRef.current, point, gridConfig)
      }
      index++
    }
    trafficFromIndexRef.current = index
    trafficToTimeRef.current = until

    // Puntos calientes (activaciones de góndola) ocurridos hasta el instante
    // actual: interacción/pick-up real, señal de contacto con la góndola.
    const hotEvents = []
    const eventSources = [...(result.pickup_events_log || []), ...(result.interaction_events_log || [])]
    for (const event of eventSources) {
      if (typeof event.t !== 'number' || event.t > until) continue
      if (typeof event.x === 'number' && typeof event.z === 'number') hotEvents.push(toExposed(event.x, event.z))
    }
    heatAccum.current.events = hotEvents
  }

  const collectLiveHeat = (until) => {
    buildLiveHeatmap(until)
    return heatAccum.current
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
        // Capa fria (toggle "Tráfico"): densidad de trafico por rejilla. Un voto
        // por track por frame en el punto de los pies, kernel 1.0/0.45, escala
        // pintada con percentil 99 + gamma y rampa azul->rojo (ver utils/heatmap).
        if (showColdZones) {
          const grid = normalizeGrid(trafficGridRef.current, HEATMAP_CONFIG)
          // El slider de opacidad del video y el realce al terminar el clip
          // siguen siendo visibles sin tocar la acumulacion.
          const alphaScale = (0.4 + opacity) * (coldIntense ? 1.15 : 1)
          renderHeatmap(ctx, grid, { x: 0, y: 0, width: rect.width, height: rect.height }, HEATMAP_CONFIG, alphaScale)
        }
        // Capa caliente (toggle "Activación"): SOLO cuando una gondola se activa
        // (interaccion o pick-up real, t <= instante actual). La zona exacta del
        // contacto se marca con un anillo rojo brillante; fuera de esos momen·,
        // no se dibuja nada aqui.
        if (showHotZones && acc.events.length) {
          for (const point of acc.events) {
            const px = projectPoint(point)
            if (!px) continue
            const radius = 17
            const glow = ctx.createRadialGradient(px[0], px[1], 0, px[0], px[1], radius + 14)
            glow.addColorStop(0, `rgba(255, 24, 20, ${Math.min(0.9, opacity + 0.45)})`)
            glow.addColorStop(1, 'rgba(255, 24, 20, 0)')
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(px[0], px[1], radius + 14, 0, Math.PI * 2)
            ctx.fill()
            ctx.beginPath()
            ctx.arc(px[0], px[1], 6, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,255,255,.95)'
            ctx.fill()
          }
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
          roundedRectPath(ctx, px[0] - width / 2, px[1] - 42, width, 26, 8)
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
          roundedRectPath(ctx, x - width / 2, y - 14, width, 28, 8)
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
    <section id="video-analisis" className="scroll-mt-24 rounded-3xl border border-[#dbe7f3] bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_52%,#fff4ec_100%)] p-4 shadow-[0_28px_80px_-60px_rgba(21,19,35,.65)] sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-medium tracking-[.17em] text-[#ff7a1a]">VIDEO INTERACTIVO</span>
          <div className="mt-[9px] flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-[-.045em] text-[#151323]">Explora el video</h2>
            {anonymized && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">Rostros censurados</span>}
          </div>
          <p className="mt-2 text-sm text-slate-500">Reproduce la grabación y elige una capa para entender lo que ocurre en cada zona.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="tablist">
          {VIEW_MODES.map(([value, label]) => (
            <button key={value} role="tab" aria-selected={viewMode === value} className={`group inline-flex min-h-[42px] items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-black transition hover:-translate-y-0.5 ${viewMode === value ? 'border-[#ff7a1a] bg-[#ff7a1a] text-white shadow-[0_16px_34px_-22px_rgba(255,122,26,.95)]' : 'border-[#e5e7ee] bg-white text-slate-600 hover:border-[#ff7a1a]/50 hover:bg-[#fff4ec] hover:text-[#cf4921]'}`} onClick={() => setViewMode(value)}><span className={`grid h-6 min-w-8 place-items-center rounded-md px-1.5 text-[8px] ${viewMode === value ? 'bg-white/18 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-[#cf4921]'}`}>{VIEW_MODE_ICONS[value]}</span>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-[#dbe5f0] bg-[#05070a] shadow-[0_24px_72px_-54px_rgba(4,12,22,.9)] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
        <div className="relative mx-auto bg-black" style={{ height: `min(${box ? `${box.width / videoRatio}px` : '100%'}, 72vh)` }}>
          <video ref={videoRef} src={videoUrl(analysis.id)} playsInline className="block h-full w-full bg-black object-contain" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} />
          {viewMode === 'heatmap' && !(result.frame_detections || []).length && heatmapSrc && box && <img src={artifactUrl(analysis.id, heatmapSrc)} alt="Densidad acumulada de movimiento sobre la camara" className="pointer-events-none absolute object-fill" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />}
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
        </div>

        {viewMode === 'heatmap' ? (
          <div className="text-[#151323]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7ee] bg-white p-4">
              <span className="text-[11px] text-slate-500">Mapa de calor en vivo · corre el video y se acumulan las zonas calientes (interacción) y frías (tránsito)</span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-[10px] text-slate-600">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff7a1a]" />Zona caliente
                  <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-[#42aac9]" />Zona fría
                </div>
                {zones.length > 0 && (
                  <button className="text-[11px] font-medium text-[#ff7a1a] underline underline-offset-2" onClick={() => setShowZoneBoundaries((value) => !value)}>
                    {showZoneBoundaries ? 'Ocultar' : 'Mostrar'} limites de gondola
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-3 bg-white p-4 text-[#151323] md:grid-cols-[auto_minmax(120px,1fr)] 2xl:grid-cols-[auto_minmax(120px,1fr)_auto] md:items-center">
              <div className="flex items-center gap-3">
                <button className="grid h-10 w-10 place-items-center rounded-full border border-[#ff7a1a] bg-[#ff7a1a] text-[13px] font-medium text-white" aria-label={playing ? 'Pausar video' : 'Reproducir video'} onClick={() => { const video = videoRef.current; if (!video) return; video.paused ? video.play().catch(() => {}) : video.pause() }}>{playing ? 'II' : '▶'}</button>
                <span className="text-[12px]">{formatTime(time)} / {formatTime(duration)}</span>
              </div>
              <input className="w-full accent-[#ff7a1a]" aria-label="Posición del video" type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} />
              <label className="flex items-center gap-2 text-[11px] text-slate-600">Opacidad<input className="w-28 accent-[#ff7a1a]" type="range" min="0.05" max="0.7" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
              <label className="flex items-center gap-2 text-[11px] text-slate-600"><input className="accent-[#ff7a1a]" type="checkbox" checked={showHotZones} onChange={(event) => setShowHotZones(event.target.checked)} />Zonas calientes</label>
              <label className="flex items-center gap-2 text-[11px] text-slate-600"><input className="accent-[#42aac9]" type="checkbox" checked={showColdZones} onChange={(event) => setShowColdZones(event.target.checked)} />Zonas frías</label>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 border-t border-[#e5e7ee] bg-white p-4 text-[#151323] md:grid-cols-[auto_minmax(120px,1fr)] 2xl:grid-cols-[auto_minmax(120px,1fr)_auto] md:items-center">
            <div className="flex items-center gap-3">
              <button className="grid h-10 w-10 place-items-center rounded-full border border-[#ff7a1a] bg-[#ff7a1a] text-[13px] font-medium text-white" aria-label={playing ? 'Pausar video' : 'Reproducir video'} onClick={() => { const video = videoRef.current; if (!video) return; video.paused ? video.play().catch(() => {}) : video.pause() }}>{playing ? 'II' : '▶'}</button>
              <span className="text-[12px]">{formatTime(time)} / {formatTime(duration)}</span>
            </div>
            <input className="w-full accent-[#ff7a1a]" aria-label="Posición del video" type="range" min="0" max={Math.max(1, duration)} step="0.1" value={Math.min(time, duration)} onChange={(event) => seek(Number(event.target.value))} />
            <label className="flex items-center gap-2 text-[11px] text-slate-600">Opacidad<input className="w-28 accent-[#ff7a1a]" type="range" min="0.05" max="0.7" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
            <label className="flex items-center gap-2 text-[11px] text-slate-600"><input className="accent-[#ff7a1a]" type="checkbox" checked={showHotZones} onChange={(event) => setShowHotZones(event.target.checked)} />Zonas calientes</label>
            <label className="flex items-center gap-2 text-[11px] text-slate-600"><input className="accent-[#42aac9]" type="checkbox" checked={showColdZones} onChange={(event) => setShowColdZones(event.target.checked)} />Zonas frías</label>
          </div>
        )}
        </div>

        <aside className="max-h-[85vh] overflow-y-auto border-t border-[#d9e6f2] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_48%,#fff7ef_100%)] p-4 xl:border-l xl:border-t-0">
          <div className="mb-5 overflow-hidden rounded-2xl border border-[#dbe7f3] bg-[#111827] text-white shadow-[0_22px_55px_-42px_rgba(17,24,39,.95)]">
            <div className="relative min-h-[126px] p-4">
              <img src={robotAnalyst} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-4 right-0 h-36 w-36 object-contain opacity-95" />
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-[#ffd7a8]">
                <img src={cameraIcon} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                lectura visual
              </span>
              <h3 className="relative z-10 mt-4 max-w-[190px] text-xl font-black leading-tight">Interacciones sobre el video</h3>
              <p className="relative z-10 mt-2 max-w-[190px] text-xs leading-5 text-white/72">Filtra eventos y salta al segundo donde ocurrio cada contacto.</p>
            </div>
          </div>

          <div className="mb-5">
            <h3 className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-500">Métricas del video</h3>
            <div className="grid grid-cols-2 gap-2">
              <Metric tone="green" icon={usersIcon} label="Personas detectadas" value={liveMetrics.people} />
              <Metric tone="orange" icon={clockIcon} label="Permanencia promedio" value={`${liveMetrics.avgDwell.toFixed(1)} s`} />
              <Metric tone="amber" icon={hotIcon} label="Zonas calientes" value={liveMetrics.hotZones} />
              <Metric tone="blue" icon={interactionIcon} label="Interacciones" value={liveMetrics.interactions} />
            </div>
          </div>

          {findings.length > 0 && (
            <div className="mb-5 border-t border-[#e5e7ee] pt-4">
              <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">Hallazgos clave</h3>
              <ul className="grid gap-2">
                {findings.slice(0, 4).map((finding, index) => (
                  <li key={`${finding.title}-${index}`} className="flex items-start gap-2 text-xs leading-snug text-slate-600">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: findingDotColor[finding.type] || '#ff7a1a' }} />
                    <span>{finding.title}</span>
                  </li>
                ))}
              </ul>
              <a href="#hallazgos" className="mt-3 inline-block text-[11px] font-medium text-[#ff7a1a] hover:underline">Ver recomendaciones →</a>
            </div>
          )}

          <div className="mb-4 flex items-start justify-between gap-3 border-t border-[#e5e7ee] pt-4">
            <div>
              <h3 className="text-lg font-black text-[#151323]">Eventos detectados</h3>
              <p className="mt-1 text-xs text-slate-500">Cada tarjeta abre el momento exacto en el video.</p>
            </div>
            <b className="rounded-full bg-[#fff1eb] px-3 py-1 text-[11px] text-[#ff7a1a]">{pickupEvents.length} pick-ups</b>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-[#e5e7ee] bg-white p-1 shadow-[0_14px_34px_-30px_rgba(21,19,35,.7)]">
            {['all', 'pickup', 'interaction'].map((value) => <button key={value} className={`rounded-lg px-2 py-2 text-[10px] font-black transition ${eventFilter === value ? 'bg-[#ff7a1a] text-white shadow-[0_12px_26px_-18px_rgba(255,122,26,.9)]' : 'bg-transparent text-slate-500 hover:bg-[#fff4ec] hover:text-[#cf4921]'}`} onClick={() => setEventFilter(value)}>{value === 'all' ? 'Todos' : value === 'pickup' ? 'Pick-ups' : 'Interacciones'}</button>)}
          </div>
          {visibleEvents.length ? (
            <div className="relative grid gap-3 pr-1 before:absolute before:bottom-4 before:left-[18px] before:top-4 before:w-px before:bg-[#ffd4bd]">
              {visibleEvents.map((event, index) => {
                const isPickup = pickupEvents.includes(event)
                return (
                  <button key={`${event.t}-${event.track_id}-${index}`} className={`group relative ml-9 rounded-2xl border bg-white p-3 text-left shadow-[0_18px_44px_-36px_rgba(21,19,35,.8)] transition hover:-translate-y-0.5 ${isPickup ? 'border-[#ffd1bb] hover:border-[#ff7a1a]' : 'border-[#cfe4ff] hover:border-[#1f6feb]'}`} onClick={() => jumpToEvent(event)}>
                    <span className={`absolute -left-[31px] top-4 grid h-5 w-5 place-items-center rounded-full border-2 border-white shadow-md ${isPickup ? 'bg-[#ff7a1a]' : 'bg-[#1f6feb]'}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <b className={`rounded-lg px-2.5 py-1 text-sm ${isPickup ? 'bg-[#fff1eb] text-[#ff7a1a]' : 'bg-[#eef5ff] text-[#1f6feb]'}`}>{formatTime(event.t || 0)}</b>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${isPickup ? 'bg-[#ff7a1a] text-white' : 'bg-[#1f6feb] text-white'}`}>{isPickup ? 'Pick-up' : 'Interaccion'}</span>
                    </div>
                    <p className="mt-3 text-sm font-black leading-snug text-[#151323]">{event.product || event.gondola_name || `Track ${event.track_id}`}</p>
                    <span className={`mt-3 inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black transition group-hover:translate-x-1 ${isPickup ? 'bg-[#fff7ed] text-[#cf4921]' : 'bg-[#eff6ff] text-[#1f6feb]'}`}>Ver momento</span>
                    {typeof event.row !== 'undefined' && typeof event.column !== 'undefined' && <p className="mt-1 text-[11px] text-slate-500">Nivel {event.row + 1} · Seccion {event.column + 1}</p>}
                  </button>
                )
              })}
            </div>
          ) : <p className="rounded-lg border border-dashed border-[#e5e7ee] bg-slate-100 p-4 text-sm text-slate-500">Este analisis no reporto eventos de pick-up o interaccion.</p>}
        </aside>
      </div>
    </section>
  )
}

function Metric({ icon, label, value, tone }) {
  const tones = {
    green: 'border-[#bfe8d1] bg-[#f4fff8] text-[#12824c]',
    orange: 'border-[#fed7aa] bg-[#fff7ed] text-[#cf4921]',
    amber: 'border-[#fde68a] bg-[#fffbeb] text-[#b45309]',
    blue: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1f6feb]',
  }

  return (
    <article className={`group relative flex min-h-[108px] items-center gap-3 overflow-hidden rounded-xl border p-3 shadow-[0_14px_34px_-30px_rgba(21,19,35,.65)] transition hover:-translate-y-0.5 ${tones[tone] || tones.orange}`}>
      <span className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full bg-white/70" />
      <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white shadow-[0_14px_28px_-22px_rgba(21,19,35,.5)]">
        <img className="h-10 w-10 object-contain transition group-hover:scale-110" src={icon} alt="" aria-hidden="true" />
      </span>
      <span className="relative min-w-0">
        <b className="block truncate text-xl font-black tabular-nums text-[#151323]">{value}</b>
        <span className="block text-xs font-bold leading-snug text-slate-600">{label}</span>
      </span>
    </article>
  )
}
