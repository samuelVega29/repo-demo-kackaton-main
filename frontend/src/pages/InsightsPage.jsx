import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { artifactUrl } from '../services/analyses'
import { api, getToken, resolveApiUrl } from '../services/client'
import flujoPuntos from '../assets/images/flujo_puntos.png'
import documentIcon from '../assets/images/icono_documento_3d.png'
import pieIcon from '../assets/images/icono_pastel_3d.png'
import advisorArt from '../assets/images/robot-recomendaciones-asesor.png'
import { Sparkles, LoaderCircle, ScanEye, FileText, Lightbulb, ArrowLeft, ArrowUpRight, Download, FileSpreadsheet, FileDown, TrendingUp, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'

const exportFormats = [
  { name: 'Word', extension: 'DOCX', endpoint: 'export', Icon: FileText, description: 'Edita el informe y prepara tu presentación.', style: 'bg-blue-50 text-blue-700 border-blue-100', button: 'bg-blue-600 group-hover:bg-blue-700' },
  { name: 'Excel', extension: 'XLSX', endpoint: 'export-excel', Icon: FileSpreadsheet, description: 'Explora las métricas por zona y sus gráficas.', style: 'bg-emerald-50 text-emerald-700 border-emerald-100', button: 'bg-emerald-600 group-hover:bg-emerald-700' },
  { name: 'PDF', extension: 'PDF', endpoint: 'export-pdf', Icon: FileDown, description: 'Comparte un informe listo para presentar.', style: 'bg-rose-50 text-rose-700 border-rose-100', button: 'bg-rose-600 group-hover:bg-rose-700' },
]

const recommendationStyles = [
  {
    card: 'border-orange-200 bg-[linear-gradient(145deg,#fff7ed_0%,#ffffff_48%,#fff1e7_100%)]',
    number: 'bg-orange-500 text-white shadow-orange-200',
    icon: 'text-orange-500',
    impact: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  {
    card: 'border-sky-200 bg-[linear-gradient(145deg,#eff8ff_0%,#ffffff_50%,#edf6ff_100%)]',
    number: 'bg-sky-500 text-white shadow-sky-200',
    icon: 'text-sky-500',
    impact: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  },
  {
    card: 'border-violet-200 bg-[linear-gradient(145deg,#f6f0ff_0%,#ffffff_50%,#fff4fa_100%)]',
    number: 'bg-violet-500 text-white shadow-violet-200',
    icon: 'text-violet-500',
    impact: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
  },
]

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
    <section className="min-h-screen bg-[linear-gradient(135deg,#f7fbff_0%,#eef6ff_48%,#ffffff_100%)]">
      <header className="relative isolate overflow-hidden bg-[#202021] text-white shadow-[0_22px_60px_-44px_rgba(18,22,33,.75)]">
        <img src={flujoPuntos} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-screen" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(17,24,39,.96)_0%,rgba(17,24,39,.84)_40%,rgba(17,24,39,.34)_100%)]" />
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#1683ff]/18 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-6 h-[360px] w-[150px] rounded-full bg-[#4fb4ff]/35 blur-3xl" />
        <div className="pointer-events-none absolute -left-28 -top-40 h-72 w-72 rounded-full border-[22px] border-[#ff7a1a]" />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-64 w-64 rounded-full border-[18px] border-[#ff7a1a] bg-[#071d25]" />
        <div className="relative mx-auto grid max-w-[1536px] items-center gap-4 px-5 py-7 sm:px-8 md:min-h-[340px] md:grid-cols-[1fr_1.2fr] md:py-0 lg:px-20">
          <div className="relative z-10 max-w-[430px]">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.32em] text-white/75">TU NEGOCIO, CON M&Aacute;S CLARIDAD</p>
            <h1 className="text-[clamp(29px,3.1vw,42px)] font-extrabold leading-[1.02] text-white">Mejora tu tienda <span className="text-[#ff7a1a]">con Scapder</span></h1>
            <p className="mt-4 max-w-[370px] text-[13px] font-semibold leading-6 text-white/85">Convierte los resultados en acciones para tu negocio, con recomendaciones y evidencia visual.</p>
            <a href="#recommendations-dashboard" className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-lg bg-[#ff7a1a] px-5 text-[13px] font-bold text-white transition hover:bg-[#ff5b12]">Explorar recomendaciones<ArrowUpRight size={17} aria-hidden="true" /></a>
          </div>
          <div className="relative mx-auto h-[220px] w-full max-w-[620px] sm:h-[260px] md:h-[340px]">
            <img src={advisorArt} alt="Robot asesor de Scapder organizando recomendaciones" className="absolute inset-0 h-full w-full object-contain" style={{ maskImage: 'radial-gradient(ellipse 48% 49% at 50% 50%, black 65%, transparent 100%)' }} />
            <img src={documentIcon} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-[14%] left-[6%] w-12 -rotate-12 drop-shadow-xl lg:w-16" />
            <img src={pieIcon} alt="" aria-hidden="true" className="pointer-events-none absolute right-[8%] top-[12%] w-12 rotate-12 drop-shadow-xl lg:w-16" />
          </div>
        </div>
      </header>
      <div id="recommendations-dashboard" className="mx-auto max-w-[1536px] scroll-mt-24 px-5 pb-12 pt-6 sm:px-8 lg:px-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3">
            <span className="text-[clamp(48px,6vw,64px)] font-extrabold leading-none text-[#ff8b3a]/90">05</span>
            <div><span className="text-[10px] font-bold uppercase tracking-[.22em] text-[#8a9ab0]">Paso 5</span><h2 className="text-[clamp(24px,3.5vw,36px)] font-extrabold leading-none text-[#07132c]">Recomendaciones</h2><p className="mt-2 text-[13px] font-medium text-[#58708f]">Acciones e informes para mejorar tu tienda.</p></div>
          </div>
          <Link to={`/analyses/${analysis.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#cfdef0] bg-white px-4 text-xs font-bold text-[#26364a] transition hover:border-[#ff7a1a] hover:text-[#ff5b12]"><ArrowLeft size={15} aria-hidden="true" />Volver a resultados</Link>
        </div>
      <div className="mb-5 rounded-2xl border border-[#e5e7ee] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-orange-50 text-orange-600"><Sparkles size={22} aria-hidden="true" /></span>
            <div><h2 className="text-sm font-bold text-[#151323]">{insights ? 'Tu asesor ya tiene un plan' : 'Activa tu asesor de tienda'}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{insights ? 'Revisa las oportunidades, consulta su evidencia y lleva el informe a tu equipo.' : 'Transforma las métricas de este análisis en ideas para mejorar tu espacio.'}</p>
            </div>
          </div>
        <button
          type="button"
          onClick={() => generateInsights(Boolean(insights))}
          disabled={insightsLoading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#ff7a1a] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#ed6909] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {insightsLoading ? <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden="true" /> : insights ? <RefreshCw size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}
          {insightsLoading ? 'Preparando recomendaciones…' : insights ? 'Regenerar recomendaciones' : 'Generar recomendaciones con IA'}
        </button>
        </div>
        <p className="mb-0 mt-3 border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500">
          Generado con Claude a partir de las métricas y los fotogramas del análisis. Puede tardar unos minutos.
        </p>
        {insightsError && <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} className="shrink-0" aria-hidden="true" />{insightsError}</p>}
      </div>

      {insightsLoading && <div role="status" className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 text-sm leading-6 text-orange-900">Tu asesor está revisando las métricas y la evidencia visual. Las recomendaciones pueden tardar unos minutos.</div>}

      {!insights && !insightsLoading && (
        <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 p-6 text-center text-sm leading-6 text-slate-500">
          <Lightbulb size={28} className="mx-auto mb-3 text-[#ff7a1a]" aria-hidden="true" />
          <h2 className="mb-1 text-sm font-bold text-[#151323]">Hay oportunidades por descubrir</h2>
          Genera las recomendaciones para ver acciones sugeridas y sus evidencias, y descargar tu informe.
        </div>
      )}

      {insights && (
        <div className="space-y-5">
          <nav aria-label="Secciones de recomendaciones" className="flex flex-wrap gap-2 border-b border-orange-200/60 pb-3 text-xs font-semibold">
            {[['#insight-summary', 'Resumen'], ['#insight-actions', 'Recomendaciones'], ['#insight-downloads', 'Descargar informe']].map(([href, label]) => <a key={href} href={href} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600 transition hover:border-orange-300 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-orange-500">{label}<ArrowUpRight size={14} aria-hidden="true" /></a>)}
          </nav>

          <section id="insight-summary" className="scroll-mt-24 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_45px_-32px_rgba(255,122,26,.55)]">
            <div className="grid lg:grid-cols-[1.4fr_1fr]">
              <div className="border-b border-orange-100 bg-[linear-gradient(135deg,#fff2e8_0%,#fffaf7_55%,#ffffff_100%)] p-5 lg:border-b-0 lg:border-r">
                <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-orange-700"><Lightbulb size={16} aria-hidden="true" /> Hallazgo principal</span>
                <h2 className="mb-4 mt-3 max-w-5xl text-lg font-extrabold leading-7 text-[#151323]">{insights.hallazgo_principal || 'Tu análisis está listo para revisar'}</h2>
                <span className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm"><CheckCircle2 size={14} aria-hidden="true" />{(insights.recomendaciones || []).length} recomendaciones generadas</span>
              </div>
              <div className="bg-[linear-gradient(135deg,#ffffff_0%,#f0f8ff_100%)] p-5">
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600"><FileText size={21} aria-hidden="true" /></span>
                <h2 className="mb-3 text-sm font-bold text-[#151323]">La visión general</h2>
                <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{insights.resumen_ejecutivo || 'Explora las recomendaciones para conocer los detalles de este análisis.'}</p>
              </div>
            </div>
          </section>

          <section id="insight-actions" className="scroll-mt-24">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-orange-700">DE LOS DATOS A LA ACCIÓN</p><h2 className="text-lg font-bold tracking-tight text-[#151323]">Oportunidades para tu tienda</h2></div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{(insights.recomendaciones || []).length} acciones sugeridas</span>
            </div>
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(insights.recomendaciones || []).map((rec, index) => {
                const frameName = frameNameFromEvidence(rec.evidencia_visual)
                const style = recommendationStyles[index % recommendationStyles.length]
                return (
                  <article key={`${rec.titulo}-${index}`} className={`group overflow-hidden rounded-2xl border ${style.card} shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_45px_-30px_rgba(15,23,42,.45)]`}>
                    <div className="p-5">
                      <div className="mb-4 flex items-center justify-between"><span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-extrabold shadow-lg ${style.number}`}>{String(index + 1).padStart(2, '0')}</span><Lightbulb size={21} className={style.icon} aria-hidden="true" /></div>
                      <h3 className="mb-3 text-[15px] font-extrabold leading-snug text-[#151323]">{rec.titulo}</h3>
                      <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Por qué importa</h4>
                      <p className="line-clamp-[9] text-sm leading-6 text-slate-700">{rec.justificacion}</p>
                      {rec.impacto_estimado && <div className={`mt-4 rounded-xl border p-4 ${style.impact}`}><h4 className="mb-2 flex items-center gap-2 text-xs font-extrabold"><TrendingUp size={16} aria-hidden="true" /> Impacto estimado</h4><p className="line-clamp-4 text-sm leading-6">{rec.impacto_estimado}</p></div>}
                    </div>
                    {rec.evidencia_visual && rec.evidencia_visual !== 'null' && (
                      <div className="border-t border-white/80 bg-white/72 p-4 backdrop-blur">
                        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><ScanEye size={16} aria-hidden="true" /> Evidencia del análisis</h4>
                        <p className="line-clamp-3 text-sm leading-6 text-slate-600">{rec.evidencia_visual}</p>
                        {frameName && <a href={artifactUrl(analysis.id, `${frameName}.jpg`)} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl border border-white bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-orange-500"><img loading="lazy" className="h-36 w-full object-cover transition duration-200 group-hover:scale-[1.02]" src={artifactUrl(analysis.id, `${frameName}.jpg`)} alt={`Evidencia de ${rec.titulo}: ${frameName}`} /><span className="flex items-center justify-between px-3 py-2.5 text-xs font-bold text-slate-700 group-hover:text-orange-700">Ampliar evidencia · {frameName}<ArrowUpRight size={15} aria-hidden="true" /></span></a>}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
            {!insights.recomendaciones?.length && <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">Este informe no contiene acciones sugeridas. Puedes regenerarlo para solicitar un nuevo análisis.</p>}
          </section>

          <section id="insight-downloads" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#172536] text-white"><Download size={22} aria-hidden="true" /></span>
              <div><h2 className="text-sm font-bold text-[#151323]">Descargar informe</h2><p className="mt-1 text-xs text-slate-500">Selecciona el formato para tu equipo.</p></div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {exportFormats.map(({ name, extension, endpoint, Icon, description, style }) => (
                <a key={name} href={resolveApiUrl(`/api/analyses/${analysis.id}/insights/${endpoint}?token=${getToken()}`)} target="_blank" rel="noreferrer" title={description} aria-label={`Descargar informe en ${name} (${extension})`} className="group flex min-h-14 items-center gap-3 rounded-lg border border-[#e5e7ee] bg-white px-3 py-2.5 transition hover:border-orange-300 hover:bg-[#fffaf7] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${style}`}><Icon size={19} aria-hidden="true" /></span>
                  <span className="flex-1 text-sm font-semibold text-[#151323]">{name}<span className="ml-2 text-[10px] font-medium text-slate-400">.{extension.toLowerCase()}</span></span>
                  <Download size={16} className="text-slate-400 group-hover:text-orange-600" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        </div>
      )}
      </div>
    </section>
  )
}
