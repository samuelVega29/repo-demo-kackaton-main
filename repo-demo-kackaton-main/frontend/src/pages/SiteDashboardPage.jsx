import { ArrowRight, Camera, CheckCircle2, Clock, Flame, Plus, Settings2, Store, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { artifactUrl, listAnalyses } from '../services/analyses'
import { calibrationStatusLabel, isMetricCalibrated, isSiteConfigured } from '../utils/siteConfiguration'

const completed = (analysis) => analysis.status === 'completed' && analysis.result
const formatDate = (value) => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '-'
const numberValue = (value) => Number.isFinite(Number(value)) ? value : '-'

export default function SiteDashboardPage() {
  const { site, loadSite } = useApp()
  const { siteId } = useParams()
  const [loadingSite, setLoadingSite] = useState(Boolean(siteId && (!site || String(site.id) !== String(siteId))))
  const [analyses, setAnalyses] = useState([])
  const [loadingAnalyses, setLoadingAnalyses] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (site && String(site.id) === String(siteId)) {
      setLoadingSite(false)
      return
    }
    setLoadingSite(true)
    loadSite(siteId).catch(() => {}).finally(() => setLoadingSite(false))
  }, [loadSite, site, siteId])

  useEffect(() => {
    if (!siteId) return undefined
    let active = true
    setLoadingAnalyses(true)
    listAnalyses({ site_id: siteId })
      .then((items) => { if (active) setAnalyses(items || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoadingAnalyses(false) })
    return () => { active = false }
  }, [siteId])

  const latest = useMemo(() => analyses.find(completed), [analyses])
  const configuration = site?.configuration ?? {}
  const configured = isSiteConfigured(site)
  const metricCalibrated = isMetricCalibrated(site)
  const calibrationLabel = calibrationStatusLabel(site)
  const gondolas = configuration.gondolas || []
  const metrics = latest?.result?.metrics || {}
  const video = latest?.result?.video || {}
  const hotZones = (latest?.result?.zones || []).filter((zone) => zone.classification === 'hot')
  const frame = latest?.result?.annotated_frames?.[0]

  if (loadingSite) return <section className="grid min-h-[calc(100vh-72px)] place-items-center bg-[#f6f6f4] p-6 text-sm font-black text-[#7d8392]">Cargando sede</section>
  if (!site) return <Navigate to="/empresas" replace />

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px]">
        <header className="mb-5 rounded-lg border border-[#e5e7ee] bg-white p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-black uppercase text-[#ff5b12]"><Store size={18} /> Sede seleccionada</span>
              <h1 className="mt-2 text-[clamp(30px,4vw,46px)] font-black leading-none text-[#151323]">{site.name}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#64748b]">
                {site.city || 'Ciudad no registrada'} - revisa la configuracion guardada, el historial y los KPIs antes de cargar un nuevo video.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" to={`/sedes/${site.id}/analisis/nuevo`}><Plus size={16} /> Nuevo analisis</Link>
              <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#d6e4f1] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12]" to={`/sedes/${site.id}/historial`}>Historial <ArrowRight size={16} /></Link>
            </div>
          </div>
        </header>

        {error && <p className="mb-5 rounded-md border border-[#ffd2c2] bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{error}</p>}

        <section className={`mb-5 rounded-lg border p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] ${configured ? 'border-[#bfe8d1] bg-[#f1fff7]' : 'border-[#ffd7c4] bg-[#fff7f2]'}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${configured ? 'bg-[#17a964] text-white' : 'bg-[#ff5b12] text-white'}`}>
                {configured ? <CheckCircle2 size={22} /> : <Settings2 size={22} />}
              </span>
              <div>
                <h2 className="text-xl font-black text-[#151323]">{configured ? 'Configuracion lista para reutilizar' : 'Configuracion pendiente'}</h2>
                <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#64748b]">
                  {configured
                    ? metricCalibrated
                      ? 'La camara, la calibracion metrica y las gondolas ya estan guardadas. Si el nuevo video usa la misma vista, puedes cargarlo y analizarlo sin rehacer el plano.'
                      : 'El plano y las gondolas ya estan guardados. Puedes reutilizar esta configuracion para analizar nuevos videos; calibra la camara solo si necesitas mediciones metricas exactas.'
                    : 'Primero define la camara, captura un frame claro y guarda las gondolas. Ese plano sera la base para todos los analisis de esta sede.'}
                </p>
              </div>
            </div>
            <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#d6e4f1] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12]" to={configured ? `/sites/${site.id}/planograma` : `/sites/${site.id}/video`}>
              {configured ? 'Revisar configuracion' : 'Configurar sede'}
            </Link>
          </div>
        </section>

        <section className="mb-5 grid gap-4 md:grid-cols-4">
          <Metric icon={<Video size={20} />} label="Analisis de la sede" value={analyses.length} />
          <Metric icon={<Flame size={20} />} label="Zonas calientes" value={hotZones.length} />
          <Metric icon={<Store size={20} />} label="Gondolas guardadas" value={gondolas.length} />
          <Metric icon={<Clock size={20} />} label="Pick-ups ultimo analisis" value={numberValue(metrics.pickup_events)} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <article className="rounded-lg border border-[#e5e7ee] bg-white p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black text-[#151323]">Resumen mas reciente</h2>
              {latest && <span className="rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[11px] font-black text-[#12824c]">Completado</span>}
            </div>
            {loadingAnalyses ? <p className="text-sm font-semibold text-[#7d8392]">Cargando analisis...</p> : latest ? (
              <div className="grid gap-5 md:grid-cols-[250px_1fr]">
                <div className="aspect-video overflow-hidden rounded-md bg-[#151323]">
                  {frame ? <img className="h-full w-full object-cover" src={artifactUrl(latest.id, frame)} alt="" /> : <div className="grid h-full place-items-center text-xs text-white/50">Sin frame</div>}
                </div>
                <div>
                  <p className="text-xs font-bold text-[#7d8392]">{formatDate(latest.created_at)}</p>
                  <h3 className="mt-1 text-2xl font-black text-[#151323]">{latest.filename}</h3>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Trace label="Personas" value={numberValue(metrics.tracked_presences)} />
                    <Trace label="Interacciones" value={numberValue(metrics.interaction_events)} />
                    <Trace label="Pick-ups" value={numberValue(metrics.pickup_events)} />
                    <Trace label="Duracion" value={video.duration_seconds ? `${video.duration_seconds}s` : '-'} />
                  </div>
                  <Link className="mt-4 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" to={`/analyses/${latest.id}`}>Ver resumen completo <ArrowRight size={16} /></Link>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[#e5e7ee] bg-[#f8f8f7] p-6">
                <p className="font-black text-[#151323]">Todavia no hay analisis para esta sede.</p>
                <Link className="mt-4 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" to={`/sedes/${site.id}/analisis/nuevo`}>Analizar primer video</Link>
              </div>
            )}
          </article>

          <article className="rounded-lg border border-[#e5e7ee] bg-white p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
            <h2 className="text-xl font-black text-[#151323]">Configuracion guardada</h2>
            <div className="mt-4 grid gap-3">
              <Trace icon={<Camera size={18} />} label="Camara" value={configuration.camera?.name || 'Camara principal'} />
              <Trace icon={<Settings2 size={18} />} label="Estado" value={calibrationLabel} />
              <Trace icon={<Store size={18} />} label="Gondolas" value={`${gondolas.length} guardadas`} />
            </div>
            <Link className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#d6e4f1] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12]" to={`/sites/${site.id}/planograma`}>Mirar plano actual <ArrowRight size={16} /></Link>
          </article>
        </section>

        <section className="mt-5 rounded-lg border border-[#e5e7ee] bg-white p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-black text-[#151323]">Historial de analisis</h2>
            <Link className="text-sm font-black text-[#ff5b12] no-underline" to={`/sedes/${site.id}/historial`}>Ver todo</Link>
          </div>
          {analyses.length ? <div className="grid gap-2">{analyses.slice(0, 5).map((analysis) => (
            <Link key={analysis.id} className="grid gap-2 rounded-md border border-[#e5e7ee] px-4 py-3 text-left no-underline transition hover:border-[#ff5b12] md:grid-cols-[1fr_auto_auto] md:items-center" to={`/analyses/${analysis.id}`}>
              <span className="min-w-0 truncate text-sm font-black text-[#151323]">{analysis.filename}</span>
              <span className="text-xs font-semibold text-[#7d8392]">{formatDate(analysis.created_at)}</span>
              <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black ${analysis.status === 'completed' ? 'bg-[#eaf8ef] text-[#17803f]' : analysis.status === 'failed' ? 'bg-[#fff1eb] text-[#b43b1d]' : 'bg-[#eef5ff] text-[#2f7df6]'}`}>{analysis.status}</span>
            </Link>
          ))}</div> : <p className="text-sm font-semibold text-[#7d8392]">No hay analisis registrados para esta sede.</p>}
        </section>
      </div>
    </section>
  )
}

function Metric({ icon, label, value }) {
  return (
    <article className="flex items-center gap-3 rounded-lg border border-[#e5e7ee] bg-white p-4 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#fff1eb] text-[#ff5b12]">{icon}</span>
      <span>
        <b className="block text-2xl font-black text-[#151323]">{value}</b>
        <span className="block text-xs font-bold text-[#7d8392]">{label}</span>
      </span>
    </article>
  )
}

function Trace({ icon, label, value }) {
  return (
    <div className="rounded-md border border-[#e5e7ee] bg-[#f8fafc] px-4 py-3">
      <span className="flex items-center gap-2 text-[11px] font-black uppercase text-[#7d8392]">{icon}{label}</span>
      <b className="mt-1 block text-sm font-black text-[#151323]">{value}</b>
    </div>
  )
}
