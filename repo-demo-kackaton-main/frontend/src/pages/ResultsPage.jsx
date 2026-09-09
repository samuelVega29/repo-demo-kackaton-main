import { useEffect, useState } from 'react'
import { Navigate, Link, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { artifactUrl } from '../services/analyses'
import StoreScene from '../components/StoreScene'
import ShelfMatrix from '../components/ShelfMatrix'
import AnalysisVideo from '../components/AnalysisVideo'

const modes = [['traffic', 'Trafico'], ['dwell', 'Permanencia'], ['interaction', 'Interaccion'], ['pickup', 'Pick-up']]

const QUICK_NAV_ANCHORS = [
  ['mapa-operativo', 'Mapa operativo'],
  ['evidencia-visual', 'Evidencia visual'],
  ['hallazgos', 'Hallazgos'],
]

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

  if (loading) return <section className="grid min-h-[calc(100vh-72px)] place-items-center font-[ui-monospace,monospace] text-sm font-bold tracking-[.18em] text-[#7d8392]">CARGANDO RESULTADOS</section>
  if (!job?.result) return <Navigate to={site ? `/sedes/${site.id}` : '/empresas'} replace />

  const analysis = job
  const result = analysis.result
  const selected = (result.gondolas || []).find((item) => item.id === selectedId)
  const heatmapUrl = artifactUrl(analysis.id, `${mode}.png`)
  const interactionAvailable = Boolean(result.heatmaps?.interaction)
  const pickupAvailable = Boolean(result.heatmaps?.pickup)
  const metrics = result.metrics || {}
  const video = result.video || {}
  const zones = result.zones || []
  const hotZones = zones.filter((zone) => zone.classification === 'hot')
  const coldZones = zones.filter((zone) => zone.classification === 'cold')
  const recommendations = result.recommendations || []

  return (
    <section className="mx-auto w-[min(1480px,calc(100%-36px))] pb-[100px] pt-[72px] max-[760px]:w-[calc(100%-28px)] max-[760px]:pb-[75px] max-[760px]:pt-[55px]">
      <div className="mb-10 flex items-end justify-between gap-[30px] max-[760px]:flex-col max-[760px]:items-start">
        <div>
          <span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#ff6b3d]">ANALISIS COMPLETADO · {(result.model?.tracker || 'TRACKING').toUpperCase()}</span>
          <h1 className="my-[17px] mb-6 text-[clamp(55px,7vw,96px)] font-medium leading-[.92] tracking-[-.065em] text-[#151323] max-[760px]:text-[50px] max-[390px]:text-[43px]">
            Retail <em className="not-italic text-[#ff6b3d]">Intelligence.</em>
          </h1>
        </div>
        <div className="grid min-w-[430px] grid-cols-2 rounded-lg border border-[#e5e7ee] bg-white shadow-[0_20px_55px_-40px_rgba(20,27,36,.35)] max-[760px]:min-w-0 max-[760px]:w-full [&_span:nth-child(2n)]:border-r-0 [&_span:nth-last-child(-n+2)]:border-b-0">
          <span className="border-b border-r border-[#e5e7ee] p-4 text-[8px] text-[#7d8392]"><b className="mb-1 block font-[ui-monospace,monospace] text-[17px] font-semibold text-[#151323]">{metrics.tracked_presences ?? metrics.people_detected ?? 0}</b>Presencias rastreadas</span>
          <span className="border-b border-r border-[#e5e7ee] p-4 text-[8px] text-[#7d8392]"><b className="mb-1 block font-[ui-monospace,monospace] text-[17px] font-semibold text-[#151323]">{video.duration_seconds ?? 0}s</b>Duracion</span>
          <span className="border-b border-r border-[#e5e7ee] p-4 text-[8px] text-[#7d8392]"><b className="mb-1 block font-[ui-monospace,monospace] text-[17px] font-semibold text-[#151323]">{video.processed_frames ?? video.total_frames ?? 0}</b>Frames</span>
          <span className="border-b border-r border-[#e5e7ee] p-4 text-[8px] text-[#7d8392]"><b className="mb-1 block font-[ui-monospace,monospace] text-[17px] font-semibold text-[#151323]">{metrics.interaction_events ?? 0}</b>Interacciones</span>
          <span className="border-b border-r border-[#e5e7ee] p-4 text-[8px] text-[#7d8392]"><b className="mb-1 block font-[ui-monospace,monospace] text-[17px] font-semibold text-[#151323]">{metrics.average_speed_m_s ?? metrics.average_speed_normalized ?? 0}</b>Velocidad media</span>
          <span className="border-b border-r border-[#e5e7ee] p-4 text-[8px] text-[#7d8392]"><b className="mb-1 block font-[ui-monospace,monospace] text-[17px] font-semibold text-[#151323]">{metrics.flow_per_minute ?? 0}/min</b>Flujo</span>
        </div>
      </div>

      <nav className="sticky top-[66px] z-10 -mx-[1px] mb-10 flex flex-wrap items-center gap-2 border-y border-[#e5e7ee] bg-white/90 py-3 backdrop-blur">
        {QUICK_NAV_ANCHORS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-[#e5e7ee] px-4 py-2 text-[10px] font-black uppercase tracking-wide text-[#7d8392] transition hover:border-[#151323] hover:text-[#151323]"
          >
            {label}
          </a>
        ))}
        <Link
          to={`/analyses/${analysis.id}/recomendaciones`}
          className="ml-auto rounded-full border border-[#ff6b3d] bg-[#ff6b3d] px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-[#e85a2c]"
        >
          05 · Recomendaciones e Informe →
        </Link>
      </nav>

      <AnalysisVideo analysis={analysis} />

      <div className="mt-[90px]">
        <div className="mb-6">
          <span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#1f6feb]">GEMELO ESPACIAL</span>
          <h2 className="mt-[9px] text-[clamp(32px,4vw,52px)] tracking-[-.045em] text-[#151323]">Mapa operativo de la sede</h2>
        </div>
        <div className="relative z-[2] mb-[-1px] flex w-fit rounded-t-lg border border-[#e5e7ee] bg-white p-1 max-[760px]:sticky max-[760px]:top-[66px] max-[760px]:w-full" role="tablist">
          {modes.map(([value, label]) => (
            <button role="tab" aria-selected={mode === value} className={`min-w-[130px] rounded-md border-0 bg-transparent p-3 px-[18px] text-[11px] text-[#7d8392] max-[760px]:min-w-0 max-[760px]:flex-1 max-[760px]:px-[5px] max-[760px]:p-[11px] max-[390px]:text-[9px] ${mode === value ? 'bg-[#ff6b3d] font-extrabold text-white' : ''}`} onClick={() => setMode(value)} key={value}>
              {label}{value === 'interaction' && !interactionAvailable && <small className="mt-[3px] block text-[6px]">evidencia insuficiente</small>}
              {value === 'pickup' && !pickupAvailable && <small className="mt-[3px] block text-[6px]">sin eventos</small>}
            </button>
          ))}
        </div>
        <div className="grid min-h-[690px] grid-cols-[minmax(0,1fr)_360px] rounded-b-lg border border-[#e5e7ee] bg-[#08100e] max-[980px]:min-h-[620px] max-[980px]:grid-cols-[minmax(0,1fr)_320px] max-[760px]:block max-[760px]:min-h-[520px]">
          <div className="relative min-w-0 border-r border-[rgba(206,236,221,.14)] max-[760px]:h-[520px] max-[760px]:border-r-0 max-[390px]:h-[460px]">
            <StoreScene result={result} mode={mode} selectedId={selectedId} onSelect={setSelectedId} heatmapUrl={heatmapUrl} slices={result.heatmaps?.slices} analysisId={analysis.id} />
          </div>
          <aside className={`min-w-0 bg-[#0b1613] max-[760px]:fixed max-[760px]:bottom-0 max-[760px]:left-0 max-[760px]:right-0 max-[760px]:z-50 max-[760px]:max-h-[78vh] max-[760px]:overflow-y-auto max-[760px]:rounded-t-[18px] max-[760px]:border-t max-[760px]:border-t-[#53786a] max-[760px]:shadow-[0_-25px_80px_rgba(0,0,0,.55)] max-[760px]:transition-transform max-[760px]:duration-300 max-[760px]:ease-in-out ${selected ? 'max-[760px]:translate-y-0' : 'max-[760px]:translate-y-[110%]'}`}>
            <button className="sticky top-[10px] z-[2] m-0 ml-auto mb-0 hidden h-8 w-8 place-items-center rounded-full border border-[rgba(206,236,221,.14)] bg-[#172720] text-[#dbe8e2] max-[760px]:mt-[10px] max-[760px]:mr-3 max-[760px]:grid" onClick={() => setSelectedId(null)}>×</button>
            {selected
              ? <ShelfMatrix gondola={selected} mode={mode} events={result.interaction_events_log || []} />
              : <div className="grid h-full place-items-center px-[27px] p-[33px] text-center text-[12px] leading-[1.7] text-[#70857c] max-[760px]:hidden">Selecciona una gondola en el planograma para inspeccionar su actividad.</div>}
          </aside>
        </div>
      </div>

      <div className="mt-[90px] grid grid-cols-[minmax(0,1.4fr)_minmax(340px,.6fr)] gap-[45px] max-[1120px]:grid-cols-1 max-[760px]:mt-[75px] max-[760px]:gap-[45px]">
        <section id="evidencia-visual">
          <div className="mb-7"><span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#1f6feb]">EVIDENCIA VISUAL</span><h2 className="mt-[9px] text-[clamp(33px,4vw,52px)] tracking-[-.045em] text-[#151323]">Frames y detecciones</h2></div>
          <div className="grid grid-cols-3 gap-[7px] max-[980px]:grid-cols-3 max-[760px]:grid-cols-2 max-[390px]:grid-cols-1">{(result.annotated_frames || []).map((filename, index) => <figure key={filename} className="relative m-0 aspect-video overflow-hidden rounded-lg bg-[#0e1916]"><img className="h-full w-full object-cover" src={artifactUrl(analysis.id, filename)} alt={`Frame procesado ${index + 1}`} /><figcaption className="absolute bottom-[7px] left-[7px] bg-[rgba(5,10,8,.83)] px-[7px] p-[5px] font-[ui-monospace,monospace] text-[7px] font-medium text-[#aac0b7]">FRAME {index + 1}</figcaption></figure>)}</div>
        </section>
        <section id="hallazgos">
          <div className="mb-7"><span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#ff6b3d]">HALLAZGOS CALCULADOS</span><h2 className="mt-[9px] text-[clamp(33px,4vw,52px)] tracking-[-.045em] text-[#151323]">Que indican los datos</h2></div>

          {(hotZones.length > 0 || coldZones.length > 0) && (
            <div className="mb-8">
              <h3 className="mb-3 text-[11px] font-black uppercase tracking-wide text-[#151323]">Zonas de calor y frio <span className="text-[#7d8392]">· según clasificacion del analisis</span></h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-[7px]">
                {hotZones.map((zone, index) => (
                  <ZoneCard key={`hot-${zone.zone_id || index}`} zone={zone} kind="hot" />
                ))}
                {coldZones.map((zone, index) => (
                  <ZoneCard key={`cold-${zone.zone_id || index}`} zone={zone} kind="cold" />
                ))}
              </div>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 text-[11px] font-black uppercase tracking-wide text-[#151323]">Recomendaciones</h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[7px]">
                {recommendations.map((recommendation, index) => (
                  <RecommendationCard key={`${recommendation.rule}-${index}`} recommendation={recommendation} />
                ))}
              </div>
            </div>
          )}

          {(result.findings || []).map((finding, index) => <article key={`${finding.title}-${index}`} className="grid grid-cols-[34px_1fr] gap-[14px] border-t border-[#e5e7ee] py-[19px]"><span className="font-[ui-monospace,monospace] text-[9px] font-semibold text-[#ff6b3d]">{String(index + 1).padStart(2, '0')}</span><div><h3 className="m-0 mb-[7px] text-[14px] text-[#151323]">{finding.title}</h3><p className="m-0 text-[10px] leading-[1.6] text-[#7d8392]">{finding.detail}</p></div></article>)}
        </section>
      </div>

    </section>
  )
}

