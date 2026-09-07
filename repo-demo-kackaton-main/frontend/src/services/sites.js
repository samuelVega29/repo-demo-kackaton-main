import { api } from './client'

export async function getSite(siteId) {
  return api(`/api/sites/${siteId}`)
}

export async function saveSiteConfiguration(siteId, configuration) {
  return api(`/api/sites/${siteId}/configuration`, { method: 'PUT', body: JSON.stringify({ configuration }) })
}

export async function deleteSite(siteId) {
  return api(`/api/sites/${siteId}`, { method: 'DELETE' })
}
