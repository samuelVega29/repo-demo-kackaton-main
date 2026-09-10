import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Map, Video, ArrowDown, ArrowRight } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import {
  Area,
  AreaChart as ReAreaChart,
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart as RePieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart as ReRadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../context/AppProvider'
import { artifactUrl } from '../services/analyses'
import StoreScene from '../components/StoreScene'
import ShelfMatrix from '../components/ShelfMatrix'
import AnalysisVideo from '../components/AnalysisVideo'
import AnalysisInsights from '../components/AnalysisInsights'
import analysisArt from '../assets/images/robot-resultados-pose.png'
import orbitArt from '../assets/images/flujo_puntos.png'
import usersIcon from '../assets/images/icono_usuarios_3d.png'
import clockIcon from '../assets/images/icon4.png'
import framesIcon from '../assets/images/icono_documento_3d.png'
import pickupIcon from '../assets/images/icono_carrito_3d.png'
import speedIcon from '../assets/images/icono_crecimiento_3d.png'
import flowIcon from '../assets/images/icono_analitica_3d.png'

const modes = [['traffic', 'Trafico'], ['dwell', 'Permanencia'], ['interaction', 'Interaccion'], ['pickup', 'Pick-up']]
const chartColors = ['#ff5f7e', '#8057ff', '#2f80ed', '#17a964', '#ffb020', '#06b6d4', '#ef4444', '#64748b']

export default function ResultsPage() {
  const { job, site, mode, setMode, selectedId, setSelectedId, loadAnalysis } = useApp()
  const { analysisId } = useParams()
  const [loading, setLoading] = useState(Boolean(analysisId && !job?.result))
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [chartMetric, setChartMetric] = useState('pickups')

  useEffect(() => {
    if (job?.result || !analysisId) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setLoadError('')
    loadAnalysis(analysisId)
      .catch((error) => { if (active) setLoadError(error?.message || 'No fue posible cargar el analisis.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [analysisId, job?.result, loadAnalysis, reloadKey])

  if (loading) return <section className="grid min-h-[calc(100vh-72px)] place-items-center font-[ui-monospace,monospace] text-sm font-bold tracking-[.18em] text-[#7d8392]">CARGANDO RESULTADOS</section>
  if (!job?.result && loadError) return (
    <section className="grid min-h-[calc(100vh-72px)] place-items-center bg-[#f6f6f4] p-6">
      <div className="w-full max-w-lg rounded-lg border border-[#ffd2c2] bg-white p-6 text-center shadow-sm">
        <span className="text-[10px] font-black uppercase tracking-[.17em] text-[#ff5b12]">Error de carga</span>
        <h1 className="mt-2 text-xl font-black text-[#151323]">No se pudo cargar el analisis</h1>
        <p className="mt-2 text-sm text-[#7d8392]">{loadError}</p>
        <button className="mt-4 rounded-md bg-[#111827] px-4 py-2 text-[13px] font-black text-white" onClick={() => setReloadKey((key) => key + 1)}>Reintentar</button>
      </div>
    </section>
  )
  if (!job?.result) return <Navigate to={site ? `/sedes/${site.id}` : '/empresas'} replace />

  const analysis = job
  const result = analysis.result
  const selected = (result.gondolas || []).find((item) => item.id === selectedId)
  const heatmapUrl = artifactUrl(analysis.id, `${mode}.png`)
  const interactionAvailable = Boolean(result.heatmaps?.interaction)
  const pickupAvailable = Boolean(result.heatmaps?.pickup)
  const metrics = result.metrics || {}
  const video = result.video || {}
  const pickupEvents = result.pickup_events_log || []
  const interactionEvents = result.interaction_events_log || []
  const gondolas = result.gondolas || []
  const zones = result.zones || []
  const pickupTotal = Number(metrics.pickup_events ?? pickupEvents.length ?? 0)
  const interactionTotal = Number(metrics.interaction_events ?? interactionEvents.length ?? 0)
  const trafficTotal = Number(metrics.tracked_presences ?? metrics.people_detected ?? 0)
  const noPickupInteractions = Math.max(interactionTotal - pickupTotal, 0)
  const activityMix = [
    { label: 'Pick-ups', value: pickupTotal, color: '#ff7a1a' },
    { label: 'Interacciones sin pick-up', value: noPickupInteractions, color: '#1f6feb' },
    { label: 'Trafico sin interaccion', value: Math.max(trafficTotal - interactionTotal, 0), color: '#17a964' },
  ].filter((item) => item.value > 0)
  const zoneMix = [
    { label: 'Zonas calientes', value: zones.filter((zone) => zone.classification === 'hot').length, color: '#ef4444' },
    { label: 'Zonas medias', value: zones.filter((zone) => zone.classification === 'warm' || zone.classification === 'medium').length, color: '#ffb020' },
    { label: 'Zonas frias', value: zones.filter((zone) => zone.classification === 'cold').length, color: '#1f6feb' },
    { label: 'Sin clasificar', value: zones.filter((zone) => !['hot', 'warm', 'medium', 'cold'].includes(zone.classification)).length, color: '#94a3b8' },
  ].filter((item) => item.value > 0)
  const gondolaPickupData = gondolas
    .map((gondola, index) => ({
      id: gondola.id,
      label: gondola.name || `Gondola ${index + 1}`,
      value: Number(gondola.pickups || 0),
      helper: `${Number(gondola.interactions || 0)} interacciones`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  const gondolaInteractionData = gondolas
    .map((gondola, index) => ({
      id: gondola.id,
      label: gondola.name || `Gondola ${index + 1}`,
      value: Number(gondola.interactions || 0),
      helper: `${Number(gondola.pickups || 0)} pick-ups`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  const chartMetricOptions = [
    ['pickups', 'Pick-ups'],
    ['interactions', 'Interacciones'],
    ['visits', 'Visitas'],
    ['dwell_seconds', 'Permanencia'],
  ]
  const selectedMetricData = gondolas
    .map((gondola, index) => ({
      id: gondola.id,
      label: gondola.name || `Gondola ${index + 1}`,
      value: Number(gondola[chartMetric] || 0),
      helper: `${Number(gondola.pickups || 0)} pick-ups · ${Number(gondola.interactions || 0)} interacciones`,
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
  const pickupTimeline = buildTimeline(result.pickup_histogram, pickupEvents, video.duration_seconds)
  const radarData = [
    { metric: 'Pick-ups', value: pickupTotal },
    { metric: 'Interacciones', value: interactionTotal },
    { metric: 'Trafico', value: trafficTotal },
    { metric: 'Flujo', value: Number(metrics.flow_per_minute || 0) },
    { metric: 'Velocidad', value: Number(metrics.average_speed_m_s ?? metrics.average_speed_normalized ?? 0) },
  ]
  const activityChartData = activityMix.map((item) => ({ name: item.label, value: item.value, color: item.color }))
  const zoneChartData = zoneMix.map((item) => ({ name: item.label, value: item.value, color: item.color }))

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#151323]">
      <header className="relative overflow-hidden bg-gradient-to-br from-[#14283f] via-[#141c29] to-[#101722] px-5 py-8 sm:px-8">
        <img src={orbitArt} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15" />
        <div className="relative mx-auto grid max-w-[1416px] items-center gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="py-6 sm:py-10">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#b7c4d5]"><CheckCircle2 size={15} aria-hidden="true" />Analisis completado</span>
            <h1 className="mt-5 max-w-xl text-[clamp(34px,4vw,58px)] font-extrabold leading-[1.1] tracking-tight text-white">Descubre lo que pasa <span className="text-[#ff7a1a]">en tu tienda.</span></h1>
            <p className="mt-5 max-w-lg text-sm font-medium leading-relaxed text-[#c4cddb]">Explora el movimiento de tus clientes y convierte los datos de tu espacio en mejores decisiones.</p>
            <a href="#hallazgos" className="mt-6 inline-flex items-center gap-3 rounded-xl bg-[#ff7a1a] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#ed6909]">Explorar resultados<ArrowDown size={17} aria-hidden="true" /></a>
          </div>
          <img src={analysisArt} alt="" className="mx-auto hidden h-[380px] w-auto max-w-full object-contain lg:block" style={{ maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent), linear-gradient(to bottom, transparent, black 7%, black 93%, transparent)', maskComposite: 'intersect', WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent), linear-gradient(to bottom, transparent, black 7%, black 93%, transparent)', WebkitMaskComposite: 'source-in' }} />
        </div>
      </header>

      <section className="mx-auto w-[min(1480px,calc(100%-36px))] pb-[100px] pt-8 max-[760px]:w-[calc(100%-28px)] max-[760px]:pb-[75px] max-[760px]:pt-6">
        <div className="relative grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ['people', usersIcon, 'Presencias rastreadas', metrics.tracked_presences ?? metrics.people_detected ?? 0, '', 'Clientes detectados'],
            ['time', clockIcon, 'Duracion del video', video.duration_seconds ?? 0, ' s', 'Tiempo explorable'],
            ['frames', framesIcon, 'Fotogramas procesados', video.processed_frames ?? video.total_frames ?? 0, '', 'Muestras analizadas'],
            ['interaction', pickupIcon, 'Interacciones', metrics.interaction_events ?? 0, '', 'Contactos relevantes'],
            ['speed', speedIcon, metrics.average_speed_m_s != null ? 'Velocidad media' : 'Velocidad normalizada', metrics.average_speed_m_s ?? metrics.average_speed_normalized ?? 0, metrics.average_speed_m_s != null ? ' m/s' : '', 'Ritmo promedio'],
            ['flow', flowIcon, 'Flujo por minuto', metrics.flow_per_minute ?? 0, '', 'Transito observado'],
          ].map(([tone, icon, label, value, unit, helper]) => <MetricCard key={label} tone={tone} icon={icon} label={label} value={value} unit={unit} helper={helper} />)}
        </div>

        <nav aria-label="Secciones del analisis" className="relative mb-8 mt-6 flex flex-wrap gap-2 border-t border-[#ff7a1a]/20 pt-5">
          {[[Video, '#video-analisis', 'Explorar video'], [Activity, '#graficas-resultados', 'Graficas'], [Map, '#mapa-analisis', 'Mapa de la tienda'], [Activity, '#hallazgos', 'Resultados y evidencia']].map(([Icon, href, label]) => <a key={href} href={href} className="group inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-transparent bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-[0_14px_34px_-30px_rgba(21,19,35,.7)] transition hover:-translate-y-0.5 hover:border-[#ff7a1a]/40 hover:bg-[#fff4ec] hover:text-[#cf4921]"><Icon className="transition group-hover:scale-110" size={15} aria-hidden="true" />{label}</a>)}
        </nav>

        <AnalysisVideo analysis={analysis} />
        <section id="graficas-resultados" className="mt-8 scroll-mt-24 rounded-3xl border border-[#e5e7ee] bg-white p-4 shadow-[0_24px_70px_-56px_rgba(21,19,35,.7)] sm:p-6">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[.17em] text-[#cf4921]">Graficas del analisis</span>
              <h2 className="mt-2 text-2xl font-black tracking-[-.035em] text-[#151323]">Resultados visuales de pick-ups e interacciones</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Graficas basadas en los datos devueltos por el backend para el analisis actual.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {chartMetricOptions.map(([value, label]) => (
                <button key={value} className={`min-h-10 rounded-xl px-4 text-xs font-black transition ${chartMetric === value ? 'bg-[#ff7a1a] text-white shadow-[0_16px_34px_-24px_rgba(255,122,26,.95)]' : 'border border-[#d8e4f1] bg-white text-slate-600 hover:border-[#ff7a1a] hover:text-[#cf4921]'}`} onClick={() => setChartMetric(value)} type="button">
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[.95fr_1.05fr]">
            <ChartPanel title="Distribucion de actividad" subtitle="Pick-ups frente a interacciones y trafico" action="Mix">
              <ProfessionalDonut data={activityChartData} emptyLabel="Sin actividad suficiente" />
            </ChartPanel>
            <ChartPanel title={`Gondolas por ${chartMetricOptions.find(([value]) => value === chartMetric)?.[1] || 'metrica'}`} subtitle="Haz clic en una barra para seleccionar esa gondola en el mapa" action="Ranking">
              <ProfessionalBarChart data={selectedMetricData} emptyLabel="No hay datos para esta metrica" onSelect={(item) => item.id && setSelectedId(item.id)} selectedId={selectedId} />
            </ChartPanel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <ChartPanel title="Interacciones por gondola" subtitle="Contactos relevantes detectados" action="Interaccion">
              <ProfessionalBarChart data={gondolaInteractionData} emptyLabel="No hay interacciones por gondola" compact onSelect={(item) => item.id && setSelectedId(item.id)} selectedId={selectedId} />
            </ChartPanel>
            <ChartPanel title="Clasificacion de zonas" subtitle="Calor del recorrido en la tienda" action="Zonas">
              <ProfessionalDonut data={zoneChartData} emptyLabel="Sin zonas clasificadas" />
            </ChartPanel>
            <ChartPanel title="Radar general" subtitle="Comparacion global de las metricas del analisis" action="Radar">
              <ProfessionalRadar data={radarData} fallbackData={zoneChartData} emptyLabel="Sin datos suficientes" />
            </ChartPanel>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <ChartPanel title="Pick-ups en el tiempo" subtitle="Eventos agrupados por tramo del video" action="Tiempo">
              <ProfessionalArea data={pickupTimeline} emptyLabel="Sin eventos temporales" />
            </ChartPanel>
            <ChartPanel title="Pick-ups por gondola" subtitle="Ranking especifico de toma de producto" action="Producto">
              <ProfessionalBarChart data={gondolaPickupData} emptyLabel="No hay pick-ups por gondola" compact onSelect={(item) => item.id && setSelectedId(item.id)} selectedId={selectedId} />
            </ChartPanel>
          </div>
        </section>
        <div id="mapa-analisis" className="mt-8 scroll-mt-24 rounded-3xl border border-[#e5e7ee] bg-[#f7f8fa] p-4 sm:p-6">
          <div className="mb-6">
            <span className="text-[10px] font-medium tracking-[.17em] text-[#cf4921]">GEMELO ESPACIAL</span>
            <h2 className="mt-[9px] text-2xl font-bold tracking-[-.045em] text-[#151323]">Mapa de la tienda</h2><p className="mt-2 text-sm text-slate-500">Selecciona una gondola para consultar su actividad y cambia la capa para comparar las metricas.</p>
          </div>
          <div className="relative z-[2] mb-4 flex w-fit rounded-xl border border-[#e5e7ee] bg-white p-1 max-[760px]:sticky max-[760px]:top-[66px] max-[760px]:w-full" role="tablist">
            {modes.map(([value, label]) => (
              <button role="tab" aria-selected={mode === value} className={`min-w-[130px] rounded-md border-0 p-3 px-[18px] text-[11px] text-slate-500 max-[760px]:min-w-0 max-[760px]:flex-1 max-[760px]:px-[5px] max-[760px]:p-[11px] max-[390px]:text-[9px] ${mode === value ? 'bg-[#ff7a1a] font-medium text-white' : 'bg-transparent text-slate-500'}`} onClick={() => setMode(value)} key={value}>
                {label}{value === 'interaction' && !interactionAvailable && <small className="mt-[3px] block text-[9px]">evidencia insuficiente</small>}
                {value === 'pickup' && !pickupAvailable && <small className="mt-[3px] block text-[9px]">sin eventos</small>}
              </button>
            ))}
          </div>
          <div className="grid min-h-[690px] grid-cols-[minmax(0,1fr)_360px] rounded-2xl border border-[#e5e7ee] bg-[#08100e] max-[980px]:min-h-[620px] max-[980px]:grid-cols-[minmax(0,1fr)_320px] max-[760px]:block max-[760px]:min-h-[520px]">
            <div className="relative min-w-0 border-r border-[rgba(206,236,221,.14)] max-[760px]:h-[520px] max-[760px]:border-r-0 max-[390px]:h-[460px]">
              <StoreScene result={result} mode={mode} selectedId={selectedId} onSelect={setSelectedId} heatmapUrl={heatmapUrl} slices={result.heatmaps?.slices} analysisId={analysis.id} fallbackGondolas={site?.configuration?.gondolas} fallbackFloor={site?.configuration?.floor} />
            </div>
            <aside className={`min-w-0 bg-white text-[#151323] max-[760px]:fixed max-[760px]:bottom-0 max-[760px]:left-0 max-[760px]:right-0 max-[760px]:z-50 max-[760px]:max-h-[78vh] max-[760px]:overflow-y-auto max-[760px]:rounded-t-[18px] max-[760px]:border-t max-[760px]:border-t-[#e5e7ee] max-[760px]:shadow-[0_-25px_80px_rgba(0,0,0,.55)] max-[760px]:transition-transform max-[760px]:duration-300 max-[760px]:ease-in-out ${selected ? 'max-[760px]:translate-y-0' : 'max-[760px]:translate-y-[110%]'}`}>
              <button className="sticky top-[10px] z-[2] m-0 ml-auto mb-0 hidden h-8 w-8 place-items-center rounded-full border border-[rgba(206,236,221,.14)] bg-slate-100 text-slate-600 max-[760px]:mr-3 max-[760px]:mt-[10px] max-[760px]:grid" onClick={() => setSelectedId(null)}>x</button>
              {selected
                ? <ShelfMatrix gondola={selected} mode={mode} events={result.interaction_events_log || []} />
                : <div className="grid h-full place-items-center px-[27px] p-[33px] text-center text-[12px] leading-[1.7] text-slate-500 max-[760px]:hidden">Selecciona una gondola en el planograma para inspeccionar su actividad.</div>}
            </aside>
          </div>
        </div>

        <AnalysisInsights key={analysis.id} analysis={analysis} />
      </section>
    </div>
  )
}

function MetricCard({ tone, icon, label, value, unit, helper }) {
  const tones = {
    people: 'border-[#bfe8d1] from-[#f3fff8] via-white to-[#effdf6] text-[#12824c] before:bg-[#17a964]',
    time: 'border-[#fed7aa] from-[#fff7ed] via-white to-[#fff1eb] text-[#cf4921] before:bg-[#ff7a1a]',
    frames: 'border-[#bfdbfe] from-[#eff6ff] via-white to-[#eef7ff] text-[#1f6feb] before:bg-[#1f6feb]',
    interaction: 'border-[#fecaca] from-[#fff1f2] via-white to-[#fff7ed] text-[#e94d08] before:bg-[#ef4444]',
    speed: 'border-[#ddd6fe] from-[#f5f3ff] via-white to-[#eef6ff] text-[#6d5dfc] before:bg-[#8057ff]',
    flow: 'border-[#bae6fd] from-[#f0f9ff] via-white to-[#f7fee7] text-[#047c91] before:bg-[#06b6d4]',
  }

  return (
    <article className={`group relative min-h-[154px] overflow-hidden rounded-lg border bg-gradient-to-br p-4 shadow-[0_20px_50px_-42px_rgba(21,19,35,.65)] transition hover:-translate-y-1 hover:shadow-[0_24px_55px_-36px_rgba(21,19,35,.7)] before:absolute before:inset-x-4 before:top-0 before:h-[4px] before:rounded-b-full ${tones[tone] || tones.people}`}>
      <span className="pointer-events-none absolute right-[-28px] top-[-30px] h-24 w-24 rounded-full bg-white/70" />
      <span className="relative flex items-start justify-between gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-white shadow-[0_18px_34px_-26px_rgba(21,19,35,.55)] ring-1 ring-black/5">
          <img className="h-12 w-12 object-contain transition duration-300 group-hover:scale-110" src={icon} alt="" aria-hidden="true" />
        </span>
        <ArrowRight className="mt-1 text-slate-300 transition group-hover:translate-x-1 group-hover:text-current" size={16} aria-hidden="true" />
      </span>
      <p className="relative mt-4 text-3xl font-black tabular-nums tracking-tight text-[#151323]">
        {Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })}
        <span className="ml-1 text-sm font-bold text-slate-500">{unit}</span>
      </p>
      <h2 className="relative mt-1 text-[12px] font-black leading-snug text-[#24364b]">{label}</h2>
      <p className="relative mt-2 text-[10px] font-semibold leading-4 text-slate-500">{helper}</p>
    </article>
  )
}

function KpiTile({ tone, label, value, detail }) {
  const tones = {
    orange: 'from-[#fff0e8] to-[#ffffff] text-[#ff5b12] before:bg-[#ff7a1a]',
    blue: 'from-[#edf6ff] to-[#ffffff] text-[#1f6feb] before:bg-[#1f6feb]',
    green: 'from-[#ecfff5] to-[#ffffff] text-[#12824c] before:bg-[#17a964]',
    violet: 'from-[#f5f0ff] to-[#ffffff] text-[#8057ff] before:bg-[#8057ff]',
  }

  return (
    <article className={`relative min-h-[112px] overflow-hidden rounded-2xl border border-[#e7edf5] bg-gradient-to-br p-4 shadow-[0_18px_45px_-38px_rgba(21,19,35,.7)] before:absolute before:left-4 before:top-0 before:h-1 before:w-12 before:rounded-b-full ${tones[tone] || tones.orange}`}>
      <span className="pointer-events-none absolute right-[-26px] top-[-28px] h-24 w-24 rounded-full bg-current opacity-[.08]" />
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <b className="mt-3 block text-3xl font-black tracking-tight text-[#151323]">{formatNumber(value)}</b>
      <span className="mt-2 block text-[11px] font-bold text-slate-500">{detail}</span>
    </article>
  )
}

function InsightCard({ title, value, detail }) {
  return (
    <article className="relative min-h-[128px] overflow-hidden rounded-2xl border border-white/70 bg-white p-4 shadow-[0_20px_55px_-46px_rgba(21,19,35,.85)]">
      <span className="absolute right-[-18px] top-[-18px] grid h-16 w-16 place-items-center rounded-full bg-[#151323] text-2xl font-black text-white/10">{value}</span>
      <p className="text-[11px] font-black uppercase tracking-wide text-[#ff5f7e]">{title}</p>
      <p className="relative mt-3 text-sm font-bold leading-6 text-[#334155]">{detail}</p>
    </article>
  )
}

function ChartPanel({ title, subtitle, children, action }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/80 bg-white p-4 shadow-[0_20px_58px_-46px_rgba(21,19,35,.8)]">
      <div className="pointer-events-none absolute right-[-42px] top-[-52px] h-32 w-32 rounded-full bg-[#f5f7fb]" />
      <div className="relative">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-[#151323]">{title}</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{subtitle}</p>
          </div>
          {action && <span className="rounded-full bg-[#f8fafc] px-3 py-1 text-[10px] font-black uppercase text-slate-400">{action}</span>}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </article>
  )
}

function ProfessionalFunnel({ data }) {
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 0)
  if (!max) return <EmptyChart label="Sin datos para construir el embudo" />

  return (
    <div className="grid gap-3">
      {data.map((item, index) => {
        const percent = Math.max((Number(item.value || 0) / max) * 100, item.value > 0 ? 8 : 0)
        const previous = index === 0 ? null : data[index - 1]
        const conversion = previous?.value ? Math.round((item.value / previous.value) * 100) : 100
        return (
          <div key={item.label} className="rounded-2xl border border-[#edf2f7] bg-[#fbfdff] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-black text-[#334155]">{item.label}</span>
              <span className="text-sm font-black text-[#151323]">{formatNumber(item.value)}</span>
            </div>
            <div className="h-8 overflow-hidden rounded-xl bg-[#edf2f7]">
              <div className="grid h-full place-items-center rounded-xl text-[10px] font-black text-white transition-all" style={{ width: `${percent}%`, background: `linear-gradient(90deg,${item.color},#151323)` }}>
                {index > 0 ? `${conversion}%` : '100%'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProfessionalBarChart({ data, emptyLabel, onSelect, selectedId, compact = false }) {
  const hasData = data.some((item) => Number(item.value || 0) > 0)
  if (!hasData) return <EmptyChart label={emptyLabel} />

  return (
    <div className={compact ? 'h-[260px]' : 'h-[330px]'}>
      <ResponsiveContainer width="100%" height="100%">
        <ReBarChart data={data} layout="vertical" margin={{ top: 12, right: 28, bottom: 8, left: 12 }}>
          <defs>
            <linearGradient id="barGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#ff5f7e" />
              <stop offset="100%" stopColor="#8057ff" />
            </linearGradient>
          </defs>
          <CartesianGrid horizontal={false} stroke="#edf2f7" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} axisLine={false} tickLine={false} />
          <YAxis dataKey="label" type="category" width={112} tick={{ fontSize: 10, fill: '#334155', fontWeight: 800 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#fff7ed' }} />
          <Bar dataKey="value" radius={[0, 12, 12, 0]} onClick={(entry) => onSelect?.(entry)} cursor="pointer">
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={selectedId === entry.id ? '#ff7a1a' : chartColors[index % chartColors.length]} />
            ))}
          </Bar>
        </ReBarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ProfessionalDonut({ data, emptyLabel }) {
  const hasData = data.some((item) => Number(item.value || 0) > 0)
  if (!hasData) return <EmptyChart label={emptyLabel} />
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)

  return (
    <div className="grid gap-3">
      <div className="h-[270px]">
        <ResponsiveContainer width="100%" height="100%">
          <RePieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="84%" paddingAngle={4}>
              {data.map((entry, index) => <Cell key={entry.name} fill={entry.color || chartColors[index % chartColors.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="fill-[#151323] text-3xl font-black">{formatNumber(total)}</text>
            <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-[10px] font-black uppercase">Total eventos</text>
          </RePieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ProfessionalArea({ data, emptyLabel }) {
  const hasData = data.some((item) => Number(item.value || 0) > 0)
  if (!hasData) return <EmptyChart label={emptyLabel} />

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <ReAreaChart data={data} margin={{ top: 18, right: 18, left: -18, bottom: 6 }}>
          <defs>
            <linearGradient id="pickupArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ff7a1a" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#ff7a1a" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#edf2f7" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 800 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 800 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="value" stroke="#ff7a1a" strokeWidth={3} fill="url(#pickupArea)" activeDot={{ r: 6, fill: '#cf4921', stroke: '#fff', strokeWidth: 3 }} />
        </ReAreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ProfessionalRadar({ data, fallbackData, emptyLabel }) {
  const hasRadar = data.some((item) => Number(item.value || 0) > 0)
  if (!hasRadar) return <ProfessionalDonut data={fallbackData} emptyLabel={emptyLabel} />

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <ReRadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#e5e7ee" />
          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#475569', fontWeight: 800 }} />
          <Tooltip content={<ChartTooltip />} />
          <Radar dataKey="value" stroke="#8057ff" strokeWidth={3} fill="#8057ff" fillOpacity={0.25} />
        </ReRadarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const name = label || item.name || item.payload?.name || item.payload?.label
  return (
    <div className="rounded-xl border border-[#e7edf5] bg-white px-3 py-2 shadow-[0_18px_42px_-28px_rgba(21,19,35,.7)]">
      <p className="text-[11px] font-black text-[#151323]">{name}</p>
      <p className="mt-1 text-sm font-black text-[#ff5b12]">{formatNumber(item.value)}</p>
      {item.payload?.helper && <p className="mt-1 text-[10px] font-semibold text-slate-500">{item.payload.helper}</p>}
    </div>
  )
}

function DonutChart({ data, emptyLabel, compact = false }) {
  const [activeLabel, setActiveLabel] = useState('')
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  if (!total) return <EmptyChart label={emptyLabel} />
  const activeItem = data.find((item) => item.label === activeLabel)

  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className={`grid items-center gap-4 ${compact ? 'grid-cols-1' : 'sm:grid-cols-[190px_1fr]'}`}>
      <div className="relative mx-auto h-[180px] w-[180px]">
        <svg viewBox="0 0 120 120" className="-rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="18" />
          {data.map((item) => {
            const length = (Number(item.value || 0) / total) * circumference
            const segment = (
              <circle
                key={item.label}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                strokeWidth={activeLabel === item.label ? '22' : '18'}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setActiveLabel(item.label)}
                onMouseLeave={() => setActiveLabel('')}
              />
            )
            offset += length
            return segment
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center rounded-full text-center">
          <div>
            <b className="block text-3xl font-black tracking-tight text-[#151323]">{formatNumber(activeItem?.value ?? total)}</b>
            <span className="text-[10px] font-black uppercase text-slate-400">{activeItem?.label || 'Total'}</span>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {data.map((item) => (
          <div key={item.label} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${activeLabel === item.label ? 'border-[#ff7a1a] bg-[#fff7ed] shadow-[0_14px_28px_-24px_rgba(255,122,26,.85)]' : 'border-[#edf1f5] bg-[#fbfdff] hover:border-[#ffd2bd]'}`} onMouseEnter={() => setActiveLabel(item.label)} onMouseLeave={() => setActiveLabel('')}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate text-xs font-black text-[#334155]">{item.label}</span>
            </span>
            <span className="text-xs font-black text-[#151323]">{formatNumber(item.value)} <small className="font-bold text-slate-400">{Math.round((item.value / total) * 100)}%</small></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChart({ data, emptyLabel, color, compact = false, onSelect, selectedId }) {
  const [activeLabel, setActiveLabel] = useState('')
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 0)
  if (!max) return <EmptyChart label={emptyLabel} />

  return (
    <div className={`grid gap-2.5 ${compact ? '' : 'min-h-[245px]'}`}>
      {data.map((item) => {
        const percent = Math.max((Number(item.value || 0) / max) * 100, item.value > 0 ? 8 : 0)
        return (
          <button key={item.label} className={`grid gap-1.5 rounded-xl border p-2.5 text-left transition ${selectedId === item.id || activeLabel === item.label ? 'border-[#ff7a1a] bg-[#fff7ed] shadow-[0_14px_28px_-24px_rgba(255,122,26,.9)]' : 'border-[#eef2f7] bg-[#fbfdff] hover:border-[#ffd2bd] hover:bg-white'}`} onClick={() => onSelect?.(item)} onMouseEnter={() => setActiveLabel(item.label)} onMouseLeave={() => setActiveLabel('')} type="button">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs font-black text-[#334155]">{item.label}</span>
              <span className="shrink-0 text-xs font-black text-[#151323]">{formatNumber(item.value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#edf2f7]">
              <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: selectedId === item.id || activeLabel === item.label ? 'linear-gradient(90deg,#ff7a1a,#cf4921)' : `linear-gradient(90deg,${color},#8057ff)` }} />
            </div>
            {item.helper && <span className="text-[10px] font-semibold text-slate-400">{item.helper}</span>}
          </button>
        )
      })}
    </div>
  )
}

function MiniTimeline({ data, emptyLabel }) {
  const [activeLabel, setActiveLabel] = useState('')
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 0)
  if (!max) return <EmptyChart label={emptyLabel} />

  return (
    <div className="flex h-[230px] items-end gap-2 rounded-2xl border border-[#edf1f5] bg-[linear-gradient(180deg,#fbfdff,#ffffff)] px-3 pb-3 pt-5">
      {data.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-2" onMouseEnter={() => setActiveLabel(item.label)} onMouseLeave={() => setActiveLabel('')}>
          <span className={`text-[10px] font-black ${activeLabel === item.label ? 'text-[#cf4921]' : 'text-[#151323]'}`}>{formatNumber(item.value)}</span>
          <div className="flex h-[145px] w-full items-end rounded-full bg-[#edf2f7]">
            <div className="w-full rounded-full transition-all" style={{ height: `${Math.max((item.value / max) * 100, item.value > 0 ? 8 : 0)}%`, background: activeLabel === item.label ? 'linear-gradient(180deg,#cf4921,#ff7a1a)' : 'linear-gradient(180deg,#ff9d4d,#ff7a1a)' }} />
          </div>
          <span className="max-w-full truncate text-[9px] font-bold text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function EmptyChart({ label }) {
  return (
    <div className="grid min-h-[180px] place-items-center rounded-2xl border border-dashed border-[#d7e1ee] bg-white/75 px-5 text-center">
      <p className="text-sm font-black text-slate-400">{label}</p>
    </div>
  )
}

function buildTimeline(histogram, events, duration) {
  if (Array.isArray(histogram) && histogram.length) {
    return histogram.slice(0, 8).map((item, index) => ({
      label: item.label || item.bucket || item.range || `${index + 1}`,
      value: Number(item.value ?? item.count ?? item.pickups ?? 0),
    }))
  }

  if (histogram && typeof histogram === 'object') {
    return Object.entries(histogram).slice(0, 8).map(([label, value]) => ({
      label,
      value: Number(value || 0),
    }))
  }

  const safeDuration = Number(duration || 0)
  const bucketCount = 6
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    label: safeDuration ? `${Math.round((safeDuration / bucketCount) * index)}s` : `${index + 1}`,
    value: 0,
  }))

  for (const event of events || []) {
    const time = Number(event.t ?? event.time ?? event.timestamp ?? 0)
    const index = safeDuration ? Math.min(bucketCount - 1, Math.max(0, Math.floor((time / safeDuration) * bucketCount))) : 0
    buckets[index].value += 1
  }

  return buckets
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
}
