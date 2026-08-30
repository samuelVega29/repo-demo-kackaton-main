import { useEffect, useRef, useState } from 'react'

export default function CameraCalibration({ preview, configuration, onChange, onSave, onCapture, onClose }) {
  const camera = configuration.camera || {}
  const targets = camera.target_meters || [[0, 0], [1, 0], [1, 1], [0, 1]]
  const [points, setPoints] = useState((camera.source_normalized || [[0, 0], [1, 0], [1, 1], [0, 1]]).map((point) => [...point]))
  const [captured, setCaptured] = useState(null)
  const [saving, setSaving] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const drag = useRef(-1)

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
      ctx.fillStyle = 'rgba(4, 10, 8, .5)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const projected = points.map(([nx, ny]) => [nx * canvas.width, ny * canvas.height])
      ctx.beginPath()
      ctx.moveTo(...projected[0])
      projected.slice(1).forEach((point) => ctx.lineTo(...point))
      ctx.closePath()
      ctx.fillStyle = 'rgba(212, 255, 112, .08)'
      ctx.fill()
      ctx.strokeStyle = '#d4ff70'
      ctx.lineWidth = 3
      ctx.stroke()
      projected.forEach(([px, py], index) => {
        ctx.beginPath()
        ctx.arc(px, py, 16, 0, 2 * Math.PI)
        ctx.fillStyle = '#0c1714'
        ctx.fill()
        ctx.strokeStyle = '#61dec0'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.fillStyle = '#61dec0'
        ctx.font = 'bold 16px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`P${index + 1}`, px, py)
      })
    }
    image.src = captured.dataUrl
  }, [captured, points])

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

  const save = async () => {
    const next = { ...configuration, camera: { ...camera, source_normalized: points, calibration_status: 'calibrated' } }
    onChange(next)
    setSaving(true)
    try { if (onSave) await onSave() } finally { setSaving(false) }
  }

  const restore = () => setPoints((camera.source_normalized || [[0, 0], [1, 0], [1, 1], [0, 1]]).map((point) => [...point]))

  return (
    <section className="calibration-panel">
      <div className="calibration-heading">
        <div><span className="eyebrow">CALIBRACIÓN DE CÁMARA · 4 PUNTOS</span><h3>Alinea el piso del video con el plano en metros</h3></div>
        <button className="sheet-close-static" onClick={onClose}>×</button>
      </div>
      <p className="calibration-help">Pausa el video en un momento donde se vean los bordes reales del piso (pasillo o estantería). Captura el frame, luego arrastra cada punto P1…P4 sobre la esquina correspondiente del plano físico de la tienda. Cada punto representa la posición en el video de una esquina del piso configurado.</p>
      {!preview
        ? <div className="calib-empty">Primero selecciona un video MP4 para capturar un frame y calibrar la cámara.</div>
        : <><div className="calibration-grid">
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
      <div className="corner-labels">{targets.map(([x, z], index) => <span key={index}>P{index + 1} → ({x}, {z}) m</span>)}</div>
      <div className="calibration-actions">
        <button onClick={restore}>Restaurar</button>
        <button className="primary-button-inline" onClick={save} disabled={saving || !captured}>{saving ? 'Guardando…' : 'Guardar calibración'}</button>
      </div>
      </>}
    </section>
  )
}