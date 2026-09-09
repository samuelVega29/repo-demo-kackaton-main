import { useEffect, useRef, useState } from 'react'
import { gondolaCorners, projectFloor, projectFloorAtHeight, GONDOLA_TOP_HEIGHT_M, forwardHomography, inverseHomography } from '../../utils/homography'
import { drawFloorOutline, pointInPolygon, nearestPointInPolygon } from '../../utils/floorOutline'
import { hexToRgba } from '../../utils/format'

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
      className={`relative block w-full border border-[#315148] bg-[repeating-linear-gradient(0deg,transparent_0_31px,rgba(111,177,150,.07)_32px),repeating-linear-gradient(90deg,transparent_0_31px,rgba(111,177,150,.07)_32px),#091512]${interactive ? ' cursor-grab active:cursor-grabbing' : ''}`}
      style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {configuration.gondolas.map((gondola) => (
        <i
          key={gondola.id}
          className={`absolute grid touch-none place-items-center border border-current${interactive ? ' cursor-pointer' : ''}${interactive && selectedId === gondola.id ? ' border-[#d4ff70] shadow-[0_0_8px_rgba(97,222,192,.5)]' : ''}`}
          style={{
            left: `${gondola.x / floor.width * 100}%`,
            top: `${gondola.z / floor.depth * 100}%`,
            width: `${gondola.width / floor.width * 100}%`,
            height: `${gondola.depth / floor.depth * 100}%`,
            borderColor: gondola.color || '#61dec0',
            background: hexToRgba(gondola.color || '#61dec0', .18),
          }}
        >
          <span className="absolute top-[1px] left-[3px] max-w-[90%] overflow-hidden text-ellipsis whitespace-nowrap text-[6px] font-semibold font-[ui-monospace,monospace] text-[rgba(220,235,229,.8)]">{gondola.name}</span>
        </i>
      ))}
    </div>
  )
}

