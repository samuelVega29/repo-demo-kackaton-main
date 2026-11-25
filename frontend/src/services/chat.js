import { api } from './client'

export async function sendChatMessage({ message, site_id, history = [] }) {
  return api('/api/chat', { method: 'POST', body: JSON.stringify({ message, site_id, history }) })
}