export const OUTLINE_COLOR = '#5b9dff'

export function pointInPolygon(px, pz, polygon) {
  if (!polygon || polygon.length < 3) return true
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    const crosses = (zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

// Devuelve el punto del polígono más cercano a (x, z) cuando el punto queda
// afuera. Al mantener el centro de la góndola sobre el borde la corrección es
// mínima en cualquier dirección (evita que el punto "salte" hacia el centroide).
export function nearestPointInPolygon(x, z, polygon) {
  if (!polygon || polygon.length < 3) return { x, z }
  if (pointInPolygon(x, z, polygon)) return { x, z }
  let best = null
  let bestDist = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i]
    const [x2, z2] = polygon[(i + 1) % polygon.length]
    const dx = x2 - x1
    const dz = z2 - z1
    const len2 = dx * dx + dz * dz
    const t = len2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2)) : 0
    const cx = x1 + t * dx
    const cz = z1 + t * dz
    const dist = Math.hypot(cx - x, cz - z)
    if (dist < bestDist) { bestDist = dist; best = { x: cx, z: cz } }
  }
  return best || { x, z }
}

export function drawFloorOutline(ctx, outline, toPx, label = 'PISO') {
  const points = (outline || []).map(([x, z]) => toPx(x, z)).filter(Boolean)
  if (points.length < 2) return
  ctx.beginPath()
  ctx.moveTo(...points[0])
  points.slice(1).forEach((point) => ctx.lineTo(...point))
  if (points.length > 2) {
    ctx.lineTo(...points[0])
    ctx.closePath()
  }
  ctx.save()
  ctx.fillStyle = 'rgba(91, 157, 255, .14)'
  ctx.fill()
  ctx.strokeStyle = OUTLINE_COLOR
  ctx.lineWidth = 5
  ctx.shadowColor = 'rgba(91, 157, 255, .65)'
  ctx.shadowBlur = 10
  ctx.setLineDash([12, 7])
  ctx.stroke()
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(...points[0])
  points.slice(1).forEach((point) => ctx.lineTo(...point))
  if (points.length > 2) ctx.lineTo(...points[0])
  ctx.strokeStyle = 'rgba(196, 225, 255, .95)'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 9])
  ctx.stroke()
  ctx.setLineDash([])
  const first = points[0]
  ctx.fillStyle = 'rgba(6, 14, 12, .82)'
  const labelWidth = ctx.measureText(label).width + 16
  ctx.fillRect(first[0], first[1] - 20, labelWidth, 20)
  ctx.fillStyle = OUTLINE_COLOR
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(label, first[0] + 8, first[1] - 5)
}