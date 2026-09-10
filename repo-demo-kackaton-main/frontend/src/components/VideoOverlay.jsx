import { useEffect, useRef } from 'react'
import { gondolaCorners, projectFloorAtHeight, GONDOLA_TOP_HEIGHT_M } from '../utils/homography'
import { hexToRgba } from '../utils/format'

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

    const draw = () => {
      if (!video.videoWidth) return
      const width = canvas.width = video.videoWidth
      const height = canvas.height = video.videoHeight
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
      const flatMatrix = config.camera?.homography_inv ? config.camera.homography_inv.flat() : null
      const raisedPointPx = (x, z, heightM) => {
        const normalized = projectFloorAtHeight(flatMatrix, width, height, x, z, heightM)
        if (!normalized) return null
        return [normalized[0] * width, normalized[1] * height]
      }

      if (calibrated) {
        const outline = [[0, 0], [floor.width, 0], [floor.width, floor.depth], [0, floor.depth]]
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
        const shelfHeight = gondola.height || GONDOLA_TOP_HEIGHT_M
        const corners = gondolaCorners(gondola)
        const base = corners.map(([x, z]) => pointPx(x, z))
        const top = corners.map(([x, z]) => raisedPointPx(x, z, shelfHeight))
        if (base.length < 4 || base.some((point) => !point)) return
        const standing = flatMatrix && top.every(Boolean)
        const order = [0, 1, 2, 3].sort((i, j) => base[j][1] - base[i][1])
        ctx.beginPath()
        ctx.moveTo(...base[0])
        base.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = hexToRgba(color, .16)
        ctx.fill()
        if (standing) {
          ctx.beginPath()
          ctx.moveTo(...top[0])
          top.slice(1).forEach((point) => ctx.lineTo(...point))
          ctx.closePath()
          ctx.fillStyle = hexToRgba(color, .24)
          ctx.fill()
          const [f0, f1] = order
          ctx.beginPath()
          ctx.moveTo(...base[f0])
          ctx.lineTo(...base[f1])
          ctx.lineTo(...top[f1])
          ctx.lineTo(...top[f0])
          ctx.closePath()
          ctx.fillStyle = hexToRgba(color, .18)
          ctx.fill()
          ctx.strokeStyle = hexToRgba(color, .55)
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.save()
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          base.forEach((point, index) => {
            ctx.beginPath(); ctx.moveTo(...point); ctx.lineTo(...top[index]); ctx.stroke()
          })
          ctx.restore()
        }
        ctx.strokeStyle = color
        ctx.lineWidth = standing ? 2 : 4
        ctx.beginPath()
        ctx.moveTo(...base[0])
        base.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.stroke()
        if (standing) {
          ctx.strokeStyle = hexToRgba(color, .7)
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(...top[0])
          top.slice(1).forEach((point) => ctx.lineTo(...point))
          ctx.closePath()
          ctx.stroke()
        }
        const anchor = standing ? top[order[0]] : base[0]
        ctx.fillStyle = 'rgba(6, 14, 12, .82)'
        const labelWidth = ctx.measureText(gondola.name).width + 18
        ctx.fillRect(anchor[0], anchor[1] - 20, labelWidth, 20)
        ctx.fillStyle = '#e8f2ed'
        ctx.font = '12px ui-monospace, monospace'
        ctx.fillText(gondola.name, anchor[0] + 9, anchor[1] - 5)
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
        ctx.fillText('CÁMARA SIN CALIBRAR — los contornos se calcularán al calibrar los 4 puntos', 14, 26)
      }
    }

    let frame = 0

    const loop = () => {
      draw()
      frame = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <section className="my-4 mb-[30px] border border-[#46685c] bg-[#0c1915] px-7 py-[26px]">
      <div className="flex items-start justify-between gap-[18px]">
        <div><span className="text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">VERIFICACIÓN DE ALINEACIÓN</span><h3 className="mt-2 text-[22px] tracking-[-.03em]">Góndolas del planograma sobre el video real</h3></div>
        <button className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[rgba(206,236,221,.14)] bg-[#172720] text-[15px] text-[#dbe8e2]" onClick={onClose}>×</button>
      </div>
      <div className="relative border border-[#315148] bg-[#050a09]">
        <video ref={videoRef} src={preview} controls muted playsInline className="block w-full" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
    </section>
  )
}
