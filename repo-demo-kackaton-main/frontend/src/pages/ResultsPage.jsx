import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Map, Video, ArrowDown, ArrowRight } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
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

export default function ResultsPage() {
  const { job, site, mode, setMode, selectedId, setSelectedId, loadAnalysis } = useApp()
  const { analysisId } = useParams()
  const [loading, setLoading] = useState(Boolean(analysisId && !job?.result))

  useEffect(() => {
    if (job?.result || !analysisId) {
      setLoading(false)
      return
    }
    setLoading(true)
    loadAnalysis(analysisId).catch(() => {}).finally(() => setLoading(false))
  }, [analysisId, job?.result, loadAnalysis])

  if (loading) return <section className="grid min-h-[calc(100vh-72px)] place-items-center text-sm font-bold tracking-[.18em] text-slate-500">CARGANDO RESULTADOS</section>
  if (!job?.result) return <Navigate to={site ? `/sedes/${site.id}` : '/empresas'} replace />

  const analysis = job
  const result = analysis.result
  const selected = (result.gondolas || []).find((item) => item.id === selectedId)
  const heatmapUrl = artifactUrl(analysis.id, `${mode}.png`)
  const interactionAvailable = Boolean(result.heatmaps?.interaction)
  const pickupAvailable = Boolean(result.heatmaps?.pickup)
  const metrics = result.metrics || {}
  const video = result.video || {}

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
          {[[Video, '#video-analisis', 'Explorar video'], [Map, '#mapa-analisis', 'Mapa de la tienda'], [Activity, '#hallazgos', 'Resultados y evidencia']].map(([Icon, href, label]) => <a key={href} href={href} className="group inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-transparent bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-[0_14px_34px_-30px_rgba(21,19,35,.7)] transition hover:-translate-y-0.5 hover:border-[#ff7a1a]/40 hover:bg-[#fff4ec] hover:text-[#cf4921]"><Icon className="transition group-hover:scale-110" size={15} aria-hidden="true" />{label}</a>)}
        </nav>

        <AnalysisVideo analysis={analysis} />
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
