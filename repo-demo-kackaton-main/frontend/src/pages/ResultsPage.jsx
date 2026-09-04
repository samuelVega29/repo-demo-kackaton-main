import { artifactUrl } from '../api/client'
import AnalysisVideo from '../components/AnalysisVideo'
import ShelfMatrix from '../components/ShelfMatrix'
import StoreScene from '../components/StoreScene'
import OverlayViewer from '../components/results/OverlayViewer'
import PageShell from '../components/ui/PageShell'
import { ANALYSIS_MODES } from '../constants/analysisModes'

export default function ResultsPage({ analysis, mode, setMode, selectedId, setSelectedId, closeDetail }) {
  const result = analysis.result
  const selected = result.gondolas.find((item) => item.id === selectedId)
  const heatmapUrl = artifactUrl(analysis.id, `${mode}.png`)
  const interactionAvailable = Boolean(result.heatmaps.interaction)

  return (
    <PageShell wide>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Analisis completado / {result.model.tracker.toUpperCase()}</span>
          <h1 className="mt-4 text-5xl font-medium leading-none text-white sm:text-7xl">Spatial <em className="not-italic text-lime-300">Lens.</em></h1>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:max-w-xl">
          <Fact value={result.metrics.tracked_presences ?? result.metrics.people_detected} label="Presencias" />
          <Fact value={`${result.video.duration_seconds}s`} label="Duracion" />
          <Fact value={result.video.processed_frames} label="Frames" />
          <Fact value={result.metrics.interaction_events} label="Interacciones" />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2" role="tablist">
        {ANALYSIS_MODES.map(([value, label]) => (
          <button className={`border px-4 py-3 text-sm ${mode === value ? 'border-lime-300 text-lime-300' : 'border-white/10 text-slate-300'}`} role="tab" aria-selected={mode === value} onClick={() => setMode(value)} key={value} type="button">
            {label}{value === 'interaction' && !interactionAvailable && <small className="ml-2 text-[9px] text-slate-500">evidencia insuficiente</small>}
          </button>
        ))}
      </div>

      <div className="mt-6 grid min-h-[620px] border border-white/10 bg-[#0c1714] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[520px]">
          <StoreScene result={result} mode={mode} selectedId={selectedId} onSelect={setSelectedId} heatmapUrl={heatmapUrl} slices={result.heatmaps?.slices} analysisId={analysis.id} />
          <div className="absolute left-4 top-4 flex items-center gap-2 bg-black/40 px-3 py-2 font-mono text-[10px] text-slate-300">
            <span>BAJA</span><i className="h-2 w-24 bg-gradient-to-r from-teal-500 via-lime-300 to-orange-400" /><span>ALTA</span>
          </div>
        </div>
        <aside className="border-t border-white/10 bg-[#0a1310] lg:border-l lg:border-t-0">
          <button className="m-3 ml-auto grid h-8 w-8 place-items-center border border-white/10 text-slate-300" onClick={closeDetail} type="button">x</button>
          <ShelfMatrix gondola={selected} mode={mode} events={result.interaction_events_log || []} />
          {selected && <div className="grid grid-cols-2 gap-2 p-4 text-xs"><Fact value={selected.visitors} label="Visitantes" /><Fact value={`${selected.dwell_seconds}s`} label="Permanencia" /><Fact value={selected.interactions} label="Eventos" /><Fact value={`${selected.conversion_percent ?? 0}%`} label="Conversion" /></div>}
        </aside>
      </div>

      <div className="mt-16 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Evidencia visual</span>
          <h2 className="mt-2 text-3xl font-semibold">Frames + detecciones</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.annotated_frames.map((filename, index) => (
              <figure className="border border-white/10 bg-[#0c1714] p-2" key={filename}>
                <img className="w-full" src={artifactUrl(analysis.id, filename)} alt={`Frame procesado ${index + 1}`} />
                <figcaption className="p-2 font-mono text-[10px] text-slate-400">YOLO / FRAME {index + 1}</figcaption>
              </figure>
            ))}
          </div>
        </section>
        <section>
          <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Hallazgos calculados</span>
          <h2 className="mt-2 text-3xl font-semibold">Que indican los datos</h2>
          <div className="mt-5 grid gap-3">
            {result.findings.map((finding, index) => (
              <article className="grid grid-cols-[40px_1fr] gap-4 border border-white/10 bg-[#0c1714] p-4" key={`${finding.title}-${index}`}>
                <span className="font-mono text-lime-300">{String(index + 1).padStart(2, '0')}</span>
                <div><h3 className="font-semibold">{finding.title}</h3><p className="mt-1 text-sm leading-6 text-slate-400">{finding.detail}</p></div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <AnalysisVideo analysis={analysis} selectedId={selectedId} onSelect={setSelectedId} />
      <OverlayViewer analysis={analysis} />
    </PageShell>
  )
}

function Fact({ value, label }) {
  return <span className="border border-white/10 bg-white/[0.03] p-3"><b className="block text-lg text-lime-300">{value}</b><small className="uppercase text-slate-500">{label}</small></span>
}
