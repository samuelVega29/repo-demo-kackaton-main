const TOKEN_KEY = 'scapder_token'

export const getToken = () => window.localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => token ? window.localStorage.setItem(TOKEN_KEY, token) : window.localStorage.removeItem(TOKEN_KEY)

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })
  if (response.status === 401) setToken(null)
  const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
  if (!response.ok) throw new Error(describeError(payload?.detail) || 'No fue posible completar la solicitud')
  return payload
}

function describeError(detail) {
  if (!detail) return null
  if (typeof detail === 'string') return detail
  // FastAPI devuelve una lista de errores de validación: [{ loc, msg, type }, ...]
  if (Array.isArray(detail)) return detail.map((item) => item?.msg || describeError(item)).filter(Boolean).join('; ')
  if (typeof detail === 'object') return detail.msg || JSON.stringify(detail)
  return String(detail)
}