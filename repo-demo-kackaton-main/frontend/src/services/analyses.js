import { api, getToken } from './client'

export async function createAnalysis(body) {
  return api('/api/analyses', {
    method: 'POST',
    body,
  })
}

export async function getAnalysis(analysisId) {
  return api(`/api/analyses/${analysisId}`)
}

export async function listAnalyses(params = {}) {
  const query = new URLSearchParams()

  if (params.site_id) {
    query.set('site_id', params.site_id)
  }

  const suffix = query.toString()
    ? `?${query.toString()}`
    : ''

  return api(`/api/analyses${suffix}`)
}

export async function getAnalysisStatus(analysisId) {
  return api(`/api/analyses/${analysisId}/status`)
}

/* =========================================================
   CANCELAR ANÁLISIS
========================================================= */

export async function cancelAnalysis(analysisId) {
  return api(
    `/api/analyses/${analysisId}/cancel`,
    {
      method: 'POST',
    }
  )
}

export async function getAnalysisSummary(analysisId) {
  return api(`/api/analyses/${analysisId}/summary`)
}

export async function getAnalysisHeatmap(analysisId) {
  return api(`/api/analyses/${analysisId}/heatmap`)
}

export async function getAnalysisTrajectories(analysisId) {
  return api(`/api/analyses/${analysisId}/trajectories`)
}

export async function getAnalysisZones(analysisId) {
  return api(`/api/analyses/${analysisId}/zones`)
}

export function artifactUrl(analysisId, filename) {
  const token = getToken()

  return `/api/analyses/${analysisId}/artifacts/${filename}${
    token ? `?token=${token}` : ''
  }`
}

export function videoUrl(analysisId) {
  const token = getToken()

  return `/api/analyses/${analysisId}/video${
    token ? `?token=${token}` : ''
  }`
}