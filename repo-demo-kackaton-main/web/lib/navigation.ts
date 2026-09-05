export const RETAILER_KEY = 'scapder_retailer'

export function stashRetailer(item) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(RETAILER_KEY, JSON.stringify({ id: item.id, name: item.name }))
}

export function readRetailer() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(RETAILER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}