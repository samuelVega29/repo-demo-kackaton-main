export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return `rgba(212, 255, 112, ${alpha})`
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}