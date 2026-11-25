import { api } from './client'

export async function getSite(siteId) {
  if (!siteId) {
    throw new Error('No se recibió el identificador de la sede.')
  }

  return api(`/api/sites/${siteId}`)
}

export async function saveSiteConfiguration(siteId, configuration) {
  if (!siteId) {
    throw new Error('No se recibió el identificador de la sede.')
  }

  return api(`/api/sites/${siteId}/configuration`, {
    method: 'PUT',
    body: JSON.stringify({
      configuration,
    }),
  })
}

export async function deleteSite(siteId) {
  if (!siteId) {
    throw new Error('No se recibió el identificador de la sede.')
  }

  return api(`/api/sites/${siteId}`, {
    method: 'DELETE',
  })
}