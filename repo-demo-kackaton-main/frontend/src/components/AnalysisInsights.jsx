import { useEffect, useRef, useState } from 'react'
import { Images, Expand, ChevronLeft, ChevronRight, Users, Clock3, ChartNoAxesColumnIncreasing } from 'lucide-react'
import { artifactUrl } from '../services/analyses'
import robotGuide from '../assets/images/robot-chistoso.png'
import AnalysisStatistics from './AnalysisStatistics'

const number = (value) => Number(value ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 1 })
const activity = { hot: ['Alta', 'bg-[#ff7a1a]/10 text-orange-700', '#ff7a1a'], normal: ['Media', 'bg-slate-100 text-slate-600', '#94a3b8'], cold: ['Baja', 'bg-[#1f6feb]/15 text-blue-700', '#1f6feb'] }
const panel = 'rounded-2xl border border-[#e5e7ee] bg-white shadow-[0_8px_30px_-24px_rgba(21,19,35,.25)]'

export default function AnalysisInsights({ analysis }) {
  const { result } = analysis
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)
  const [frame, setFrame] = useState(null)
  const dialog = useRef(null)
  useEffect(() => {
    if (frame !== null) dialog.current?.showModal()
  }, [frame])
  const zones = [...(result.zones || [])].sort((a, b) => Number(b.heat_index || 0) - Number(a.heat_index || 0))
  const filtered = zones.filter((zone) => filter === 'all' || zone.classification === filter)
  const mostVisited = [...zones].sort((a, b) => (b.visits || 0) - (a.visits || 0))[0]
  const longest = [...zones].sort((a, b) => (b.dwell_seconds || 0) - (a.dwell_seconds || 0))[0]
  const recommendations = result.recommendations || []
  const findings = (result.findings || []).filter((finding, index, items) => !recommendations.some((item) => item.title === finding.title || item.detail === finding.detail) && items.findIndex((item) => item.title === finding.title && item.detail === finding.detail) === index)
  const frames = result.annotated_frames || []
  const hotCount = zones.filter((zone) => zone.classification === 'hot').length
  const hotShare = zones.length ? Math.round(hotCount / zones.length * 100) : 0

  return <section id="hallazgos" className="mt-16 space-y-8 rounded-3xl bg-[#f7f8fa] p-6 text-[#151323] sm:p-8 max-[480px]:px-4">
    <header className="relative flex min-h-36 items-center justify-between gap-6 overflow-hidden border-b border-[#ff7a1a]/20 pb-6">
      <div className="relative z-10"><span className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[.17em] text-[#cf4921]"><span className="h-1 w-7 rounded-full bg-[#ff7a1a]" />Hallazgos calculados</span>
      <h2 className="mt-3 text-[clamp(28px,3vw,42px)] font-bold leading-tight tracking-[-.045em]">Resultados <span className="text-[#ff7a1a]">del análisis</span></h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500">Qué pasó en tu tienda, dónde se concentró la actividad y qué puedes revisar.</p></div>
      <div className="relative hidden shrink-0 items-center gap-4 lg:flex" aria-hidden="true"><p className="max-w-36 text-right text-sm font-medium leading-relaxed text-slate-500">Tu tienda en datos,<br /><span className="text-[#cf4921]">mejores decisiones.</span></p><img src={robotGuide} alt="" className="h-40 w-28 object-contain" /></div>
    </header>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 md:[&>article:last-child]:col-span-2 xl:[&>article:last-child]:col-span-1">
      <Summary icon={Users} label="Zona más visitada" value={mostVisited?.name || 'Sin datos'} detail={mostVisited ? `${number(mostVisited.visits)} visitas registradas` : 'No hay zonas analizadas'} />
      <Summary icon={Clock3} label="Mayor permanencia total" value={longest?.name || 'Sin datos'} detail={longest ? `${number(longest.dwell_seconds)} s de presencia acumulada` : 'No hay zonas analizadas'} />
      <Summary icon={ChartNoAxesColumnIncreasing} label="Zonas con alta actividad" value={`${hotCount} de ${zones.length}`} detail="Según la clasificación de este análisis" share={zones.length ? hotShare : null} />
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
    <section className={`${panel} min-w-0 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div><h3 className="text-lg font-semibold">Actividad por zona</h3><p className="mt-1 text-xs text-slate-500">Ordenadas por índice de actividad. Abre una zona para ver sus detalles.</p></div>
        <div className="flex flex-wrap gap-1" aria-label="Filtrar zonas">
          {[['all', 'Todas'], ['hot', 'Alta actividad'], ['cold', 'Baja actividad']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setShowAll(false) }} className={`rounded-full px-3 py-2 text-xs font-medium transition-colors ${filter === value ? 'bg-[#ff7a1a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
        </div>
      </div>
      <div className="hidden grid-cols-[1.2fr_1fr_.6fr_.8fr_24px] gap-5 border-y border-slate-100 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-500 sm:grid"><span>Zona</span><span>Actividad</span><span>Visitas</span><span>Tiempo medio</span><span /></div>
      {(showAll ? filtered : filtered.slice(0, 4)).map((zone, index) => <ZoneRow key={zone.zone_id ?? index} zone={zone} />)}
      {!filtered.length && <p className="p-6 text-sm text-slate-500">No hay zonas para esta selección.</p>}
      {filtered.length > 4 && <button onClick={() => setShowAll(!showAll)} className="w-full border-t border-slate-100 p-4 text-sm font-medium text-[#cf4921] hover:bg-[#ff7a1a]/10">{showAll ? 'Mostrar menos' : `Ver las ${filtered.length} zonas`}</button>}
      <p className="border-t border-slate-100 px-5 py-3 text-xs leading-relaxed text-slate-500">El índice de actividad resume la actividad calculada por el análisis; no representa un porcentaje de clientes. Las visitas corresponden a registros de seguimiento, no necesariamente a personas únicas.</p>
    </section>

    <section className="rounded-2xl border border-[#e5e7ee] bg-white p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ff7a1a]/10 text-[#cf4921]"><Images size={21} aria-hidden="true" /></span><div><h3 className="text-xl font-bold tracking-tight">El análisis en imágenes</h3><p className="mt-1 text-sm text-slate-500">Selecciona una captura para explorar las detecciones.</p></div></div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{frames.length} capturas</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">{frames.map((filename, index) => <button key={filename} onClick={() => setFrame(index)} className="group min-w-0 overflow-hidden rounded-xl border border-[#e5e7ee] bg-white text-left transition-shadow hover:border-[#ff7a1a]/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" aria-label={`Ampliar captura ${index + 1}`}>
        <span className="relative block bg-[#0e1916]"><img loading="lazy" className="aspect-video w-full object-contain" src={artifactUrl(analysis.id, filename)} alt={`Detecciones de la captura ${index + 1}`} /><span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-black/60 text-white transition-colors group-hover:bg-[#e65a2d] group-focus-visible:bg-[#e65a2d]"><Expand size={15} aria-hidden="true" /></span></span>
        <span className="flex items-center gap-3 px-3 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ff7a1a]/10 text-xs font-medium tabular-nums text-[#cf4921]">{String(index + 1).padStart(2, '0')}</span><span className="ml-auto text-xs font-medium text-slate-500 group-hover:text-[#cf4921]">Ver captura</span></span>
      </button>)}</div>
      {!frames.length && <p className="text-sm text-slate-500">No hay capturas disponibles para este análisis.</p>}
    </section>
    </div>

    <section>
      <h3 className="mb-4 text-lg font-semibold">Hallazgos y recomendaciones</h3>
      <div className="grid items-start gap-3 md:grid-cols-2">
        {recommendations.map((item, index) => <details key={`recommendation-${index}`} className={`${panel} group p-5`}>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>{item.title}<span className="mt-2 block text-xs font-normal text-slate-500">Ver recomendación y respaldo +</span></span><span className="shrink-0 rounded-full bg-[#ff7a1a]/10 px-2 py-1 text-xs text-orange-700">Prioridad {({ high: 'alta', medium: 'media', low: 'baja' })[item.severity] || 'media'}</span></summary>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.detail}</p>
          {item.trace && <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">{[
            ['Zona', item.trace.zone_name], ['Índice de actividad', item.trace.heat_index == null ? null : `${number(item.trace.heat_index * 100)} %`], ['Visitas', item.trace.visits], ['Tiempo medio', item.trace.avg_dwell_seconds == null ? null : `${number(item.trace.avg_dwell_seconds)} s`], ['Interacciones', item.trace.interactions], ['Densidad', item.trace.density == null ? null : `${number(item.trace.density)}/min`], ['Zonas con alta actividad', item.trace.hot_zones], ['Zonas activas', item.trace.active_zones],
          ].filter(([, value]) => value != null).map(([label, value]) => <Metric key={label} label={label} value={value} />)}</dl>}
        </details>)}
        {findings.slice(0, 3).map((finding, index) => <Finding key={index} finding={finding} />)}
      </div>
      {findings.length > 3 && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-[#cf4921]">Ver {findings.length - 3} hallazgos más</summary><div className="mt-3 grid gap-3 md:grid-cols-2">{findings.slice(3).map((finding, index) => <Finding key={index} finding={finding} />)}</div></details>}
      {!findings.length && !recommendations.length && <p className="text-sm text-slate-500">Este análisis no generó hallazgos ni recomendaciones.</p>}
    </section>

    <AnalysisStatistics zones={zones} />

    <dialog ref={dialog} onClose={() => setFrame(null)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close() }} className="fixed inset-0 m-auto max-h-[90vh] w-[min(1100px,94vw)] rounded-2xl bg-white p-4 backdrop:bg-black/75">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-medium">Captura {(frame ?? 0) + 1}</h3><button autoFocus onClick={() => dialog.current.close()} className="rounded-lg bg-slate-100 px-4 py-2 text-sm">Cerrar ✕</button></div>
      {frame !== null && <img className="max-h-[75vh] w-full object-contain" src={artifactUrl(analysis.id, frames[frame])} alt={`Detecciones de la captura ${frame + 1}`} />}
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <button disabled={frame === null || frame === 0} onClick={() => setFrame(frame - 1)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} aria-hidden="true" />Anterior</button>
        <span aria-live="polite" className="text-xs tabular-nums text-slate-500">{(frame ?? 0) + 1} de {frames.length}</span>
        <button disabled={frame === null || frame >= frames.length - 1} onClick={() => setFrame(frame + 1)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40">Siguiente<ChevronRight size={16} aria-hidden="true" /></button>
      </div>
    </dialog>
  </section>
}

function Summary({ icon: Icon, label, value, detail, share }) {
  return <article className={`${panel} relative flex items-center gap-4 overflow-hidden p-5 before:absolute before:inset-y-5 before:left-0 before:w-[3px] before:rounded-full before:bg-[#ff7a1a]`}>
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#ff7a1a]/20 bg-gradient-to-br from-[#ff7a1a]/20 to-[#ff7a1a]/5 text-[#cf4921]"><Icon size={24} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1"><h3 className="text-xs font-medium text-slate-500">{label}</h3><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p></div>
    {share != null && <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#ff7a1a ${share}%, #f0f1f4 0)` }} aria-label={`${share} % de las zonas con alta actividad`}><div className="grid h-[58px] w-[58px] content-center rounded-full bg-white text-center"><b className="text-sm tabular-nums">{share}%</b><span className="text-[8px] text-slate-500">de las zonas</span></div></div>}
  </article>
}

function Metric({ label, value }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd></div>
}

function Finding({ finding }) {
  return <details className={`${panel} p-5`}><summary className="cursor-pointer text-sm font-medium">{finding.title === 'Sin pick-ups inferidos' ? 'No se detectaron movimientos de recogida' : finding.title === 'Sin interacción inferible' ? 'No se detectaron interacciones con los criterios actuales' : finding.title}</summary><p className="mt-3 text-sm leading-relaxed text-slate-600">{finding.detail}</p></details>
}

function ZoneRow({ zone }) {
  const [label, badge, color] = activity[zone.classification] || activity.normal
  const percentage = Math.max(0, Math.min(100, Number(zone.heat_index || 0) * 100))
  return <details className="group border-b border-slate-100 last:border-b-0">
    <summary className="grid cursor-pointer list-none grid-cols-2 items-center gap-4 px-5 py-4 hover:bg-slate-50 sm:grid-cols-[1.2fr_1fr_.6fr_.8fr_24px] sm:gap-5 [&::-webkit-details-marker]:hidden">
      <span className="text-sm font-medium">{zone.name}</span>
      <span><span className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-xs font-medium ${badge}`}>{label}</span><span className="text-xs tabular-nums text-slate-500">{number(percentage)} %</span></span><span className="mt-2 block h-1 rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${percentage}%`, background: color }} /></span></span>
      <span className="text-sm tabular-nums"><span className="mr-2 text-xs text-slate-500 sm:hidden">Visitas</span>{number(zone.visits)}</span>
      <span className="text-sm tabular-nums"><span className="mr-2 text-xs text-slate-500 sm:hidden">Tiempo medio</span>{number(zone.avg_dwell_seconds)} s</span>
      <span className="text-xs text-slate-400 group-open:rotate-180 max-sm:hidden" aria-hidden="true">⌄</span>
    </summary>
    <dl className="grid grid-cols-2 gap-4 bg-slate-50 px-5 py-5 sm:grid-cols-4"><Metric label="Permanencia total" value={`${number(zone.dwell_seconds)} s`} /><Metric label="Interacciones" value={number(zone.interactions)} /><Metric label="Densidad" value={`${number(zone.density)}/min`} /><Metric label="Origen de la zona" value={zone.source === 'configured' ? 'Configurada' : 'Cuadrícula automática'} /></dl>
  </details>
}