function ZoneCard({ zone, kind }) {
  const value = Number(zone.heat_index || 0)
  const accent = kind === 'hot' ? '#ff6b3d' : '#1f6feb'
  const label = kind === 'hot' ? 'Caliente' : 'Fria'
  return (
    <article className={`rounded-lg border bg-white p-[15px] ${kind === 'hot' ? 'border-[#ffd9c4] bg-[#fff9f5]' : 'border-[#cdddf7] bg-[#f6f9ff]'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="m-0 text-[12px] font-black leading-tight text-[#151323]">{zone.name}</h4>
        <span className={`shrink-0 rounded-full px-2 py-[3px] text-[8px] font-black uppercase tracking-wide ${kind === 'hot' ? 'bg-[#ff6b3d] text-white' : 'bg-[#1f6feb] text-white'}`}>{label}</span>
      </div>
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold text-[#7d8392]"><span>Heat index</span><span className="font-[ui-monospace,monospace] text-[#151323]">{(value * 100).toFixed(1)}%</span></div>
        <div className="h-[6px] overflow-hidden rounded-full bg-[#ececf0]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, value * 100)}%`, background: accent }} /></div>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-[14px] gap-y-[9px]">
        <MetricCell label="Visitas" value={String(zone.visits ?? 0)} />
        <MetricCell label="Densidad" value={`${zone.density ?? 0}/min`} />
        <MetricCell label="Permanencia total" value={`${zone.dwell_seconds ?? 0}s`} />
        <MetricCell label="Permanencia media" value={`${zone.avg_dwell_seconds ?? 0}s`} />
        <MetricCell label="Interacciones" value={String(zone.interactions ?? 0)} />
        <MetricCell label="Fuente" value={zone.source === 'configured' ? 'Configurada' : 'Grilla auto'} />
      </dl>
    </article>
  )
}

