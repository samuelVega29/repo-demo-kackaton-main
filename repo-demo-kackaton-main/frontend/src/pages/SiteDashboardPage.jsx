import { ArrowRight, Camera, CheckCircle2, Plus, Settings2, Store, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { artifactUrl, listAnalyses } from '../services/analyses'
import { calibrationStatusLabel, isMetricCalibrated, isSiteConfigured } from '../utils/siteConfiguration'
import flujoPuntos from '../assets/images/flujo_puntos.png'
import robotGondola from '../assets/images/robot_gondola.png'
import metricVideoIcon from '../assets/images/icon1.png'
import metricFlameIcon from '../assets/images/icon2.png'
import metricStoreIcon from '../assets/images/icon3.png'
import metricClockIcon from '../assets/images/icon4.png'

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
  const reviewConfigurationPath = `/sedes/${site?.id || siteId}/analisis/nuevo`

  if (loadingSite) return <section className="grid min-h-[calc(100vh-72px)] place-items-center bg-[#f6f6f4] p-6 text-sm font-black text-[#7d8392]">Cargando sede</section>
  if (!site) return <Navigate to="/empresas" replace />

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[linear-gradient(180deg,#f8fbff_0%,#fff8f4_54%,#f8fbff_100%)] px-0 py-0">
      <header className="relative isolate left-1/2 mb-5 min-h-[430px] w-screen -translate-x-1/2 overflow-hidden border-b border-[#12314b] bg-[#111923] px-4 py-6 text-white shadow-[0_32px_92px_-52px_rgba(4,19,33,.95)] sm:min-h-[500px] sm:px-6 sm:py-9 lg:min-h-[420px] lg:px-10" data-tour="dashboard-hero">
        <img src={flujoPuntos} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-screen" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(17,24,39,.97)_0%,rgba(17,24,39,.9)_42%,rgba(17,24,39,.42)_100%)]" />
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#1683ff]/18 blur-3xl" />
        <div className="pointer-events-none absolute right-[-80px] top-8 h-[390px] w-[170px] rounded-full bg-[#4fb4ff]/30 blur-3xl lg:right-[-52px] lg:h-[455px] lg:w-[205px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-[330px] w-[2px] bg-[linear-gradient(180deg,transparent,#8fd3ff,transparent)] shadow-[0_0_26px_8px_rgba(88,181,255,.66)]" />
        <div className="pointer-events-none absolute left-[7%] top-[28%] h-1.5 w-1.5 rounded-full bg-[#65c8ff] shadow-[0_0_18px_5px_rgba(101,200,255,.65)]" />
        <div className="pointer-events-none absolute left-[20%] top-[20%] h-1 w-1 rounded-full bg-[#65c8ff] shadow-[0_0_14px_4px_rgba(101,200,255,.55)]" />
        <div className="pointer-events-none absolute left-[15%] bottom-[30%] h-1.5 w-1.5 rounded-full bg-[#65c8ff] shadow-[0_0_18px_5px_rgba(101,200,255,.6)]" />
        <div className="pointer-events-none absolute left-[30%] bottom-[42%] h-1 w-1 rounded-full bg-[#65c8ff] shadow-[0_0_14px_4px_rgba(101,200,255,.55)]" />
        <div className="pointer-events-none absolute -left-[34%] -top-[12%] h-64 w-64 rounded-full border-[16px] border-[#ff7a1a]/80 sm:-left-[18%] sm:-top-[20%] sm:h-72 sm:w-72 lg:-left-[9%] lg:-top-[24%] lg:border-[18px]" />
        <div className="pointer-events-none absolute -right-16 bottom-[-92px] h-60 w-60 rounded-full border-[18px] border-[#ff7a1a]/40" />
        <div className="pointer-events-none absolute bottom-0 right-[20%] h-36 w-36 rounded-full bg-[#ff7a1a]/12 blur-2xl" />
        <img className="pointer-events-none absolute bottom-[4px] right-[2%] hidden h-[385px] w-auto object-contain opacity-100 drop-shadow-[0_30px_38px_rgba(0,0,0,.58)] md:block lg:right-[7%] lg:h-[450px]" src={robotGondola} alt="" aria-hidden="true" />
        <div className="relative z-10 mx-auto grid min-h-[382px] w-full max-w-[1480px] items-start gap-4 pt-1 sm:min-h-[430px] sm:items-center sm:pt-0 lg:min-h-[340px] lg:grid-cols-[minmax(0,820px)_1fr]">
          <div className="max-w-[820px] rounded-[18px] bg-[#071d25]/30 p-3.5 backdrop-blur-[1px] sm:p-5 lg:bg-transparent lg:p-0 lg:backdrop-blur-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#ff8a3d]/30 bg-[#ff7a1a]/12 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#ff8a3d]"><Store size={15} /> Sede seleccionada</span>
            <h1 className="mt-3 max-w-[680px] break-words text-[clamp(30px,10vw,74px)] font-black leading-[.9] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,.36)] sm:mt-4 sm:text-[clamp(42px,7vw,74px)]">{site.name}</h1>
            <p className="mt-3 max-w-[760px] text-[12px] font-semibold leading-5 text-white/78 sm:mt-4 sm:text-[15px] sm:leading-7">
              {site.city || 'Ciudad no registrada'} - revisa la configuracion guardada, el historial y los KPIs antes de cargar un nuevo video.
            </p>
            <div className="mt-5 hidden max-w-[560px] gap-2 sm:grid sm:grid-cols-3">
              <HeroBadge tone="orange" icon={<CheckCircle2 size={13} />} label="Plano" value="Reutilizable" />
              <HeroBadge tone="green" icon={<Store size={13} />} label="Gondolas" value={`${gondolas.length} guardadas`} />
              <HeroBadge tone="blue" icon={<Camera size={13} />} label="Flujo" value="Listo" />
            </div>
            <img className="mx-auto mt-4 h-[150px] w-auto object-contain drop-shadow-[0_24px_28px_rgba(0,0,0,.48)] md:hidden" src={robotGondola} alt="" aria-hidden="true" />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:flex-wrap sm:gap-3">
              <Link className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#ff7a1a] px-3 text-[13px] font-black text-white no-underline shadow-[0_18px_38px_-18px_rgba(255,122,26,.98)] ring-1 ring-white/10 transition hover:-translate-y-px hover:bg-[#ff5b12] sm:w-auto sm:min-h-[58px] sm:gap-3 sm:px-7 sm:text-[16px]" to={`/sedes/${site.id}/analisis/nuevo`}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[#ff7a1a] sm:h-7 sm:w-7"><Plus size={16} /></span>
                Nuevo analisis
              </Link>
              <Link className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-[#071d25]/72 px-3 text-[13px] font-black text-white no-underline shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_18px_36px_-24px_rgba(0,0,0,.9)] backdrop-blur-md transition hover:-translate-y-px hover:border-[#ff8a3d] hover:bg-[#102942]/82 sm:w-auto sm:min-h-[58px] sm:gap-3 sm:px-7 sm:text-[16px]" to={`/sedes/${site.id}/historial`}>
                Historial <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1480px] px-3 pb-4 sm:px-5 lg:px-8">

        {error && <p className="mb-5 rounded-md border border-[#ffd2c2] bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{error}</p>}

        <section className={`relative mb-4 overflow-hidden rounded-lg border p-3 shadow-[0_18px_55px_-44px_rgba(18,22,33,.6)] sm:p-4 ${configured ? 'border-[#bfe8d1] bg-[#effdf6]' : 'border-[#ffd7c4] bg-[#fff7f2]'}`} data-tour="dashboard-config">
          <div className="pointer-events-none absolute right-[-42px] top-[-46px] h-28 w-28 rounded-full bg-[#17a964]/10" />
          <div className="pointer-events-none absolute left-[44%] bottom-[-54px] h-28 w-28 rounded-full bg-[#39d98a]/10" />
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative flex items-start gap-3 sm:items-center sm:gap-4">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-md shadow-[0_18px_36px_-22px_rgba(23,169,100,.95)] ${configured ? 'bg-[#17a964] text-white' : 'bg-[#ff5b12] text-white'}`}>
                {configured ? <CheckCircle2 size={24} /> : <Settings2 size={22} />}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-[#151323]">{configured ? 'Configuracion lista para reutilizar' : 'Configuracion pendiente'}</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-[#17a964] shadow-[0_10px_24px_-20px_rgba(23,169,100,.9)]"><CheckCircle2 size={12} /> Lista</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf4ff] px-2.5 py-1 text-[10px] font-black uppercase text-[#1f6feb]"><Camera size={12} /> Camara</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[10px] font-black uppercase text-[#12824c]"><Store size={12} /> Gondolas</span>
                </div>
                <p className="mt-1 max-w-4xl text-xs font-semibold leading-5 text-[#64748b] sm:text-sm sm:leading-6">
                  {configured
                    ? metricCalibrated
                      ? 'La camara, la calibracion metrica y las gondolas ya estan guardadas. Si el nuevo video usa la misma vista, puedes cargarlo y analizarlo sin rehacer el plano.'
                      : 'El plano y las gondolas ya estan guardados. Puedes reutilizar esta configuracion para analizar nuevos videos; calibra la camara solo si necesitas mediciones metricas exactas.'
                    : 'Primero define la camara, captura un frame claro y guarda las gondolas. Ese plano sera la base para todos los analisis de esta sede.'}
                </p>
              </div>
            </div>
            <Link className="relative inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#8fc7ff] bg-white px-5 text-[13px] font-black text-[#151323] no-underline shadow-[0_16px_34px_-26px_rgba(31,111,235,.9)] transition hover:-translate-y-px hover:border-[#ff5b12] sm:w-auto" to={configured ? reviewConfigurationPath : `/sites/${site.id}/video`}>
              {configured ? 'Revisar configuracion' : 'Configurar sede'} <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <section className="mb-3 grid gap-3 md:grid-cols-4" data-tour="dashboard-metrics">
          <Metric accent="orange" icon={metricVideoIcon} label="Analisis de la sede" value={analyses.length} />
          <Metric accent="warm" icon={metricFlameIcon} label="Zonas calientes" value={hotZones.length} />
          <Metric accent="blue" icon={metricStoreIcon} label="Gondolas guardadas" value={gondolas.length} />
          <Metric accent="violet" icon={metricClockIcon} label="Pick-ups ultimo analisis" value={numberValue(metrics.pickup_events)} />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
          <article className="relative overflow-hidden rounded-lg border border-[#ffd4bf] bg-[linear-gradient(135deg,#ffffff_0%,#fffaf6_62%,#fff0e7_100%)] p-3 shadow-[0_24px_74px_-50px_rgba(255,91,18,.75)]">
            <div className="pointer-events-none absolute right-[-54px] top-[-58px] h-40 w-40 rounded-full bg-[#ff5b12]/10" />
            <div className="pointer-events-none absolute bottom-[-70px] left-[18%] h-32 w-32 rounded-full bg-[#1f6feb]/8" />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[17px] font-black text-[#151323]"><Video className="text-[#ff5b12]" size={18} /> Resumen mas reciente</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${latest ? 'bg-[#eaf8ef] text-[#12824c]' : 'bg-[#f1f5f9] text-[#7d8392]'}`}>{latest ? 'Completado' : 'Sin analisis'}</span>
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
              <div className="relative grid min-h-[220px] place-items-center rounded-md border border-dashed border-[#ffd0ba] bg-[radial-gradient(circle_at_50%_20%,rgba(255,91,18,.12),transparent_30%),radial-gradient(circle_at_85%_72%,rgba(31,111,235,.1),transparent_24%),#ffffff] p-4 text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,.7)] sm:min-h-[260px] sm:p-6">
                <div>
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fff1eb] text-[#ff5b12] shadow-[0_18px_40px_-26px_rgba(255,91,18,.75)]"><Video size={30} /></span>
                  <p className="mt-4 font-black text-[#151323]">Todavia no hay analisis para esta sede.</p>
                  <p className="mt-1 text-xs font-semibold text-[#7d8392]">Carga un video para empezar a obtener insights sobre el comportamiento de tus clientes.</p>
                  <Link className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-5 text-[13px] font-black text-white no-underline shadow-[0_18px_38px_-22px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08] sm:w-auto sm:px-6" to={`/sedes/${site.id}/analisis/nuevo`}>Analizar primer video <ArrowRight size={15} /></Link>
                </div>
              </div>
            )}
          </article>

          <article className="relative overflow-hidden rounded-lg border border-[#ffd4bf] bg-[linear-gradient(145deg,#ffffff,#fff7f2_68%,#eef6ff)] p-3 shadow-[0_24px_74px_-48px_rgba(255,91,18,.68)]">
            <div className="pointer-events-none absolute right-[-36px] top-[-36px] h-28 w-28 rounded-full bg-[#ff5b12]/12" />
            <div className="pointer-events-none absolute bottom-[78px] left-[-42px] h-24 w-24 rounded-full bg-[#1f6feb]/10" />
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[17px] font-black text-[#151323]"><Settings2 className="text-[#ff5b12]" size={18} /> Configuracion guardada</h2>
              {configured && <span className="rounded-full bg-[#eaf8ef] px-2.5 py-1 text-[10px] font-black text-[#12824c]">Lista para usar</span>}
            </div>
            <div className="mt-3 grid gap-3">
              <Trace icon={<Camera size={18} />} label="Camara" value={configuration.camera?.name || 'Camara principal'} />
              <Trace icon={<Settings2 size={18} />} label="Estado" value={calibrationLabel} />
              <Trace icon={<Store size={18} />} label="Gondolas" value={`${gondolas.length} guardadas`} />
            </div>
            <Link className="mt-4 inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-md border border-[#8fc7ff] bg-[linear-gradient(90deg,#ffffff,#fff7f2)] px-4 text-[12px] font-black text-[#151323] no-underline shadow-[0_12px_30px_-24px_rgba(31,111,235,.75)] transition hover:-translate-y-px hover:border-[#ff5b12]" to={reviewConfigurationPath}>Ver plano guardado <ArrowRight size={15} /></Link>
            <div className="relative mt-3 min-h-[94px] overflow-hidden rounded-md bg-[#041321] p-3 pr-[160px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_18px_40px_-28px_rgba(4,19,33,.9)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(255,91,18,.4),transparent_25%),linear-gradient(90deg,rgba(4,19,33,1),rgba(4,19,33,.82))]" />
              <div className="relative z-10">
                <p className="text-xs font-black">Listo para descubrir nuevos insights?</p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-white/65">Analiza un video y conecta el comportamiento real con tus gondolas.</p>
              </div>
              <img src={robotGondola} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-[-8px] right-[-4px] z-10 h-[122px] w-auto object-contain drop-shadow-[0_18px_20px_rgba(0,0,0,.45)]" />
            </div>
          </article>
        </section>

        <section className="relative mt-4 overflow-hidden rounded-lg border border-[#ffc6aa] bg-[linear-gradient(135deg,#fff7f2,#ffffff_48%,#eef6ff)] p-5 shadow-[0_24px_74px_-48px_rgba(255,91,18,.7)]" data-tour="dashboard-history">
          <div className="pointer-events-none absolute right-[-44px] top-[-62px] h-36 w-36 rounded-full bg-[#ff5b12]/12" />
          <div className="pointer-events-none absolute left-[44%] bottom-[-70px] h-36 w-36 rounded-full bg-[#1f6feb]/10" />
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-[11px] font-black uppercase text-[#ff5b12]">Seguimiento de actividad</span>
              <h2 className="text-2xl font-black text-[#151323]">Historial de analisis</h2>
            </div>
            <Link className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-sm font-black text-white no-underline shadow-[0_16px_34px_-22px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08]" to={`/sedes/${site.id}/historial`}>Ver todo <ArrowRight size={15} /></Link>
          </div>
          {analyses.length ? <div className="grid gap-2">{analyses.slice(0, 5).map((analysis) => (
            <Link key={analysis.id} className="grid gap-2 rounded-md border border-[#e5e7ee] px-4 py-3 text-left no-underline transition hover:border-[#ff5b12] md:grid-cols-[1fr_auto_auto] md:items-center" to={`/analyses/${analysis.id}`}>
              <span className="min-w-0 truncate text-sm font-black text-[#151323]">{analysis.filename}</span>
              <span className="text-xs font-semibold text-[#7d8392]">{formatDate(analysis.created_at)}</span>
              <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black ${analysis.status === 'completed' ? 'bg-[#eaf8ef] text-[#17803f]' : analysis.status === 'failed' ? 'bg-[#fff1eb] text-[#b43b1d]' : 'bg-[#eef5ff] text-[#2f7df6]'}`}>{analysis.status}</span>
            </Link>
          ))}</div> : <div className="relative rounded-md border border-dashed border-[#ffc6aa] bg-white/70 px-4 py-5">
            <p className="text-sm font-black text-[#151323]">No hay analisis registrados para esta sede.</p>
            <p className="mt-1 text-xs font-semibold text-[#7d8392]">Cuando subas videos, apareceran aqui con fecha, estado y acceso rapido al resumen.</p>
          </div>}
        </section>
      </div>
    </section>
  )
}

function Metric({ accent, icon, label, value }) {
  const accents = {
    orange: 'before:bg-[#ff5b12] shadow-[0_18px_45px_-40px_rgba(255,91,18,.8)]',
    warm: 'before:bg-[#ff9c2f] shadow-[0_18px_45px_-40px_rgba(255,156,47,.8)]',
    blue: 'before:bg-[#1f6feb] shadow-[0_18px_45px_-40px_rgba(31,111,235,.8)]',
    violet: 'before:bg-[#8057ff] shadow-[0_18px_45px_-40px_rgba(128,87,255,.8)]',
  }
  return (
    <article className={`relative flex min-h-[78px] items-center justify-between gap-3 overflow-hidden rounded-lg border border-[#e5e7ee] bg-white p-3 before:absolute before:left-0 before:top-0 before:h-full before:w-[4px] ${accents[accent] || accents.orange}`}>
      <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-[#fff1eb] shadow-[0_16px_30px_-22px_rgba(255,91,18,.8)]">
        <img className="h-full w-full object-contain p-1" src={icon} alt="" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-2xl font-black text-[#151323]">{value}</b>
        <span className="block text-xs font-bold text-[#7d8392]">{label}</span>
      </span>
      <ArrowRight className="text-[#94a3b8]" size={16} />
    </article>
  )
}

function HeroBadge({ icon, label, tone, value }) {
  const tones = {
    orange: 'border-[#ff8a3d]/45 bg-[#ff7a1a]/16 shadow-[0_14px_28px_-24px_rgba(255,122,26,.95)]',
    green: 'border-[#39d98a]/45 bg-[#0f9f68]/18 shadow-[0_14px_28px_-24px_rgba(57,217,138,.95)]',
    blue: 'border-[#65c8ff]/45 bg-[#1683ff]/16 shadow-[0_14px_28px_-24px_rgba(101,200,255,.95)]',
  }

  return (
    <span className={`relative inline-flex min-h-[42px] min-w-0 items-center overflow-hidden rounded-md border px-2.5 py-1.5 backdrop-blur-sm ${tones[tone] || tones.blue}`}>
      <span className="pointer-events-none absolute right-[-12px] top-[-20px] h-12 w-12 rounded-full bg-white/8" />
      <span className="relative flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">{icon}</span>
        <span>
          <span className="block text-[8px] font-black uppercase tracking-wide text-white/52">{label}</span>
          <b className="block text-[11px] font-black leading-tight text-white">{value}</b>
        </span>
      </span>
    </span>
  )
}

function Trace({ icon, label, value }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-[#dbe5f0] bg-[linear-gradient(135deg,#f8fbff,#fff_55%,#fff4ec)] px-4 py-3 shadow-[inset_4px_0_0_rgba(255,91,18,.2),0_14px_34px_-32px_rgba(31,111,235,.8)] transition hover:border-[#8fc7ff]">
      <span className="flex items-center gap-2 text-[11px] font-black uppercase text-[#7d8392]">
        <span className="text-[#6b7d96]">{icon}</span>
        {label}
      </span>
      <b className="mt-1 block text-sm font-black text-[#151323]">{value}</b>
    </div>
  )
}
