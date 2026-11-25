import { api } from '../api/client'

export const retailApi = {
  getRetailers: () => api('/api/retailers'),
  getSites: (retailerId) => api(`/api/retailers/${retailerId}/sites`),
  createSite: (retailerId, values) => api(`/api/retailers/${retailerId}/sites`, {
    method: 'POST',
    body: JSON.stringify(values),
  }),
  saveSiteConfiguration: (siteId, configuration) => api(`/api/sites/${siteId}/configuration`, {
    method: 'PUT',
    body: JSON.stringify({ configuration }),
  }),
  createAnalysis: (body) => api('/api/analyses', { method: 'POST', body }),
  getAnalysis: (analysisId) => api(`/api/analyses/${analysisId}`),
  suggestGondolas: (siteId, payload) => api(`/api/sites/${siteId}/suggest-gondolas`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
}
