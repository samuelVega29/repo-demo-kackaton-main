import { useEffect, useRef, useState } from 'react'
import { gondolaCorners, solveHomography, projectFloor } from '../../utils/homography'

export default function CameraCalibration({ preview, configuration, onChange, onSave, onCapture, onClose, externalCapture }) {
  const floor = configuration.floor || {}
  const camera = configuration.camera || {}
  const targets = camera.target_meters || [[0, 0], [floor.width ?? 1, 0], [floor.width ?? 1, floor.depth ?? 1], [0, floor.depth ?? 1]]
  const [points, setPoints] = useState((camera.source_normalized || [[0, 0], [1, 0], [1, 1], [0, 1]]).map((point) => [...point]))
  // Snapshot of the calibration as it was when this panel opened — compared against at save
  // time so we can warn if it changed while gondolas already exist (their x/z meters were
  // computed under the OLD calibration, so a new one silently misaligns them from the video).
  const openedWithRef = useRef(camera.source_normalized ? camera.source_normalized.map((point) => [...point]) : null)
  const [internalCaptured, setInternalCaptured] = useState(null)
  // When a frame is captured in a dedicated window (externalCapture), reuse it instead of
  // taking a new one here — keeps the "tomar frame" step explicit and shared across panels.
  const captured = externalCapture || internalCaptured
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState({ kind: 'idle', text: '' })
  // Crop info state
  const [cropInfo, setCropInfo] = useState(camera.crop_info || null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const drag = useRef(-1)

  const homography = (targets.length === 4 && points.length === 4)
    ? solveHomography(targets.map(([tx, tz], index) => [tx, tz, points[index][0], points[index][1]]))
    : null

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
        const gridStep = Math.max(0.5, Math.round(Math.max(1, Math.max(floor.width || 1, floor.depth || 1) / 12)))
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

      ; (configuration.gondolas || []).forEach((gondola) => {
        const corners = gondolaCorners(gondola)
        const pixels = corners.map(([x, z]) => toPx(x, z)).filter(Boolean)
        if (pixels.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...pixels[0])
        pixels.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = 'rgba(97, 222, 192, .18)'
        ctx.fill()
        ctx.strokeStyle = '#61dec0'
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

      const projected = points.map(([nx, ny]) => [nx * canvas.width, ny * canvas.height])
      projected.forEach(([px, py], index) => {
        ctx.beginPath()
        ctx.arc(px, py, 16, 0, 2 * Math.PI)
        ctx.fillStyle = '#0c1714'
        ctx.fill()
        ctx.strokeStyle = '#d4ff70'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.fillStyle = '#d4ff70'
        ctx.font = 'bold 16px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`P${index + 1}`, px, py)
      })
    }
    image.src = captured.dataUrl
  }, [captured, points, configuration, homography])

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

    // Detect black bars in the captured frame
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = width
    sourceCanvas.height = height
    const sctx = sourceCanvas.getContext('2d')
    sctx.drawImage(video, 0, 0, width, height)
    const imageData = sctx.getImageData(0, 0, width, height)
    const bars = detectBarsInImage(imageData, width, height)
    setCropInfo((prev) => prev || bars)

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setInternalCaptured({ dataUrl, width, height })
    if (onCapture) onCapture(dataUrl, width, height)
  }

  // Helper to detect black bars from ImageData pixel data
  const detectBarsInImage = (imageData, width, height) => {
    const data = imageData.data
    const threshold = 20 // intensity threshold
    const minBarRatio = 0.02

    // Row means (average brightness per row)
    const rowMeans = new Array(height).fill(0)
    for (let y = 0; y < height; y++) {
      let sum = 0
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      }
      rowMeans[y] = sum / width
    }

    // Col means
    const colMeans = new Array(width).fill(0)
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      }
      colMeans[x] = sum / height
    }

    // Detect top/bottom bars
    let top = 0
    for (let y = 0; y < height; y++) {
      if (rowMeans[y] > threshold) { top = y; break }
    }
    let bottom = height
    for (let y = height - 1; y >= 0; y--) {
      if (rowMeans[y] > threshold) { bottom = y + 1; break }
    }

    // Detect left/right bars
    let left = 0
    for (let x = 0; x < width; x++) {
      if (colMeans[x] > threshold) { left = x; break }
    }
    let right = width
    for (let x = width - 1; x >= 0; x--) {
      if (colMeans[x] > threshold) { right = x + 1; break }
    }

    const minBarPxH = height * minBarRatio
    const minBarPxW = width * minBarRatio
    const hasTop = top > minBarPxH
    const hasBottom = (height - bottom) > minBarPxH
    const hasLeft = left > minBarPxW
    const hasRight = (width - right) > minBarPxW

    return {
      top: hasTop ? top : 0,
      bottom: hasBottom ? height - bottom : 0,
      left: hasLeft ? left : 0,
      right: hasRight ? width - right : 0,
      content_width: right - left,
      content_height: bottom - top,
      has_bars: hasTop || hasBottom || hasLeft || hasRight,
    }
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
    const next = {
      ...configuration,
      camera: {
        ...camera,
        source_normalized: points,
        calibration_status: 'calibrated',
        crop_info: cropInfo || undefined,
      },
    }
    const gondolaCount = (configuration.gondolas || []).length
    const calibrationMoved = openedWithRef.current && JSON.stringify(openedWithRef.current) !== JSON.stringify(points)
    onChange(next)
    setSaving(true)
    setSaveState({ kind: 'idle', text: '' })
    try {
      if (onSave) await onSave(next)
      openedWithRef.current = points.map((point) => [...point])
      setSaveState(calibrationMoved && gondolaCount > 0
        ? { kind: 'warn', text: `Moviste los 4 puntos con ${gondolaCount} góndola${gondolaCount === 1 ? '' : 's'} ya definida${gondolaCount === 1 ? '' : 's'} — sus posiciones se calcularon con la calibración anterior y pueden haber quedado desalineadas. Revisá "Verificar alineación" en la pantalla de subida.` }
        : { kind: 'ok', text: 'Calibración guardada' })
    } catch (error) {
      setSaveState({ kind: 'error', text: error.message || 'No se pudo guardar la calibración' })
    } finally {
      setSaving(false)
    }
  }

  const restore = () => setPoints((camera.source_normalized || [[0, 0], [1, 0], [1, 1], [0, 1]]).map((point) => [...point]))

  return (
    <section className="m-0 border-0 p-0">
      <div className="flex items-start justify-between gap-[18px]">
        <div><span className="text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">CALIBRACIÓN DE CÁMARA · 4 PUNTOS</span><h3 className="mt-2 text-[22px] tracking-[-.03em]">Alinea el piso del video con el plano en metros</h3></div>
        <button className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[rgba(206,236,221,.14)] bg-[#172720] text-[15px] text-[#dbe8e2]" onClick={onClose}>×</button>
      </div>
      <p className="mx-0 my-[14px] mb-[18px] max-w-[720px] text-[10px] leading-[1.65] text-[#71867e]">Pausa el video donde se vea el pasillo completo y captura el frame. Luego arrastra P1…·P4 a las esquinas del piso real en el video:<b> P1</b> esquina superior-izquierda · <b>P2</b> superior-derecha · <b>P3</b> fondo-derecha · <b>P4</b> fondo-izquierda. Cuanto más separados queden los puntos, mejor se ajusta la perspectiva; la rejilla y las góndolas proyectadas confirman el mapeo en vivo.</p>
      {!preview
        ? <div className="px-5 py-[60px] text-center text-[10px] text-[#6c8179]">Primero selecciona un video MP4 para capturar un frame y calibrar la cámara.</div>
        : <><div className="mx-auto grid max-w-[860px] grid-cols-1 gap-[22px]">
          {!externalCapture && <div className="min-w-0">
            <video ref={videoRef} src={preview} controls muted playsInline className="aspect-auto h-auto max-h-[52vh] w-auto max-w-full bg-[#050a09]" />
            <button className="mt-3 border border-[#d4ff70] bg-transparent p-[11px] px-[14px] text-[10px] text-[#d4ff70]" onClick={capture}>＋ Capturar frame</button>
          </div>}
          <div className={`grid min-h-[320px] min-w-0 place-items-center border border-dashed border-[#46685c] bg-[#08120f]${externalCapture ? ' hidden' : ''}`}>
            {captured
              ? <canvas ref={canvasRef} className="block h-auto max-h-[60vh] w-auto max-w-full cursor-crosshair touch-none border border-[#315148]" style={{ width: '100%', aspectRatio: `${captured.width}/${captured.height}` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={release} onPointerCancel={release} />
              : <div className="px-5 py-[60px] text-center text-[10px] text-[#6c8179]">Captura un frame para comenzar</div>}
          </div>
        </div>
          <div className="mt-4 mb-0 flex flex-wrap gap-x-[18px] gap-y-2 text-[9px] font-medium font-[ui-monospace,monospace] text-[#789087]">{targets.map(([x, z], index) => <span key={index}>P{index + 1} → ({x}, {z}) m</span>)}</div>

          {/* Crop Info Display */}
          {cropInfo?.has_bars && (
            <div>
              <b>Márgenes negros detectados</b>
              <span>Arriba: {cropInfo.top}px · Abajo: {cropInfo.bottom}px · Izquierda: {cropInfo.left}px · Derecha: {cropInfo.right}px</span>
              <span>Contenido: {cropInfo.content_width}×{cropInfo.content_height}px</span>
              <small>Los márgenes negros se recortarán automáticamente durante el análisis para que la calibración quede alineada.</small>
            </div>

          )}

          {saveState.kind === 'ok' && <div className="mt-[10px] border border-[rgba(212,255,112,.35)] bg-[rgba(212,255,112,.06)] p-[10px] px-3 text-[10px] text-[#d4ff70]">{saveState.text}</div>}
          {saveState.kind === 'warn' && <div className="mt-[10px] border border-[rgba(255,196,84,.4)] bg-[rgba(255,196,84,.07)] p-[10px] px-3 text-[10px] text-[#ffc454]">⚠ {saveState.text}</div>}
          {saveState.kind === 'error' && <div className="mt-[10px] border border-[rgba(255,139,111,.4)] bg-[rgba(255,139,111,.06)] p-[10px] px-3 text-[10px] text-[#ff8b6f]">{saveState.text}</div>}
          <div className="flex gap-2">
            <button className="border border-[#3e5b51] bg-transparent p-3 px-[15px] text-[10px] text-[#b4c7bf]" onClick={restore}>Restaurar</button>
            <button className="border border-[#3e5b51] bg-transparent p-3 px-[15px] text-[10px] text-[#b4c7bf] border-[#d4ff70]! text-[#d4ff70]! disabled:opacity-40 disabled:cursor-not-allowed" onClick={save} disabled={saving || !captured}>{saving ? 'Guardando…' : 'Guardar calibración'}</button>
          </div>
        </>}
    </section>
  )
}