import { ArrowRight, BarChart3, Building2, Clock, Flame, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { useAuth } from '../context/AuthProvider'
import { artifactUrl, listAnalyses } from '../services/analyses'

const completed = (analysis) => analysis.status === 'completed' && analysis.result
const formatDate = (value) => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { retailers, retailer, setRetailer } = useApp()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    listAnalyses()
      .then((items) => { if (active) setAnalyses(items || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!retailer && retailers.length) setRetailer(retailers[0])
  }, [retailer, retailers, setRetailer])

  const latest = useMemo(() => analyses.find(completed), [analyses])
  const recent = analyses.slice(0, 4)
  const metrics = latest?.result?.metrics || {}
  const video = latest?.result?.video || {}
  const hotZones = (latest?.result?.zones || []).filter((zone) => zone.classification === 'hot')
  const previewFrame = latest?.result?.annotated_frames?.[0]

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-[10px] border border-[#e5e7ee] bg-white/90 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
        <div className="flex h-[30px] items-center gap-1.5 border-b border-[#e5e7ee] bg-white/70 px-3"><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /></div>
        <div className="relative min-h-[calc(100vh-128px)] bg-[radial-gradient(circle_at_92%_88%,rgba(255,91,18,.10),transparent_24%),#fff] p-5 sm:p-7 lg:p-8">
          <div className="relative z-10">
            <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">02</span> Inicio</span>
                <h1 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[.92] text-[#151323]">Hola, {user?.name || 'Admin'}</h1>
                <p className="mt-2 text-sm leading-6 text-[#7d8392]">Selecciona una empresa, entra a una sede y revisa sus analisis.</p>
              </div>
              <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" onClick={() => navigate('/empresas')} type="button">
                <Building2 size={16} /> Mis empresas
              </button>
            </div>

            {error && <p className="mb-5 rounded-md border border-[#ffd2c2] bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{error}</p>}

            <div className="mb-5 grid gap-4 md:grid-cols-4">
              <Metric icon={<Users size={20} />} label="Personas" value={metrics.tracked_presences ?? metrics.people_detected ?? '-'} />
              <Metric icon={<Clock size={20} />} label="Permanencia" value={video.duration_seconds ? `${video.duration_seconds}s` : '-'} />
              <Metric icon={<Flame size={20} />} label="Zonas calientes" value={hotZones.length} />
              <Metric icon={<BarChart3 size={20} />} label="Analisis" value={analyses.length} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
              <article className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-black text-[#151323]">Ultimo analisis</h2>
                  {latest && <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[11px] font-black text-[#12824c]">Completado</span>}
                </div>
                {loading ? <p className="text-sm font-semibold text-[#7d8392]">Cargando analisis...</p> : latest ? (
                  <div className="grid gap-5 md:grid-cols-[230px_1fr]">
                    <div className="aspect-video overflow-hidden rounded-md bg-[#151323]">
                      {previewFrame ? <img className="h-full w-full object-cover" src={artifactUrl(latest.id, previewFrame)} alt="" /> : <div className="grid h-full place-items-center text-xs text-white/50">Sin frame</div>}
                    </div>
                    <div className="flex min-w-0 flex-col justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-[#7d8392]">{formatDate(latest.created_at)}</p>
                        <h3 className="mt-1 truncate text-2xl font-black text-[#151323]">{latest.filename}</h3>
                        {latest.result?.site?.name && <p className="mt-1 text-sm font-semibold text-[#7d8392]">Sede: {latest.result.site.name}</p>}
                      </div>
                      <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] w-fit" onClick={() => navigate(`/analyses/${latest.id}`)} type="button">Ver resultados <ArrowRight size={16} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-[#e5e7ee] bg-[#f8f8f7] p-6">
                    <p className="font-black text-[#151323]">Aun no hay analisis completados.</p>
                    <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] mt-4" onClick={() => navigate('/empresas')} type="button">Elegir negocio y sede</button>
                  </div>
                )}
              </article>

              <article className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
                <h2 className="mb-4 text-xl font-black text-[#151323]">Analisis recientes</h2>
                {recent.length ? <div className="grid gap-2">{recent.map((analysis) => (
                  <button key={analysis.id} className="grid gap-2 rounded-md border border-[#e5e7ee] px-4 py-3 text-left transition hover:border-[#ff5b12]" onClick={() => navigate(`/analyses/${analysis.id}`)} type="button">
                    <span className="min-w-0 truncate text-sm font-black text-[#151323]">{analysis.filename}</span>
                    <span className="text-xs font-semibold text-[#7d8392]">{formatDate(analysis.created_at)}</span>
                  </button>
                ))}</div> : <p className="text-sm font-semibold text-[#7d8392]">No hay analisis registrados todavia.</p>}
              </article>
            </div>
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

