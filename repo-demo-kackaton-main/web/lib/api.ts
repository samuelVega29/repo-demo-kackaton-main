export const TOKEN_KEY = 'scapder_token'
export const STORAGE_USER_KEY = 'scapder_user'

export function getToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (typeof window === 'undefined') return
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  else window.localStorage.removeItem(TOKEN_KEY)
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  if (typeof window === 'undefined') return
  if (user) window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user))
  else window.localStorage.removeItem(STORAGE_USER_KEY)
}

export async function api(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (!(options.body instanceof FormData) && options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(path, { ...options, headers })
  } catch (err) {
    throw new Error('No se pudo conectar con el servidor. Verificá que el backend esté corriendo.')
  }

  if (res.status === 401) {
    setToken(null)
    setStoredUser(null)
  }

  const contentType = res.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await res.json() : await res.text()

  if (!res.ok) {
    const message = payload?.detail || payload?.message || `Error ${res.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  return payload
}

export function artifactUrl(analysisId, filename) {
  return `/api/analyses/${analysisId}/artifacts/${encodeURIComponent(filename)}`
}

export function videoUrl(analysisId) {
  const token = getToken()
  return `/api/analyses/${analysisId}/video?token=${encodeURIComponent(token || '')}`
}