function MetricCell({ label, value }) {
  return <div><dt className="text-[8px] font-bold text-[#7d8392]">{label}</dt><dd className="m-0 font-[ui-monospace,monospace] text-[11px] font-semibold text-[#151323]">{value}</dd></div>
}

function RecommendationCard({ recommendation }) {
  const severityStyles = {
    high: { label: 'Alta', className: 'bg-[#ff3b30] text-white' },
    medium: { label: 'Media', className: 'bg-[#ff6b3d] text-white' },
    low: { label: 'Baja', className: 'bg-[#1f6feb] text-white' },
  }
  const severity = severityStyles[recommendation.severity] || severityStyles.medium
  const trace = recommendation.trace || {}
  return (
    <article className="rounded-lg border border-[#ffe6d8] bg-white p-[15px]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="m-0 max-w-[75%] text-[12px] font-black leading-tight text-[#151323]">{recommendation.title}</h4>
        <span className={`shrink-0 rounded-full px-2 py-[3px] text-[8px] font-black uppercase tracking-wide ${severity.className}`}>{severity.label}</span>
      </div>
      <p className="m-0 mb-3 text-[10px] leading-[1.6] text-[#7d8392]">{recommendation.detail}</p>
      {(typeof trace.heat_index === 'number' || typeof trace.visits === 'number' || typeof trace.classification === 'string') && (
        <dl className="m-0 grid grid-cols-2 gap-x-[14px] gap-y-[9px] border-t border-[#eef0f3] pt-3">
          {trace.zone_name && <MetricCell label="Zona" value={trace.zone_name} />}
          {typeof trace.heat_index === 'number' && <MetricCell label="Heat index" value={(Number(trace.heat_index) * 100).toFixed(1) + '%'} />}
          {typeof trace.visits === 'number' && <MetricCell label="Visitas" value={String(trace.visits)} />}
          {typeof trace.avg_dwell_seconds === 'number' && <MetricCell label="Permanencia media" value={`${trace.avg_dwell_seconds}s`} />}
          {typeof trace.interactions === 'number' && <MetricCell label="Interacciones" value={String(trace.interactions)} />}
          {typeof trace.density === 'number' && <MetricCell label="Densidad" value={`${trace.density}/min`} />}
          {typeof trace.hot_zones === 'number' && <MetricCell label="Zonas calientes" value={String(trace.hot_zones)} />}
          {typeof trace.active_zones === 'number' && <MetricCell label="Zonas activas" value={String(trace.active_zones)} />}
        </dl>
      )}
    </article>
  )
}