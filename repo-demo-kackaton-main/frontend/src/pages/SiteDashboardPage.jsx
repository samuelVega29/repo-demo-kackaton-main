import { ArrowRight, Camera, Clock, Flame, Plus, Store, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { artifactUrl, listAnalyses } from '../services/analyses'

const completed = (analysis) => analysis.status === 'completed' && analysis.result
const formatDate = (value) => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''

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
  const cameras = configuration.camera ? 1 : 0
  const metrics = latest?.result?.metrics || {}
  const video = latest?.result?.video || {}
  const hotZones = (latest?.result?.zones || []).filter((zone) => zone.classification === 'hot')
  const frame = latest?.result?.annotated_frames?.[0]

  if (loadingSite) return <section className="grid min-h-[calc(100vh-72px)] place-items-center bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 text-sm font-black text-[#7d8392] sm:px-6 lg:px-10">Cargando sede</section>
  if (!site) return <Navigate to="/empresas" replace />

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-[10px] border border-[#e5e7ee] bg-white/90 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
        <div className="flex h-[30px] items-center gap-1.5 border-b border-[#e5e7ee] bg-white/70 px-3"><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /></div>
        <div className="relative min-h-[calc(100vh-128px)] bg-[radial-gradient(circle_at_92%_88%,rgba(255,91,18,.10),transparent_24%),#fff] p-5 sm:p-7 lg:p-8">
          <div className="relative z-10">
            <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">06</span> Detalle de sede</span>
                <h1 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[.92] text-[#151323]">Sede {site.name}</h1>
                <p className="mt-2 text-sm leading-6 text-[#7d8392]">{site.city || 'Ciudad no registrada'} · Dashboard con análisis de esta sede.</p>
              </div>
              <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" to={`/sedes/${site.id}/analisis/nuevo`}><Plus size={16} /> Nuevo analisis</Link>
            </div>

            {error && <p className="mb-5 rounded-md border border-[#ffd2c2] bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{error}</p>}

            <div className="mb-5 grid gap-4 md:grid-cols-4">
              <Metric icon={<Camera size={20} />} label="Camaras" value={cameras || '-'} />
              <Metric icon={<Video size={20} />} label="Analisis" value={analyses.length} />
              <Metric icon={<Clock size={20} />} label="Ultimo analisis" value={latest ? 'Hoy' : '-'} />
              <Metric icon={<Flame size={20} />} label="Zonas calientes" value={hotZones.length} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
              <article className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black text-[#151323]">Ultimo analisis</h2>
                  {latest && <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[11px] font-black text-[#12824c]">Completado</span>}
                </div>
                {loadingAnalyses ? <p className="text-sm font-semibold text-[#7d8392]">Cargando analisis...</p> : latest ? (
                  <div className="grid gap-5 md:grid-cols-[250px_1fr]">
                    <div className="aspect-video overflow-hidden rounded-md bg-[#151323]">
                      {frame ? <img className="h-full w-full object-cover" src={artifactUrl(latest.id, frame)} alt="" /> : <div className="grid h-full place-items-center text-xs text-white/50">Sin frame</div>}
                    </div>
                    <div className="flex flex-col justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-[#7d8392]">{formatDate(latest.created_at)}</p>
                        <h3 className="mt-1 text-2xl font-black text-[#151323]">{latest.filename}</h3>
                        <p className="mt-2 text-sm font-semibold text-[#7d8392]">{video.duration_seconds ? `${video.duration_seconds}s` : 'Duracion no disponible'}</p>
                      </div>
                      <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] w-fit" to={`/analyses/${latest.id}`}>Ver resultados <ArrowRight size={16} /></Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-[#e5e7ee] bg-[#f8f8f7] p-6">
                    <p className="font-black text-[#151323]">Aun no hay analisis para esta sede.</p>
                    <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] mt-4" to={`/sedes/${site.id}/analisis/nuevo`}>Analizar primer video</Link>
                  </div>
                )}
              </article>

              <article className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
                <h2 className="text-xl font-black text-[#151323]">Camaras de la sede</h2>
                <div className="mt-4 rounded-md border border-[#e5e7ee] bg-[#f8f8f7] p-4">
                  <Store className="mb-3 text-[#ff5b12]" size={28} />
                  <h3 className="font-black text-[#151323]">{configuration.camera?.name || 'Camara principal'}</h3>
                  <p className="mt-1 text-sm font-semibold text-[#7d8392]">Configuracion vinculada al backend de esta sede.</p>
                </div>
              </article>
            </div>

            <section className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] mt-5 p-5">
              <h2 className="mb-4 text-xl font-black text-[#151323]">Analisis recientes</h2>
              {analyses.length ? <div className="grid gap-2">{analyses.map((analysis) => (
                <Link key={analysis.id} className="grid gap-2 rounded-md border border-[#e5e7ee] px-4 py-3 text-left no-underline transition hover:border-[#ff5b12] md:grid-cols-[1fr_auto_auto] md:items-center" to={`/analyses/${analysis.id}`}>
                  <span className="min-w-0 truncate text-sm font-black text-[#151323]">{analysis.filename}</span>
                  <span className="text-xs font-semibold text-[#7d8392]">{formatDate(analysis.created_at)}</span>
                  <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black ${analysis.status === 'completed' ? 'bg-[#eaf8ef] text-[#17803f]' : analysis.status === 'failed' ? 'bg-[#fff1eb] text-[#b43b1d]' : 'bg-[#eef5ff] text-[#2f7df6]'}`}>{analysis.status}</span>
                </Link>
              ))}</div> : <p className="text-sm font-semibold text-[#7d8392]">No hay analisis registrados para esta sede.</p>}
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ icon, label, value }) {
  return (
    <article className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#fff1eb] text-[#ff5b12]">{icon}</span>
      <span>
        <b className="block text-2xl font-black text-[#151323]">{value}</b>
        <span className="block text-xs font-bold text-[#7d8392]">{label}</span>
      </span>
    </article>
  )
}

