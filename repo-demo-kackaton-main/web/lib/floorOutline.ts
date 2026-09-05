export const OUTLINE_COLOR = '#5b9dff'

export function drawFloorOutline(ctx, outline, toPx) {
  const points = (outline || []).map(([x, z]) => toPx(x, z)).filter(Boolean)
  if (points.length < 2) return
  ctx.beginPath()
  ctx.moveTo(...points[0])
  points.slice(1).forEach((point) => ctx.lineTo(...point))
  if (points.length > 2) {
    ctx.lineTo(...points[0])
    ctx.closePath()
  }
  ctx.fillStyle = 'rgba(91, 157, 255, .08)'
  ctx.fill()
  ctx.strokeStyle = OUTLINE_COLOR
  ctx.lineWidth = 2
  ctx.setLineDash([8, 6])
  ctx.stroke()
  ctx.setLineDash([])
  const first = points[0]
  ctx.fillStyle = 'rgba(6, 14, 12, .82)'
  const label = 'PISO'
  const labelWidth = ctx.measureText(label).width + 16
  ctx.fillRect(first[0], first[1] - 20, labelWidth, 20)
  ctx.fillStyle = OUTLINE_COLOR
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillText(label, first[0] + 8, first[1] - 5)
}