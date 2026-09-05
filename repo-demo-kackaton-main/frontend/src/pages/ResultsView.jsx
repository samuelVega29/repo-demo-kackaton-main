import { useState } from 'react'
import { artifactUrl } from '../api/client'
import { modes } from '../lib/constants'
import StoreScene from '../components/analysis/StoreScene'
import ShelfMatrix from '../components/analysis/ShelfMatrix'
import AnalysisVideo from '../components/analysis/AnalysisVideo'

function OverlayViewer({ analysis }) {
  const [mode, setMode] = useState('traffic')
  const overlays = analysis.result?.heatmaps?.overlays || {}
  const files = overlays[mode] || []
  const order = ['traffic', 'dwell', 'interaction', 'pickup']
  if (!order.some((key) => (overlays[key] || []).length)) return null
  return (
    <section className="overlay-viewer">
      <div className="section-title"><span className="eyebrow">HEATMAP SOBRE VIDEO REAL</span><h2>Calor en la escena</h2><p>Las zonas calientes del piso proyectadas sobre los fotogramas de la cámara.</p></div>
      <div className="lens-tabs" role="tablist">{order.map((value) => <button role="tab" aria-selected={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} key={value} disabled={!(overlays[value] || []).length}>{value}</button>)}</div>
      <div className="frame-strip overlay-strip">{files.map((filename, index) => <figure key={filename}><img src={artifactUrl(analysis.id, filename)} alt={`Heatmap ${mode} frame ${index + 1}`} /><figcaption>{mode.toUpperCase()} · FRAME {index + 1}</figcaption></figure>)}</div>
    </section>
  )
}

export default function ResultsView({ analysis, mode, setMode, selectedId, setSelectedId, closeDetail }) {
  const result = analysis.result
  const selected = result.gondolas.find((item) => item.id === selectedId)
  const heatmapUrl = artifactUrl(analysis.id, `${mode}.png`)
  const interactionAvailable = Boolean(result.heatmaps.interaction)
  const pickupAvailable = Boolean(result.heatmaps.pickup)
  return (
    <section className="results-page">
      <div className="results-header"><div><span className="eyebrow">ANÁLISIS COMPLETADO · {result.model.tracker.toUpperCase()}</span><h1>Spatial <em>Lens.</em></h1></div><div className="video-facts"><span><b>{result.metrics.tracked_presences ?? result.metrics.people_detected}</b>Presencias rastreadas</span><span><b>{result.video.duration_seconds}s</b>Duración</span><span><b>{result.video.processed_frames}</b>Frames</span><span><b>{result.metrics.interaction_events}</b>Interacciones inferidas</span><span><b>{result.metrics.pickup_events ?? 0}</b>Pick-ups inferidos</span><span><b>{result.metrics.average_speed_m_s ?? 0} m/s</b>Velocidad media</span><span><b>{result.metrics.flow_per_minute ?? 0}/min</b>Flujo</span><span><b>{result.metrics.peak_presence ?? 0}</b>Pico simultáneo</span></div></div>
      <div className="lens-tabs" role="tablist">{modes.map(([value, label]) => <button role="tab" aria-selected={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} key={value}>{label}{value === 'interaction' && !interactionAvailable && <small>evidencia insuficiente</small>}{value === 'pickup' && !pickupAvailable && <small>sin pick-ups</small>}</button>)}</div>
      <div className="spatial-layout">
        <div className="spatial-main">
          <StoreScene result={result} mode={mode} selectedId={selectedId} onSelect={setSelectedId} heatmapUrl={heatmapUrl} slices={result.heatmaps?.slices} analysisId={analysis.id} />
          <div className="map-legend"><span>BAJA</span><i /><span>ALTA</span><b>{mode.toUpperCase()} · METROS</b></div>
        </div>
        <aside className={`detail-panel ${selected ? 'open' : ''}`}>
          <button className="sheet-close" onClick={closeDetail}>×</button>
          <ShelfMatrix gondola={selected} mode={mode} events={result.interaction_events_log || []} />
          {selected && <div className="gondola-stats"><span><b>{selected.visitors}</b>visitantes</span><span><b>{selected.dwell_seconds}s</b>permanencia</span><span><b>{selected.interactions}</b>eventos inferidos</span><span><b>{selected.pickups ?? 0}</b>pick-ups</span><span><b>{selected.conversion_percent ?? 0}%</b>conversión</span></div>}
        </aside>
      </div>
      <div className="evidence-layout">
        <section><div className="section-title"><span className="eyebrow">EVIDENCIA VISUAL</span><h2>Frames + detecciones</h2></div><div className="frame-strip">{result.annotated_frames.map((filename, index) => <figure key={filename}><img src={artifactUrl(analysis.id, filename)} alt={`Frame procesado ${index + 1}`} /><figcaption>YOLO · FRAME {index + 1}</figcaption></figure>)}</div></section>
        <section className="findings"><div className="section-title"><span className="eyebrow">HALLAZGOS CALCULADOS</span><h2>Qué indican los datos</h2></div>{result.findings.map((finding, index) => <article key={`${finding.title}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{finding.title}</h3><p>{finding.detail}</p></div></article>)}<div className="quality-note"><b>Calidad del análisis</b><span>Homografía: {result.quality.calibration}</span><span>Interacción: {result.quality.interaction}</span><span>Sin rostros, biometría ni atributos personales.</span></div></section>
      </div>
      <AnalysisVideo analysis={analysis} selectedId={selectedId} onSelect={setSelectedId} />
      <OverlayViewer analysis={analysis} />
    </section>
  )
}