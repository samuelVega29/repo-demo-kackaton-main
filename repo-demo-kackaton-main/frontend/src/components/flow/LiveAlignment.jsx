import { useEffect, useRef } from 'react'
import { projectFloor, forwardHomography, inverseHomography } from '../../lib/homography'

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return `rgba(97, 222, 192, ${alpha})`
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

export function MiniMap({ configuration, interactive, onMoveGondola, selectedId, onSelect }) {
  const floor = configuration.floor || {}
  const ref = useRef(null)
  const drag = useRef(null)

  const centerAt = (event) => {
    const rect = ref.current.getBoundingClientRect()
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
  }

  const pointerDown = (event) => {
    if (!interactive || !onMoveGondola) return
    const [fx, fz] = centerAt(event)
    let best = null
    let bestDist = Infinity
    ;(configuration.gondolas || []).forEach((gondola) => {
      const cx = (gondola.x + gondola.width / 2) / floor.width
      const cz = (gondola.z + gondola.depth / 2) / floor.depth
      if (cx === undefined || cz === undefined) return
      const dist = Math.hypot(cx - fx, cz - fz)
      const hit = Math.max(gondola.width / floor.width, gondola.depth / floor.depth) * 1.2
      if (dist < hit && dist < bestDist) { bestDist = dist; best = gondola }
    })
    if (!best) return
    const rect = ref.current.getBoundingClientRect()
    drag.current = {
      id: best.id, origX: best.x, origZ: best.z,
      startNx: (event.clientX - rect.left) / rect.width,
      startNz: (event.clientY - rect.top) / rect.height,
    }
    if (onSelect) onSelect(best.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pointerMove = (event) => {
    if (!interactive || !drag.current) return
    const rect = ref.current.getBoundingClientRect()
    const nx = (event.clientX - rect.left) / rect.width
    const nz = (event.clientY - rect.top) / rect.height
    const dx = (nx - drag.current.startNx) * floor.width
    const dz = (nz - drag.current.startNz) * floor.depth
    const g = (configuration.gondolas || []).find((item) => item.id === drag.current.id)
    if (!g) return
    onMoveGondola(drag.current.id, {
      x: Math.round(Math.min(floor.width - g.width, Math.max(0, drag.current.origX + dx)) * 100) / 100,
      z: Math.round(Math.min(floor.depth - g.depth, Math.max(0, drag.current.origZ + dz)) * 100) / 100,
    })
  }

  const endDrag = () => { drag.current = null }

  return (
    <div
      ref={ref}
      className={`relative block w-full border border-teal-900 bg-[#091512] ${interactive ? 'cursor-grab active:cursor-grabbing' : ''} [&_i]:absolute [&_i]:grid [&_i]:touch-none [&_i]:place-items-center [&_i]:border [&_i_span]:pointer-events-none [&_i_span]:absolute [&_i_span]:left-1 [&_i_span]:top-1 [&_i_span]:max-w-[95%] [&_i_span]:overflow-hidden [&_i_span]:text-ellipsis [&_i_span]:whitespace-nowrap [&_i_span]:font-mono [&_i_span]:text-[7px] [&_i_span]:font-semibold [&_i_span]:text-slate-100`}
      style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {configuration.gondolas.map((gondola) => (
        <i
          key={gondola.id}
          className={interactive && selectedId === gondola.id ? 'border-lime-300 shadow-[0_0_8px_rgba(97,222,192,.5)]' : ''}
          style={{
            left: `${gondola.x / floor.width * 100}%`,
            top: `${gondola.z / floor.depth * 100}%`,
            width: `${gondola.width / floor.width * 100}%`,
            height: `${gondola.depth / floor.depth * 100}%`,
            borderColor: gondola.color || '#61dec0',
            background: hexToRgba(gondola.color || '#61dec0', .18),
          }}
        >
          <span>{gondola.name}</span>
        </i>
      ))}
    </div>
  )
}

export default function LiveAlignment({ frameCapture, configuration, interactive, onMoveGondola, selectedId, onSelect }) {
  const canvasRef = useRef(null)
  const floor = configuration.floor || {}
  const camera = configuration.camera || {}
  const inverse = inverseHomography(camera) || null
  const forward = forwardHomography(camera) || null
  const drag = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frameCapture) return
    const ctx = canvas.getContext('2d')
    const width = canvas.width = frameCapture.width
    const height = canvas.height = frameCapture.height
    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)
      ctx.fillStyle = 'rgba(4, 10, 8, .28)'
      ctx.fillRect(0, 0, width, height)
      const toPx = (x, z) => {
        const normalized = projectFloor(inverse, x, z)
        if (!normalized) return null
        return [normalized[0] * width, normalized[1] * height]
      }
      if (!inverse) {
        ctx.fillStyle = 'rgba(255, 137, 105, .95)'
        ctx.font = '13px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText('CÁMARA SIN CALIBRAR — calibra al menos 4 puntos para proyectar', width / 2, 30)
        return
      }
      const outline = [[0, 0], [floor.width || 0, 0], [floor.width || 0, floor.depth || 0], [0, floor.depth || 0]]
      const outlinePx = outline.map(([x, z]) => toPx(x, z)).filter(Boolean)
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
        ctx.strokeStyle = (interactive && selectedId === gondola.id) ? '#ffffff' : color
        ctx.lineWidth = (interactive && selectedId === gondola.id) ? 6 : 3
        ctx.stroke()
        if (gondola.name) {
          ctx.fillStyle = 'rgba(6, 14, 12, .82)'
          const labelWidth = ctx.measureText(gondola.name).width + 18
          ctx.fillRect(pixels[0][0], pixels[0][1] - 20, labelWidth, 20)
          ctx.fillStyle = '#e8f2ed'
          ctx.font = '12px ui-monospace, monospace'
          ctx.fillText(gondola.name, pixels[0][0] + 9, pixels[0][1] - 5)
        }
      })
    }
    image.src = frameCapture.dataUrl
  }, [frameCapture, configuration, inverse, floor.width, floor.depth, interactive, selectedId])

  const centerPx = (gondola) => {
    const cx = gondola.x + gondola.width / 2
    const cz = gondola.z + gondola.depth / 2
    const n = projectFloor(inverse, cx, cz)
    if (!n) return null
    return [n[0] * frameCapture.width, n[1] * frameCapture.height]
  }

  const toNormalizedFromEvent = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
  }

  const pointerDown = (event) => {
    if (!interactive || !onMoveGondola || !frameCapture) return
    const rect = canvasRef.current.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width * frameCapture.width
    const py = (event.clientY - rect.top) / rect.height * frameCapture.height
    let best = null
    let bestDist = Infinity
    ;(configuration.gondolas || []).forEach((gondola) => {
      const c = centerPx(gondola)
      if (!c) return
      const dist = Math.hypot(c[0] - px, c[1] - py)
      const hit = Math.max(gondola.width, gondola.depth) * frameCapture.width * 0.12
      if (dist < hit && dist < bestDist) { bestDist = dist; best = gondola }
    })
    if (!best) return
    const [nx, ny] = toNormalizedFromEvent(event)
    const grabMeters = forward ? projectFloor(forward, nx, ny) : null
    drag.current = { id: best.id, origX: best.x, origZ: best.z, grab: grabMeters ? [grabMeters[0], grabMeters[1]] : null, active: true }
    if (onSelect) onSelect(best.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pointerMove = (event) => {
    const d = drag.current
    if (!d || !d.active || !forward) return
    const [nx, ny] = toNormalizedFromEvent(event)
    const meters = projectFloor(forward, nx, ny)
    if (!meters) return
    const dx = d.grab ? meters[0] - d.grab[0] : 0
    const dz = d.grab ? meters[1] - d.grab[1] : 0
    const g = (configuration.gondolas || []).find((item) => item.id === d.id)
    if (!g) return
    onMoveGondola(d.id, {
      x: Math.round(Math.min(floor.width - g.width, Math.max(0, d.origX + dx)) * 100) / 100,
      z: Math.round(Math.min(floor.depth - g.depth, Math.max(0, d.origZ + dz)) * 100) / 100,
    })
  }

  const endDrag = () => { if (drag.current) drag.current.active = false; drag.current = null }

  return (
    <div className="grid min-w-0 place-items-center border border-dashed border-teal-800 bg-[#08120f] p-2">
      {frameCapture
        ? <canvas
            ref={canvasRef}
            className={`block h-full w-full touch-none border border-teal-900 bg-black object-contain ${interactive ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{ aspectRatio: `${frameCapture.width}/${frameCapture.height}` }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        : <div className="p-12 text-center text-xs text-slate-500">Captura un frame en “Calibrar cámara” para ver la proyección.</div>}
    </div>
  )
}

