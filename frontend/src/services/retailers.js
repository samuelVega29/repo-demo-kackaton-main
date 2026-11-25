import { api } from './client'

export async function getRetailers() {
  return api('/api/retailers')
}

export async function createRetailer(values) {
  return api('/api/retailers', { method: 'POST', body: JSON.stringify(values) })
}

export async function deleteRetailer(retailerId) {
  return api(`/api/retailers/${retailerId}`, { method: 'DELETE' })
}

export async function getRetailerSites(retailerId) {
  return api(`/api/retailers/${retailerId}/sites`)
}

export async function createSite(retailerId, values) {
  return api(`/api/retailers/${retailerId}/sites`, { method: 'POST', body: JSON.stringify(values) })
}
