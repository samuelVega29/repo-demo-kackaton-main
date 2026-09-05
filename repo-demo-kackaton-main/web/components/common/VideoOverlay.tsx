'use client'

import { useEffect, useRef } from 'react'
import { gondolaCorners } from '@/lib/homography'
import { hexToRgba } from '@/lib/color'

const project = (configuration, x, z) => {
  const matrix = configuration.camera?.homography_inv
  if (!matrix) return null
  const flat = matrix.flat()
  const denominator = flat[6] * x + flat[7] * z + flat[8]
  if (!denominator) return null
  return [(flat[0] * x + flat[1] * z + flat[2]) / denominator, (flat[3] * x + flat[4] * z + flat[5]) / denominator]
}

export default function VideoOverlay({ preview, configuration, onClose }) {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const configurationRef = useRef(configuration)
  configurationRef.current = configuration

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
      ctx.drawImage(video, 0, 0, width, height)
      const config = configurationRef.current
      const floor = config.floor || {}
      const calibrated = Boolean(config.camera?.homography_inv)

      const pointPx = (x, z) => {
        const normalized = project(config, x, z)
        if (!normalized) return null
        return [normalized[0] * width, normalized[1] * height]
      }

      if (calibrated) {
        const outline = [
          [0, 0],
          [floor.width, 0],
          [floor.width, floor.depth],
          [0, floor.depth],
        ]
        const outlinePx = outline.map(([x, z]) => pointPx(x, z)).filter(Boolean)
        if (outlinePx.length === 4) {
          ctx.beginPath()
          ctx.moveTo(...outlinePx[0])
          outlinePx.slice(1).forEach((point) => ctx.lineTo(...point))
          ctx.closePath()
          ctx.strokeStyle = 'rgba(126, 154, 143, .9)'
          ctx.lineWidth = 3
          ctx.setLineDash([10, 8])
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      ;(config.gondolas || []).forEach((gondola) => {
        const color = gondola.color || '#d4ff70'
        const corners = gondolaCorners(gondola)
        const pixels = corners.map(([x, z]) => pointPx(x, z)).filter(Boolean)
        if (pixels.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...pixels[0])
        pixels.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = hexToRgba(color, 0.16)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 4
        ctx.stroke()
        ctx.fillStyle = 'rgba(6, 14, 12, .82)'
        const labelWidth = ctx.measureText(gondola.name).width + 18
        ctx.fillRect(pixels[0][0], pixels[0][1] - 20, labelWidth, 20)
        ctx.fillStyle = '#e8f2ed'
        ctx.font = '12px ui-monospace, monospace'
        ctx.fillText(gondola.name, pixels[0][0] + 9, pixels[0][1] - 5)
      })

      ;(config.zones || []).forEach((zone) => {
        const inner = (zone.polygon || []).map(([x, z]) => pointPx(x, z)).filter(Boolean)
        if (inner.length < 3) return
        ctx.beginPath()
        ctx.moveTo(...inner[0])
        inner.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.strokeStyle = 'rgba(97, 222, 192, .55)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 6])
        ctx.stroke()
        ctx.fillStyle = 'rgba(97, 222, 192, .07)'
        ctx.fill()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(97, 222, 192, .75)'
        ctx.font = '10px ui-monospace, monospace'
        ctx.fillText(zone.name, inner[0][0] + 6, inner[0][1] + 6)
      })

      if (!calibrated) {
        ctx.fillStyle = 'rgba(255, 137, 105, .95)'
        ctx.font = '13px ui-monospace, monospace'
        ctx.fillText(
          'CÁMARA SIN CALIBRAR — los contornos se calcularán al calibrar los 4 puntos',
          14,
          26,
        )
      }
    }

    const loop = () => {
      draw()
      frame = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <span className="eyebrow">VERIFICACIÓN DE ALINEACIÓN</span>
          <h3 className="mt-1 text-sm font-semibold">Góndolas del planograma sobre el video real</h3>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-lg text-muted transition-colors hover:text-acid"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          src={preview}
          controls
          muted
          playsInline
          className="block h-auto w-full"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </section>
  )
}