export default function LiveAlignment({ frameCapture, configuration, interactive, onMoveGondola, selectedId, onSelect, drawMode, onDrawCommit, onDrawCancel, addMode, onAddAt, zone, handOutline }) {
  const canvasRef = useRef(null)
  const hoverRef = useRef(null)
  const floor = configuration.floor || {}
  const camera = configuration.camera || {}
  const inverse = inverseHomography(camera) || null
  const forward = forwardHomography(camera) || null
  const polygon = floor.outline?.length >= 3 && floor.outline.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)) ? floor.outline : null
  const drag = useRef(null)
  const [drawPoints, setDrawPoints] = useState([])
  const [drawHover, setDrawHover] = useState(null)

  useEffect(() => { if (!drawMode) setDrawPoints([]) }, [drawMode])

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
      const clipZone = polygon && polygon.length > 2 && polygon.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z))
      const zonePathPx = clipZone ? polygon.map(([x, z]) => toPx(x, z)) : null
      if (clipZone && zonePathPx.every(Boolean)) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(...zonePathPx[0])
        zonePathPx.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.clip()
      }
      const gridStep = Math.max(0.5, Math.round(Math.max(1, Math.max(floor.width || 1, floor.depth || 1) / 12)))
      const polyXs = clipZone ? polygon.map(([x]) => x) : []
      const polyZs = clipZone ? polygon.map(([, z]) => z) : []
      const gridMinX = polyXs.length ? Math.min(0, ...polyXs) : 0
      const gridMaxX = polyXs.length ? Math.max(floor.width || 1, ...polyXs) : (floor.width || 1)
      const gridMinZ = polyZs.length ? Math.min(0, ...polyZs) : 0
      const gridMaxZ = polyZs.length ? Math.max(floor.depth || 1, ...polyZs) : (floor.depth || 1)
      ctx.fillStyle = 'rgba(9, 21, 18, .45)'
      ctx.beginPath()
      ctx.moveTo(...toPx(gridMinX, gridMinZ))
      ctx.lineTo(...toPx(gridMaxX, gridMinZ))
      ctx.lineTo(...toPx(gridMaxX, gridMaxZ))
      ctx.lineTo(...toPx(gridMinX, gridMaxZ))
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(212, 255, 112, .16)'
      ctx.lineWidth = 1
      for (let gx = Math.ceil(gridMinX / gridStep) * gridStep; gx <= gridMaxX + 1e-6; gx += gridStep) {
        const a = toPx(gx, gridMinZ)
        const b = toPx(gx, gridMaxZ)
        if (!a || !b) continue
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
      }
      for (let gz = Math.ceil(gridMinZ / gridStep) * gridStep; gz <= gridMaxZ + 1e-6; gz += gridStep) {
        const a = toPx(gridMinX, gz)
        const b = toPx(gridMaxX, gz)
        if (!a || !b) continue
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
      }
      if (clipZone && zonePathPx.every(Boolean)) ctx.restore()
      if (zone && zone.length > 1) {
        ctx.beginPath()
        ctx.moveTo(zone[0][0] * width, zone[0][1] * height)
        zone.slice(1).forEach(([x, y]) => ctx.lineTo(x * width, y * height))
        if (zone.length >= 3) {
          ctx.closePath()
          ctx.fillStyle = 'rgba(255, 91, 18, .14)'
          ctx.fill()
        }
        ctx.strokeStyle = 'rgba(255, 91, 18, .95)'
        ctx.lineWidth = 3
        ctx.setLineDash([10, 8])
        ctx.stroke()
        ctx.setLineDash([])
        zone.forEach(([x, y], index) => {
          ctx.beginPath()
          ctx.arc(x * width, y * height, 6, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'
          ctx.fill()
          ctx.strokeStyle = '#ff5b12'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.fillStyle = '#ff5b12'
          ctx.font = 'bold 10px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(index + 1), x * width, y * height)
        })
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
      }
      ;(configuration.gondolas || []).forEach((gondola) => {
        const color = gondola.color || '#61dec0'
        const shelfHeight = gondola.height || GONDOLA_TOP_HEIGHT_M
        const corners = gondolaCorners(gondola)
        const base = corners.map(([x, z]) => toPx(x, z))
        const top = corners.map(([x, z]) => {
          const raised = projectFloorAtHeight(inverse, width, height, x, z, shelfHeight)
          return raised ? [raised[0] * width, raised[1] * height] : null
        })
        if (base.length < 4 || base.some((point) => !point)) return
        const standing = top.every(Boolean)
        const selectedStyle = interactive && selectedId === gondola.id
        // Vértices del footprint más cercanos a cámara (mayor y en pantalla): son el filo
        // que queda de frente, sobre el que se apoya la cara frontal del "cubo".
        const order = [0, 1, 2, 3].sort((i, j) => base[j][1] - base[i][1])
        ctx.beginPath()
        ctx.moveTo(...base[0])
        base.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = hexToRgba(color, .12)
        ctx.fill()
        if (standing) {
          ctx.beginPath()
          ctx.moveTo(...top[0])
          top.slice(1).forEach((point) => ctx.lineTo(...point))
          ctx.closePath()
          ctx.fillStyle = hexToRgba(color, .22)
          ctx.fill()
          const [f0, f1] = order
          ctx.beginPath()
          ctx.moveTo(...base[f0])
          ctx.lineTo(...base[f1])
          ctx.lineTo(...top[f1])
          ctx.lineTo(...top[f0])
          ctx.closePath()
          ctx.fillStyle = hexToRgba(color, .16)
          ctx.fill()
          ctx.strokeStyle = hexToRgba(color, .55)
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.save()
          ctx.strokeStyle = selectedStyle ? '#ff876a' : color
          ctx.lineWidth = 2
          base.forEach((point, index) => {
            ctx.beginPath(); ctx.moveTo(...point); ctx.lineTo(...top[index]); ctx.stroke()
          })
          ctx.restore()
        }
        if (selectedStyle) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(...base[0])
          base.slice(1).forEach((point) => ctx.lineTo(...point))
          ctx.closePath()
          ctx.strokeStyle = '#ff876a'
          ctx.lineWidth = 6
          ctx.shadowColor = 'rgba(255, 135, 106, .85)'
          ctx.shadowBlur = 14
          ctx.stroke()
          ctx.restore()
          if (standing) {
            ctx.save()
            ctx.beginPath()
            ctx.moveTo(...top[0])
            top.slice(1).forEach((point) => ctx.lineTo(...point))
            ctx.closePath()
            ctx.strokeStyle = '#ff876a'
            ctx.lineWidth = 2.5
            ctx.stroke()
            ctx.restore()
          }
        } else {
          ctx.strokeStyle = color
          ctx.lineWidth = standing ? 2 : 3
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
        }
        if (gondola.name) {
          const anchor = standing ? top[order[0]] : base[0]
          const labelX = anchor[0]
          const labelY = Math.min(Math.max(anchor[1] - 20, 4), height - 24)
          ctx.fillStyle = 'rgba(6, 14, 12, .82)'
          const labelWidth = ctx.measureText(gondola.name).width + 18
          ctx.fillRect(labelX, labelY, labelWidth, 20)
          ctx.fillStyle = '#e8f2ed'
          ctx.font = '12px ui-monospace, monospace'
          ctx.fillText(gondola.name, labelX + 9, labelY + 15)
        }
      })
      const zoneOutline = (configuration.floor || {}).outline
      if (zoneOutline && zoneOutline.length > 1) drawFloorOutline(ctx, zoneOutline, toPx, 'ZONA')
      if (handOutline && handOutline.length > 1) drawFloorOutline(ctx, handOutline, toPx, 'PISO')
      if (drawPoints.length > 1) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(...toPx(drawPoints[0][0], drawPoints[0][1]))
        drawPoints.slice(1).forEach(([x, z]) => ctx.lineTo(...toPx(x, z)))
        ctx.strokeStyle = '#5b9dff'
        ctx.lineWidth = 9
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(...toPx(drawPoints[0][0], drawPoints[0][1]))
        drawPoints.slice(1).forEach(([x, z]) => ctx.lineTo(...toPx(x, z)))
        ctx.strokeStyle = 'rgba(222, 238, 255, .95)'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }
      drawPoints.forEach(([x, z], index) => {
        const p = toPx(x, z)
        if (!p) return
        ctx.beginPath()
        ctx.arc(p[0], p[1], 10, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(91, 157, 255, .28)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(p[0], p[1], 7, 0, Math.PI * 2)
        ctx.fillStyle = '#0c1a23'
        ctx.fill()
        ctx.strokeStyle = '#5b9dff'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.fillStyle = '#e8f2ff'
        ctx.font = 'bold 11px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(index + 1), p[0], p[1])
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
      })
    }
    image.src = frameCapture.dataUrl
  }, [frameCapture, configuration, inverse, floor.width, floor.depth, interactive, selectedId, drawPoints, drawMode, zone, handOutline])

  useEffect(() => {
    const canvas = hoverRef.current
    if (!canvas || !frameCapture) return
    const ctx = canvas.getContext('2d')
    const width = canvas.width = frameCapture.width
    const height = canvas.height = frameCapture.height
    ctx.clearRect(0, 0, width, height)
    if (!drawMode || !drawPoints.length || !drawHover || !inverse) return
    const last = drawPoints[drawPoints.length - 1]
    const a = projectFloor(inverse, last[0], last[1])
    const b = projectFloor(inverse, drawHover[0], drawHover[1])
    if (!a || !b) return
    const ap = [a[0] * width, a[1] * height]
    const bp = [b[0] * width, b[1] * height]
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(...ap)
    ctx.lineTo(...bp)
    ctx.strokeStyle = '#5b9dff'
    ctx.lineWidth = 6
    ctx.shadowColor = 'rgba(91, 157, 255, .8)'
    ctx.shadowBlur = 12
    ctx.setLineDash([10, 6])
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(bp[0], bp[1], 8, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(212, 255, 112, .25)'
    ctx.fill()
    ctx.strokeStyle = '#d4ff70'
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(bp[0], bp[1], 3, 0, Math.PI * 2)
    ctx.fillStyle = '#d4ff70'
    ctx.fill()
    ctx.restore()
  }, [frameCapture, inverse, drawMode, drawPoints, drawHover])

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

  const metersAt = (event) => {
    if (!forward || !frameCapture) return null
    const [nx, ny] = toNormalizedFromEvent(event)
    const meters = projectFloor(forward, nx, ny)
    if (!meters) return null
    const xs = polygon ? polygon.map(([x]) => x) : []
    const zs = polygon ? polygon.map(([, z]) => z) : []
    const minX = xs.length ? Math.min(0, ...xs) : 0
    const maxX = xs.length ? Math.max(floor.width, ...xs) : floor.width
    const minZ = zs.length ? Math.min(0, ...zs) : 0
    const maxZ = zs.length ? Math.max(floor.depth, ...zs) : floor.depth
    return [
      Math.round(Math.max(minX, Math.min(maxX, meters[0])) * 100) / 100,
      Math.round(Math.max(minZ, Math.min(maxZ, meters[1])) * 100) / 100,
    ]
  }

  const addDrawPoint = (event) => {
    if (!drawMode) return
    const meters = metersAt(event)
    if (!meters) return
    setDrawPoints((current) => [...current, meters])
  }

  const handleClick = (event) => {
    if (addMode) {
      const meters = metersAt(event)
      if (meters && onAddAt) onAddAt(meters[0], meters[1])
      return
    }
    addDrawPoint(event)
  }

  const pointerDown = (event) => {
    if (drawMode || addMode) return
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
    drag.current = { id: best.id, origX: best.x, origZ: best.z, grab: grabMeters ? [grabMeters[0], grabMeters[1]] : null, active: true, valid: { x: best.x, z: best.z } }
    if (onSelect) onSelect(best.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pointerMove = (event) => {
    if (drawMode && forward) setDrawHover(metersAt(event))
    const d = drag.current
    if (!d || !d.active || !forward || drawMode || addMode) return
    const [nx, ny] = toNormalizedFromEvent(event)
    const meters = projectFloor(forward, nx, ny)
    if (!meters) return
    const dx = d.grab ? meters[0] - d.grab[0] : 0
    const dz = d.grab ? meters[1] - d.grab[1] : 0
    const g = (configuration.gondolas || []).find((item) => item.id === d.id)
    if (!g) return
    let newX = Math.round(Math.min(floor.width - g.width, Math.max(0, d.origX + dx)) * 100) / 100
    let newZ = Math.round(Math.min(floor.depth - g.depth, Math.max(0, d.origZ + dz)) * 100) / 100
    if (polygon && !pointInPolygon(newX + g.width / 2, newZ + g.depth / 2, polygon)) {
      const nearest = nearestPointInPolygon(newX + g.width / 2, newZ + g.depth / 2, polygon)
      newX = nearest.x - g.width / 2
      newZ = nearest.z - g.depth / 2
    }
    d.valid = { x: newX, z: newZ }
    onMoveGondola(d.id, { x: newX, z: newZ })
  }

  const endDrag = () => { if (drag.current) drag.current.active = false; drag.current = null }

  const xExtent = drawPoints.length ? Math.max(...drawPoints.map((p) => p[0])) - Math.min(...drawPoints.map((p) => p[0])) : 0
  const zExtent = drawPoints.length ? Math.max(...drawPoints.map((p) => p[1])) - Math.min(...drawPoints.map((p) => p[1])) : 0

  return (
    <div className="m-0 mx-auto grid min-h-0 min-w-0 w-full max-w-[760px] place-items-center border border-dashed border-[#46685c] bg-[#08120f] p-2">
      {frameCapture
        ? <>
            <div className="relative w-full">
              <canvas
                ref={canvasRef}
                className={`block h-auto max-h-[46vh] w-full touch-none border border-[#315148] bg-[#050a09] object-contain${interactive ? ' cursor-grab active:cursor-grabbing' : ''}${drawMode || addMode ? ' cursor-crosshair' : ''}`}
                style={{ aspectRatio: `${frameCapture.width}/${frameCapture.height}` }}
                onClick={handleClick}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
              <canvas ref={hoverRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
            {addMode && (
              <p className="m-0 text-[10px] leading-[1.6] text-[#d4ff70]">Hacé clic sobre el video para colocar una góndola nueva en esa posición.</p>
            )}
            {drawMode && (
              <>
                <p className="m-0 text-[10px] leading-[1.6] text-[#6c8179]">Hacé clic para marcar un punto; la línea se genera desde ahí y sigue al cursor. Clic de nuevo para fijar el corte y seguir el contorno ({drawPoints.length} puntos). Con 3+ puntos se cierra el trazo.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button className="cursor-pointer border border-[#3e5b51] bg-transparent p-[9px] px-[14px] text-[9px] text-[#b4c7bf] hover:enabled:border-[#d4ff70] hover:enabled:text-[#d4ff70] disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => setDrawPoints((current) => current.slice(0, -1))} disabled={!drawPoints.length}>Deshacer</button>
                  <button className="cursor-pointer border border-[#3e5b51] bg-transparent p-[9px] px-[14px] text-[9px] text-[#b4c7bf] hover:enabled:border-[#d4ff70] hover:enabled:text-[#d4ff70] disabled:opacity-40 disabled:cursor-not-allowed" disabled={drawPoints.length < 3} onClick={() => { if (onDrawCommit) onDrawCommit(drawPoints); setDrawPoints([]) }}>Cerrar contorno</button>
                  <button className="cursor-pointer border border-[#3e5b51] bg-transparent p-[9px] px-[14px] text-[9px] text-[#b4c7bf] hover:enabled:border-[#d4ff70] hover:enabled:text-[#d4ff70]" onClick={() => { setDrawPoints([]); if (onDrawCancel) onDrawCancel() }}>Cancelar</button>
                </div>
                {drawPoints.length >= 3 && (
                  <div className="flex items-center gap-[10px] p-[10px] px-3 border border-[rgba(91,157,255,.35)] bg-[rgba(91,157,255,.07)] text-[9px] text-[#9db8d4]">
                    <b className="text-[#5b9dff]">≈ {xExtent.toFixed(2)} × {zExtent.toFixed(2)} m</b><span>contorno del piso (señaliza la zona recorrida)</span>
                  </div>
                )}
              </>
            )}
          </>
        : <div className="px-5 py-[60px] text-center text-[10px] text-[#6c8179]">Captura un frame en “Calibrar cámara” para ver la proyección.</div>}
    </div>
  )
}
