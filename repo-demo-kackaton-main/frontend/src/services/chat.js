import { api, getToken, resolveApiUrl } from './client'

export async function sendChatMessage({ message, site_id, analysis_id = null, history = [] }) {
  return api('/api/chat', { method: 'POST', body: JSON.stringify({ message, site_id, analysis_id, history }) })
}

/**
 * Envía el mensaje al endpoint de streaming (SSE) y va reportando cada delta
 * de la respuesta mediante onDelta. Se cancela si el usuario aborta (signal)
 * o si el backend supera el timeout dado.
 */
export async function streamChatMessage({ message, site_id, analysis_id = null, history = [] }, onDelta, { signal } = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(resolveApiUrl('/api/chat/stream'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, site_id, analysis_id, history }),
    signal,
  })

  if (!response.ok) {
    let errorMessage = 'No fue posible obtener respuesta.'
    try {
      const payload = await response.json()
      if (payload?.detail) {
        errorMessage = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail)
      }
    } catch {
      errorMessage = response.statusText || errorMessage
    }
    throw new Error(errorMessage)
  }

  if (!response.body) throw new Error('No fue posible obtener respuesta.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handleEvent = (payload) => {
    if (!payload || typeof payload !== 'object') return
    if (payload.type === 'delta' && typeof payload.delta === 'string') onDelta(payload.delta)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const raw = trimmed.slice(5).trim()
        if (!raw) continue
        try {
          handleEvent(JSON.parse(raw))
        } catch {
          /* ignora frames malformados */
        }
      }
    }
  }
}