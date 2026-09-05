'use client'

import { useEffect, useRef, useState } from 'react'
import { gondolaCorners, solveHomography, projectFloor } from '@/lib/homography'

export default function CameraCalibration({
  preview,
  configuration,
  onChange,
  onSave,
  onCapture,
  onClose,
  externalCapture,
}) {
  const floor = configuration.floor || {}
  const camera = configuration.camera || {}
  const targets =
    camera.target_meters ||
    [
      [0, 0],
      [floor.width ?? 1, 0],
      [floor.width ?? 1, floor.depth ?? 1],
      [0, floor.depth ?? 1],
    ]
  const [points, setPoints] = useState(
    (camera.source_normalized || [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]).map((point) => [...point]),
  )
  const openedWithRef = useRef(
    camera.source_normalized ? camera.source_normalized.map((point) => [...point]) : null,
  )
  const [internalCaptured, setInternalCaptured] = useState(null)
  const captured = externalCapture || internalCaptured
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState({ kind: 'idle', text: '' })
  const [cropInfo, setCropInfo] = useState(camera.crop_info || null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const drag = useRef(-1)

  const homography =
    targets.length === 4 && points.length === 4
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
        const gridStep = Math.max(
          0.5,
          Math.round(Math.max(1, Math.max(floor.width || 1, floor.depth || 1) / 12)),
        )
        ctx.strokeStyle = 'rgba(212, 255, 112, .22)'
        ctx.lineWidth = 1
        for (let gx = 0; gx <= (floor.width || 1) + 1e-6; gx += gridStep) {
          const a = toPx(gx, 0)
          const b = toPx(gx, floor.depth || 1)
          if (!a || !b) continue
          ctx.beginPath()
          ctx.moveTo(...a)
          ctx.lineTo(...b)
          ctx.stroke()
        }
        for (let gz = 0; gz <= (floor.depth || 1) + 1e-6; gz += gridStep) {
          const a = toPx(0, gz)
          const b = toPx(floor.width || 1, gz)
          if (!a || !b) continue
          ctx.beginPath()
          ctx.moveTo(...a)
          ctx.lineTo(...b)
          ctx.stroke()
        }
      }

      ;(configuration.gondolas || []).forEach((gondola) => {
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
        const outline = [
          [0, 0],
          [floor.width || 0, 0],
          [floor.width || 0, floor.depth || 0],
          [0, floor.depth || 0],
        ]
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

  const detectBarsInImage = (imageData, width, height) => {
    const data = imageData.data
    const threshold = 20
    const minBarRatio = 0.02

    const rowMeans = new Array(height).fill(0)
    for (let y = 0; y < height; y++) {
      let sum = 0
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      }
      rowMeans[y] = sum / width
    }

    const colMeans = new Array(width).fill(0)
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4
        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      }
      colMeans[x] = sum / height
    }

    let top = 0
    for (let y = 0; y < height; y++) {
      if (rowMeans[y] > threshold) {
        top = y
        break
      }
    }
    let bottom = height
    for (let y = height - 1; y >= 0; y--) {
      if (rowMeans[y] > threshold) {
        bottom = y + 1
        break
      }
    }

    let left = 0
    for (let x = 0; x < width; x++) {
      if (colMeans[x] > threshold) {
        left = x
        break
      }
    }
    let right = width
    for (let x = width - 1; x >= 0; x--) {
      if (colMeans[x] > threshold) {
        right = x + 1
        break
      }
    }

    const minBarPxH = height * minBarRatio
    const minBarPxW = width * minBarRatio
    const hasTop = top > minBarPxH
    const hasBottom = height - bottom > minBarPxH
    const hasLeft = left > minBarPxW
    const hasRight = width - right > minBarPxW

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

  const release = () => {
    drag.current = -1
  }

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
    const calibrationMoved =
      openedWithRef.current && JSON.stringify(openedWithRef.current) !== JSON.stringify(points)
    onChange(next)
    setSaving(true)
    setSaveState({ kind: 'idle', text: '' })
    try {
      if (onSave) await onSave(next)
      openedWithRef.current = points.map((point) => [...point])
      setSaveState(
        calibrationMoved && gondolaCount > 0
          ? {
              kind: 'warn',
              text: `Moviste los 4 puntos con ${gondolaCount} góndola${gondolaCount === 1 ? '' : 's'} ya definida${gondolaCount === 1 ? '' : 's'} — sus posiciones se calcularon con la calibración anterior y pueden haber quedado desalineadas. Revisá "Verificar alineación" en la pantalla de subida.`,
            }
          : { kind: 'ok', text: 'Calibración guardada' },
      )
    } catch (error) {
      setSaveState({ kind: 'error', text: error.message || 'No se pudo guardar la calibración' })
    } finally {
      setSaving(false)
    }
  }

  const restore = () =>
    setPoints(
      (camera.source_normalized || [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]).map((point) => [...point]),
    )

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="eyebrow">CALIBRACIÓN DE CÁMARA · 4 PUNTOS</span>
          <h3 className="mt-1 text-sm font-semibold">Alinea el piso del video con el plano en metros</h3>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-lg text-muted transition-colors hover:text-acid"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>
      <p className="m-0 text-xs leading-5 text-muted">
        Pausa el video donde se vea el pasillo completo y captura el frame. Luego arrastra P1…P4 a
        las esquinas del piso real en el video: <b className="text-mint">P1</b> esquina
        superior-izquierda · <b className="text-mint">P2</b> superior-derecha ·{' '}
        <b className="text-mint">P3</b> fondo-derecha · <b className="text-mint">P4</b>{' '}
        fondo-izquierda. Cuanto más separados queden los puntos, mejor se ajusta la perspectiva; la
        rejilla y las góndolas proyectadas confirman el mapeo en vivo.
      </p>
      {!preview ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Primero selecciona un video MP4 para capturar un frame y calibrar la cámara.
        </div>
      ) : (
        <>
          <div className={`grid gap-4${externalCapture ? '' : ' md:grid-cols-2'}`}>
            {!externalCapture && (
              <div className="flex flex-col gap-3">
                <video ref={videoRef} src={preview} controls muted playsInline className="w-full rounded-lg" />
                <button
                  onClick={capture}
                  className="w-fit border border-line px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-mint transition-colors hover:border-mint"
                >
                  ＋ Capturar frame
                </button>
              </div>
            )}
            <div>
              {captured ? (
                <canvas
                  ref={canvasRef}
                  className="w-full cursor-crosshair rounded-lg border border-line bg-black"
                  style={{ aspectRatio: `${captured.width}/${captured.height}` }}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={release}
                  onPointerCancel={release}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                  Captura un frame para comenzar
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {targets.map(([x, z], index) => (
              <span
                key={index}
                className="rounded-full bg-panel2 px-3 py-1 font-mono text-[11px] text-muted"
              >
                P{index + 1} → ({x}, {z}) m
              </span>
            ))}
          </div>

          {cropInfo?.has_bars && (
            <div className="flex flex-col gap-1 rounded-lg border border-line bg-panel2 px-4 py-3 text-xs">
              <b className="text-ember">Márgenes negros detectados</b>
              <span className="text-muted">
                Arriba: {cropInfo.top}px · Abajo: {cropInfo.bottom}px · Izquierda:{' '}
                {cropInfo.left}px · Derecha: {cropInfo.right}px
              </span>
              <span className="text-muted">Contenido: {cropInfo.content_width}×{cropInfo.content_height}px</span>
              <small className="text-muted">
                Los márgenes negros se recortarán automáticamente durante el análisis para que la
                calibración quede alineada.
              </small>
            </div>
          )}

          {saveState.kind === 'ok' && (
            <div className="rounded-lg border border-mint bg-mint/10 px-4 py-2 text-xs text-mint">
              {saveState.text}
            </div>
          )}
          {saveState.kind === 'warn' && (
            <div className="rounded-lg border border-ember bg-ember/10 px-4 py-2 text-xs text-ember">
              ⚠ {saveState.text}
            </div>
          )}
          {saveState.kind === 'error' && (
            <div className="rounded-lg border border-ember bg-ember/10 px-4 py-2 text-xs text-ember">
              {saveState.text}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={restore}
              className="border border-line px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors hover:border-muted hover:text-ink"
            >
              Restaurar
            </button>
            <button
              onClick={save}
              disabled={saving || !captured}
              className="border border-acid px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-acid transition-colors hover:bg-acid hover:text-base disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar calibración'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}