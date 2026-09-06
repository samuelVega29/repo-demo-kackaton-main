import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { artifactUrl } from '../services/analyses'
import StoreScene from '../components/StoreScene'
import ShelfMatrix from '../components/ShelfMatrix'
import AnalysisVideo from '../components/AnalysisVideo'

const modes = [['traffic', 'Trafico'], ['dwell', 'Permanencia'], ['interaction', 'Interaccion']]

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
  const metrics = result.metrics || {}
  const video = result.video || {}

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

      <div className="mt-[90px] grid grid-cols-[1.45fr_.55fr] gap-[65px] max-[980px]:grid-cols-1 max-[760px]:mt-[75px] max-[760px]:gap-[65px]">
        <section>
          <div className="mb-7"><span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#1f6feb]">EVIDENCIA VISUAL</span><h2 className="mt-[9px] text-[clamp(33px,4vw,52px)] tracking-[-.045em] text-[#151323]">Frames y detecciones</h2></div>
          <div className="grid grid-cols-3 gap-[7px] max-[980px]:grid-cols-3 max-[760px]:grid-cols-2 max-[390px]:grid-cols-1">{(result.annotated_frames || []).map((filename, index) => <figure key={filename} className="relative m-0 aspect-video overflow-hidden rounded-lg bg-[#0e1916]"><img className="h-full w-full object-cover" src={artifactUrl(analysis.id, filename)} alt={`Frame procesado ${index + 1}`} /><figcaption className="absolute bottom-[7px] left-[7px] bg-[rgba(5,10,8,.83)] px-[7px] p-[5px] font-[ui-monospace,monospace] text-[7px] font-medium text-[#aac0b7]">FRAME {index + 1}</figcaption></figure>)}</div>
        </section>
        <section>
          <div className="mb-7"><span className="font-[ui-monospace,monospace] text-[10px] font-semibold tracking-[.17em] text-[#ff6b3d]">HALLAZGOS CALCULADOS</span><h2 className="mt-[9px] text-[clamp(33px,4vw,52px)] tracking-[-.045em] text-[#151323]">Que indican los datos</h2></div>
          {(result.findings || []).map((finding, index) => <article key={`${finding.title}-${index}`} className="grid grid-cols-[34px_1fr] gap-[14px] border-t border-[#e5e7ee] py-[19px]"><span className="font-[ui-monospace,monospace] text-[9px] font-semibold text-[#ff6b3d]">{String(index + 1).padStart(2, '0')}</span><div><h3 className="m-0 mb-[7px] text-[14px] text-[#151323]">{finding.title}</h3><p className="m-0 text-[10px] leading-[1.6] text-[#7d8392]">{finding.detail}</p></div></article>)}
        </section>
      </div>
    </section>
  )
}
