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
  if (!response.ok) throw new Error(payload?.detail || 'No fue posible completar la solicitud')
  return payload
}

export function artifactUrl(analysisId, filename) {
  return `/api/analyses/${analysisId}/artifacts/${filename}`
}

export function videoUrl(analysisId) {
  const token = getToken()
  return `/api/analyses/${analysisId}/video${token ? `?token=${token}` : ''}`
}
