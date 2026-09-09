import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { artifactUrl } from '../services/analyses'
import { api, getToken, resolveApiUrl } from '../services/client'

function frameNameFromEvidence(evidencia) {
  if (!evidencia || evidencia === 'null') return null
  const match = evidencia.match(/frame_\d+/)
  return match ? match[0] : null
}

export default function InsightsPage() {
  const { job, site, loadAnalysis } = useApp()
  const { analysisId } = useParams()
  const [loading, setLoading] = useState(Boolean(analysisId && !job?.result))
  const [insights, setInsights] = useState(job?.insights || null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')

  useEffect(() => {
    if (job?.result || !analysisId) {
      setLoading(false)
      return
    }
    setLoading(true)
    loadAnalysis(analysisId).catch(() => {}).finally(() => setLoading(false))
  }, [analysisId, job?.result, loadAnalysis])

  useEffect(() => {
    setInsights(job?.insights || null)
  }, [job?.insights])

  const generateInsights = async (regenerate) => {
    setInsightsLoading(true)
    setInsightsError('')
    try {
      const url = `/api/analyses/${analysisId}/insights${regenerate ? '?regenerate=true' : ''}`
      const result = await api(url, { method: 'POST' })
      setInsights(result)
    } catch (error) {
      setInsightsError(error.message)
    } finally {
      setInsightsLoading(false)
    }
  }

  if (loading) return <section className="grid min-h-[calc(100vh-72px)] place-items-center font-[ui-monospace,monospace] text-sm font-bold tracking-[.18em] text-[#7d8392]">CARGANDO ANALISIS</section>
  if (!job?.result) return <Navigate to={site ? `/sedes/${site.id}` : '/empresas'} replace />

  const analysis = job

  return (
    <section className="mx-auto w-[min(1100px,calc(100%-36px))] pb-[100px] pt-[72px] max-[760px]:w-[calc(100%-28px)] max-[760px]:pb-[75px] max-[760px]:pt-[55px]">
      <Link
        to={`/analyses/${analysis.id}`}
        className="mb-8 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-[#7d8392] transition hover:text-[#151323]"
      >
        ← Volver a resultados
      </Link>

      <div className="mb-10">
        <span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#ff6b3d]">PASO 05 · RECOMENDACIONES IA</span>
        <h1 className="my-[17px] mb-6 text-[clamp(40px,6vw,72px)] font-medium leading-[.95] tracking-[-.045em] text-[#151323]">
          Lo que dice <em className="not-italic text-[#ff6b3d]">Claude.</em>
        </h1>
        <p className="max-w-[560px] text-sm text-[#7d8392]">Claude interpreta las metricas y los frames ya calculados en el analisis anterior para darte hallazgos accionables, con evidencia visual citada por frame, e informes descargables en Word y Excel (con gráficas).</p>
      </div>

      <div className="mb-8 flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => generateInsights(Boolean(insights))}
          disabled={insightsLoading}
          className="rounded-lg bg-[#151323] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#29263d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {insightsLoading ? 'Analizando con Claude…' : insights ? '↻ Regenerar recomendaciones' : '✨ Generar recomendaciones con IA'}
        </button>
        <p className="m-0 text-xs font-medium text-[#7d8392]">
          Opcional — puede tardar unos minutos. Claude revisa las métricas y los frames ya calculados, no el video crudo.
        </p>
        {insightsError && <p className="m-0 text-xs font-semibold text-[#ff3b30]">Error: {insightsError}</p>}
      </div>

      {!insights && !insightsLoading && (
        <div className="rounded-lg border border-dashed border-[#e5e7ee] p-10 text-center text-sm text-[#7d8392]">
          Todavía no hay recomendaciones generadas para este análisis. Presiona el botón de arriba para pedirle a Claude que las genere.
        </div>
      )}

      {insights && (
        <div className="rounded-lg border border-[#e5e7ee] bg-white p-6 shadow-[0_20px_55px_-40px_rgba(20,27,36,.35)]">
          <p className="m-0 mb-5 text-[15px] font-bold leading-relaxed text-[#151323]">{insights.hallazgo_principal}</p>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[10px]">
            {(insights.recomendaciones || []).map((rec, index) => {
              const frameName = frameNameFromEvidence(rec.evidencia_visual)
              return (
                <article key={`${rec.titulo}-${index}`} className="rounded-lg border border-[#ffe6d8] bg-[#fffaf7] p-[15px]">
                  <h4 className="m-0 mb-2 text-[12px] font-black leading-tight text-[#151323]">{index + 1}. {rec.titulo}</h4>
                  <p className="m-0 mb-2 text-[10px] leading-[1.6] text-[#7d8392]"><b className="text-[#151323]">Justificación: </b>{rec.justificacion}</p>
                  <p className="m-0 mb-2 text-[10px] leading-[1.6] text-[#7d8392]"><b className="text-[#151323]">Impacto estimado: </b>{rec.impacto_estimado}</p>
                  {rec.evidencia_visual && rec.evidencia_visual !== 'null' && (
                    <p className="m-0 mb-2 text-[10px] italic leading-[1.6] text-[#7d8392]">📷 {rec.evidencia_visual}</p>
                  )}
                  {frameName && (
                    <img
                      className="mt-2 w-full rounded border border-[#ffe6d8] object-cover"
                      src={artifactUrl(analysis.id, `${frameName}.jpg`)}
                      alt={`Evidencia visual ${frameName}`}
                    />
                  )}
                </article>
              )
            })}
          </div>

          <p className="mb-0 mt-5 text-[11px] leading-relaxed text-[#7d8392]">{insights.resumen_ejecutivo}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              className="inline-flex items-center gap-1 rounded-lg border border-[#ff6b3d] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#ff6b3d] transition hover:bg-[#ff6b3d] hover:text-white"
              href={resolveApiUrl(`/api/analyses/${analysis.id}/insights/export?token=${getToken()}`)}
              target="_blank"
              rel="noreferrer"
            >
              ⬇ Exportar Word
            </a>
            <a
              className="inline-flex items-center gap-1 rounded-lg bg-[#1d7a3a] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#256f3c]"
              href={resolveApiUrl(`/api/analyses/${analysis.id}/insights/export-excel?token=${getToken()}`)}
              target="_blank"
              rel="noreferrer"
              title="Descarga un Excel con resumen, métricas por zona, recomendaciones y dashboard con gráficas"
            >
              📊 Exportar Excel
            </a>
            <a
              className="inline-flex items-center gap-1 rounded-lg bg-[#c0392b] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#a93226]"
              href={resolveApiUrl(`/api/analyses/${analysis.id}/insights/export-pdf?token=${getToken()}`)}
              target="_blank"
              rel="noreferrer"
              title="Descarga un PDF con resumen, métricas por zona, recomendaciones y gráficas"
            >
              📄 Exportar PDF
            </a>
          </div>
        </div>
      )}
    </section>
  )
}