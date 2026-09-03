import { useEffect, useRef, useState } from 'react'
import { solveHomography, projectFloor } from '../../lib/homography'
import LiveAlignment, { MiniMap } from './LiveAlignment'

const CORNERS = (floor) => [[0, 0], [floor.width ?? 1, 0], [floor.width ?? 1, floor.depth ?? 1], [0, floor.depth ?? 1]]

function snapToSide([x, z], width, depth) {
  const candidates = [
    { dim: 'x', value: 0, norm: x / width },
    { dim: 'x', value: width, norm: (width - x) / width },
    { dim: 'z', value: 0, norm: z / depth },
    { dim: 'z', value: depth, norm: (depth - z) / depth },
  ]
  const best = candidates.reduce((a, b) => (b.norm < a.norm ? b : a))
  if (best.dim === 'z') return [Math.min(width, Math.max(0, x)), best.value]
  return [best.value, Math.min(depth, Math.max(0, z))]
}

export default function CameraCalibration({ preview, frameCapture, configuration, onChange, onSave, onCapture, onClose }) {
  const floor = configuration.floor || {}
  const camera = configuration.camera || {}
  const cornerTargets = CORNERS(floor)
  const [points, setPoints] = useState((camera.source_normalized || [[0, 0], [1, 0], [1, 1], [0, 1]]).map((point) => [...point]))
  const hasExtra = points.length >= 5
  const forward4 = points.length >= 4
    ? solveHomography(points.slice(0, 4).map(([nx, ny], index) => [nx, ny, cornerTargets[index][0], cornerTargets[index][1]]))
    : null
  const rawExtraFloor = (hasExtra && forward4) ? projectFloor(forward4, points[4][0], points[4][1]) : null
  const extraFloor = rawExtraFloor ? snapToSide(rawExtraFloor, floor.width, floor.depth) : null
  const targets = hasExtra && extraFloor ? [...cornerTargets, [extraFloor[0], extraFloor[1]]] : cornerTargets
  const [captured, setCaptured] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState({ kind: 'idle', text: '' })
  const [selectedId, setSelectedId] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const drag = useRef(-1)

  const pairsForHomography = (hasExtra && extraFloor)
    ? targets.map(([tx, tz], index) => [tx, tz, points[index][0], points[index][1]])
    : cornerTargets.map(([tx, tz], index) => [tx, tz, points[index][0], points[index][1]])
  const homography = points.length >= 4 ? solveHomography(pairsForHomography) : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !captured) return
    const ctx = canvas.getContext('2d')
    canvas.width = captured.width
    canvas.height = captured.height
    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(4, 10, 8, .38)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const toPx = (x, z) => {
        const normalized = projectFloor(homography, x, z)
        if (!normalized) return null
        return [normalized[0] * canvas.width, normalized[1] * canvas.height]
      }

      if (homography) {
        const gridStep = Math.max(0.5, Math.round(Math.max(1, Math.max(floor.width || 1, floor.depth || 1) / 12)) )
        ctx.strokeStyle = 'rgba(212, 255, 112, .22)'
        ctx.lineWidth = 1
        for (let gx = 0; gx <= (floor.width || 1) + 1e-6; gx += gridStep) {
          const a = toPx(gx, 0)
          const b = toPx(gx, floor.depth || 1)
          if (!a || !b) continue
          ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
        }
        for (let gz = 0; gz <= (floor.depth || 1) + 1e-6; gz += gridStep) {
          const a = toPx(0, gz)
          const b = toPx(floor.width || 1, gz)
          if (!a || !b) continue
          ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
        }
      }

      ;(configuration.gondolas || []).forEach((gondola) => {
        const color = gondola.color || '#61dec0'
        const corners = [[gondola.x, gondola.z], [gondola.x + gondola.width, gondola.z], [gondola.x + gondola.width, gondola.z + gondola.depth], [gondola.x, gondola.z + gondola.depth]]
        const pixels = corners.map(([x, z]) => toPx(x, z)).filter(Boolean)
        if (pixels.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...pixels[0])
        pixels.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = hexToRgba(color, .18)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.stroke()
        if (gondola.name) {
          ctx.fillStyle = 'rgba(6, 14, 12, .8)'
          ctx.fillRect(pixels[0][0], pixels[0][1] - 22, ctx.measureText(gondola.name).width + 16, 20)
          ctx.fillStyle = '#e8f2ed'
          ctx.font = '11px ui-monospace, monospace'
          ctx.fillText(gondola.name, pixels[0][0] + 8, pixels[0][1] - 7)
        }
      })

      if (homography) {
        const outline = [[0, 0], [floor.width || 0, 0], [floor.width || 0, floor.depth || 0], [0, floor.depth || 0]]
        const outlinePx = outline.map(([x, z]) => toPx(x, z)).filter(Boolean)
        if (outlinePx.length === 4) {
          ctx.beginPath()
          ctx.moveTo(...outlinePx[0])
          outlinePx.slice(1).forEach((point) => ctx.lineTo(...point))
          ctx.closePath()
          ctx.strokeStyle = 'rgba(126, 154, 143, .85)'
          ctx.lineWidth = 3
          ctx.setLineDash([10, 8])
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      const projected = targets.map(([tx, tz]) => {
        const normalized = projectFloor(homography, tx, tz)
        return normalized ? [normalized[0] * canvas.width, normalized[1] * canvas.height] : null
      })
      projected.forEach((point, index) => {
        if (!point) return
        const [px, py] = point
        const isExtra = index >= 4
        ctx.beginPath()
        ctx.arc(px, py, isExtra ? 13 : 16, 0, 2 * Math.PI)
        ctx.fillStyle = '#0c1714'
        ctx.fill()
        ctx.strokeStyle = isExtra ? '#ff9ecb' : '#d4ff70'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.fillStyle = isExtra ? '#ff9ecb' : '#d4ff70'
        ctx.font = 'bold 16px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`P${index + 1}`, px, py)
      })
    }
    image.src = captured.dataUrl
  }, [captured, points, configuration, homography, floor.width, floor.depth])

  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setCaptured({ dataUrl, width, height })
    if (onCapture) onCapture(dataUrl, width, height)
  }

  const toNormalized = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
  }

  const pointerDown = (event) => {
    const point = toNormalized(event)
    let best = -1
    let bestDistance = 0.085
    points.forEach((candidate, index) => {
      const distance = Math.hypot(candidate[0] - point[0], candidate[1] - point[1])
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    if (best < 0) return
    drag.current = best
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pointerMove = (event) => {
    if (drag.current < 0) return
    const point = toNormalized(event)
    const clamped = [Math.min(1, Math.max(0, point[0])), Math.min(1, Math.max(0, point[1]))]
    setPoints((current) => current.map((item, index) => (index === drag.current ? clamped : item)))
  }

  const release = () => { drag.current = -1 }

  const addExtraPoint = () => {
    if (hasExtra) return
    const floorPoint = [floor.width ?? 1, (floor.depth ?? 1) / 2]
    const fallbackNormalized = projectFloor(homography, floorPoint[0], floorPoint[1]) || [0.9, 0.5]
    setPoints((current) => [...current, [Math.min(1, Math.max(0, fallbackNormalized[0])), Math.min(1, Math.max(0, fallbackNormalized[1]))]])
  }

  const removeExtraPoint = () => {
    if (!hasExtra) return
    setPoints((current) => current.slice(0, 4))
  }

  const save = async () => {
    const targetMeters = hasExtra && extraFloor ? [...cornerTargets, [extraFloor[0], extraFloor[1]]] : cornerTargets
    const next = { ...configuration, camera: { ...camera, source_normalized: points, target_meters: targetMeters, calibration_status: 'calibrated' } }
    onChange(next)
    setSaving(true)
    setSaveState({ kind: 'idle', text: '' })
    try {
      if (onSave) await onSave(next)
      setSaveState({ kind: 'ok', text: 'Calibración guardada' })
    } catch (error) {
      setSaveState({ kind: 'error', text: error.message || 'No se pudo guardar la calibración' })
    } finally {
      setSaving(false)
    }
  }

  const restore = () => setPoints((camera.source_normalized || [[0, 0], [1, 0], [1, 1], [0, 1]]).map((point) => [...point]))

  const updateGondola = (id, values) => {
    onChange({
      ...configuration,
      gondolas: (configuration.gondolas || []).map((gondola) => (gondola.id === id ? { ...gondola, ...values } : gondola)),
    })
  }

  return (
    <section className="calibration-panel">
      <div className="calibration-heading">
        <div><span className="eyebrow">CALIBRACIÓN DE CÁMARA · {points.length} PUNTOS</span><h3>Alinea el piso del video con el plano en metros</h3></div>
        <button className="sheet-close-static" onClick={onClose}>×</button>
      </div>
      <p className="calibration-help">Pausa el video donde se vea el pasillo completo y captura el frame. Luego arrastra P1…·P{Math.max(4, points.length)} a las esquinas del piso real en el video:<b> P1</b> esquina superior-izquierda · <b>P2</b> superior-derecha · <b>P3</b> fondo-derecha · <b>P4</b> fondo-izquierda. Si la cámara necesita un punto extra, añade P5 y arrástralo <b>hacia un lado</b> del piso: se fija automáticamente a ese borde y te deja deslizarlo a lo largo de él para afinar la homografía en tiempo real.</p>
      {!preview
        ? <div className="calib-empty">Primero selecciona un video MP4 para capturar un frame y calibrar la cámara.</div>
        : <>      <div className="calibration-grid">
        <div className="calibration-stage">
          <video ref={videoRef} src={preview} controls muted playsInline />
          <button className="capture-frame" onClick={capture}>＋ Capturar frame</button>
        </div>
        <div className="calibration-canvas-wrap">
          {captured
            ? <canvas ref={canvasRef} className="calib-canvas" style={{ width: '100%', aspectRatio: `${captured.width}/${captured.height}` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={release} onPointerCancel={release} />
            : <div className="calib-empty">Captura un frame para comenzar</div>}
        </div>
      </div>
      <div className="live-alignment">
        <div className="live-col">
          <span className="live-label">PLANO 2D · VIDEO REAL</span>
          <LiveAlignment frameCapture={frameCapture} configuration={configuration} interactive onMoveGondola={updateGondola} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="live-col">
          <span className="live-label">MAPA · VISTA SUPERIOR</span>
          <MiniMap configuration={configuration} interactive onMoveGondola={updateGondola} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
      <div className="corner-labels">{targets.map(([x, z], index) => <span key={index}>P{index + 1} → ({x}, {z}) m</span>)}</div>
      <div className="calibration-points-control">
        <button onClick={addExtraPoint} disabled={hasExtra}>＋ Añadir punto extra (P{points.length + 1})</button>
        {hasExtra && <button onClick={removeExtraPoint}>－ Quitar punto extra</button>}
      </div>
      {saveState.kind === 'ok' && <div className="calib-status ok">{saveState.text}</div>}
      {saveState.kind === 'error' && <div className="calib-status error">{saveState.text}</div>}
      <div className="calibration-actions">
        <button onClick={restore}>Restaurar</button>
        <button className="primary-button-inline" onClick={save} disabled={saving || !captured}>{saving ? 'Guardando…' : 'Guardar calibración'}</button>
      </div>
      </>}
    </section>
  )
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return `rgba(97, 222, 192, ${alpha})`
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}
