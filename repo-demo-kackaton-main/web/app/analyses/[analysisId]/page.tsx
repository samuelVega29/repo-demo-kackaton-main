'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import PageShell from '@/components/layout/PageShell'
import ProcessRail from '@/components/analysis/ProcessRail'
import AnalysisVideo from '@/components/analysis/AnalysisVideo'
import ShelfMatrix from '@/components/analysis/ShelfMatrix'
import { StoreSceneClient } from '@/components/three/clients'
import { api, artifactUrl } from '@/lib/api'
import { modes } from '@/lib/constants'

function OverlayViewer({ analysis }) {
  const [mode, setMode] = useState('traffic')
  const overlays = analysis.result?.heatmaps?.overlays || {}
  const files = overlays[mode] || []
  const order = ['traffic', 'dwell', 'interaction', 'pickup']
  if (!order.some((key) => (overlays[key] || []).length)) return null
  return (
    <section className="flex flex-col gap-4">
      <div>
        <span className="eyebrow">HEATMAP SOBRE VIDEO REAL</span>
        <h2 className="mt-1 text-base font-semibold">Calor en la escena</h2>
        <p className="m-0 text-xs text-muted">
          Las zonas calientes del piso proyectadas sobre los fotogramas de la cámara.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {order.map((value) => (
          <button
            role="tab"
            aria-selected={mode === value}
            disabled={!(overlays[value] || []).length}
            onClick={() => setMode(value)}
            key={value}
            className={`px-3 py-1.5 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === value
                ? 'border border-acid text-acid'
                : 'border border-line text-muted hover:border-muted hover:text-ink'
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="scroll flex gap-3 overflow-x-auto pb-2">
        {files.map((filename, index) => (
          <figure className="m-0 flex flex-col gap-1.5" key={filename}>
            <img
              src={artifactUrl(analysis.id, filename)}
              alt={`Heatmap ${mode} frame ${index + 1}`}
              className="h-40 w-64 rounded-lg border border-line object-cover"
            />
            <figcaption className="font-mono text-[10px] tracking-[0.1em] text-muted">
              {mode.toUpperCase()} · FRAME {index + 1}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function ResultsContent({ analysis }) {
  const [mode, setMode] = useState('traffic')
  const [selectedId, setSelectedId] = useState(null)
  const result = analysis.result
  const selected = result.gondolas.find((item) => item.id === selectedId)
  const heatmapUrl = artifactUrl(analysis.id, `${mode}.png`)
  const interactionAvailable = Boolean(result.heatmaps.interaction)
  const pickupAvailable = Boolean(result.heatmaps.pickup)
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">
            ANÁLISIS COMPLETADO · {result.model.tracker.toUpperCase()}
          </span>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">
            Spatial <em className="not-italic text-mint">Lens.</em>
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">
              {result.metrics.tracked_presences ?? result.metrics.people_detected}
            </b>
            <small className="text-muted">Presencias rastreadas</small>
          </span>
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">{result.video.duration_seconds}s</b>
            <small className="text-muted">Duración</small>
          </span>
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">{result.video.processed_frames}</b>
            <small className="text-muted">Frames</small>
          </span>
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">{result.metrics.interaction_events}</b>
            <small className="text-muted">Interacciones inferidas</small>
          </span>
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">
              {result.metrics.pickup_events ?? 0}
            </b>
            <small className="text-muted">Pick-ups inferidos</small>
          </span>
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">
              {result.metrics.average_speed_m_s ?? 0} m/s
            </b>
            <small className="text-muted">Velocidad media</small>
          </span>
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">
              {result.metrics.flow_per_minute ?? 0}/min
            </b>
            <small className="text-muted">Flujo</small>
          </span>
          <span className="text-xs">
            <b className="block font-mono text-base text-ink">{result.metrics.peak_presence ?? 0}</b>
            <small className="text-muted">Pico simultáneo</small>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {modes.map(([value, label]) => (
          <button
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            key={value}
            className={`px-4 py-2 font-mono text-xs transition-colors ${
              mode === value
                ? 'border border-acid bg-acid/10 text-acid'
                : 'border border-line text-muted hover:border-muted hover:text-ink'
            }`}
          >
            {label}
            {value === 'interaction' && !interactionAvailable && (
              <small className="ml-1 text-[9px] text-muted">evidencia insuficiente</small>
            )}
            {value === 'pickup' && !pickupAvailable && (
              <small className="ml-1 text-[9px] text-muted">sin pick-ups</small>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <StoreSceneClient
            result={result}
            mode={mode}
            selectedId={selectedId}
            onSelect={setSelectedId}
            heatmapUrl={heatmapUrl}
            slices={result.heatmaps?.slices}
            analysisId={analysis.id}
          />
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
            <span>BAJA</span>
            <i className="h-2 flex-1 rounded-sm bg-gradient-to-r from-[#101e1a] to-[#ff6b3d]" />
            <span>ALTA</span>
            <b className="ml-2 text-mint">{mode.toUpperCase()} · METROS</b>
          </div>
        </div>
        <aside
          className={`scroll flex h-fit flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition-colors ${
            selected ? 'border-mint/40' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="eyebrow">DETALLE DE GÓNDOLA</span>
            <button
              onClick={() => setSelectedId(null)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-lg text-muted transition-colors hover:text-acid"
              aria-label="Cerrar detalle"
            >
              ×
            </button>
          </div>
          <ShelfMatrix gondola={selected} mode={mode} events={result.interaction_events_log || []} />
          {selected && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-xs">
                <b className="block font-mono text-lg text-acid">{selected.visitors}</b>
                <small className="text-muted">visitantes</small>
              </span>
              <span className="text-xs">
                <b className="block font-mono text-lg text-acid">{selected.dwell_seconds}s</b>
                <small className="text-muted">permanencia</small>
              </span>
              <span className="text-xs">
                <b className="block font-mono text-lg text-acid">{selected.interactions}</b>
                <small className="text-muted">eventos inferidos</small>
              </span>
              <span className="text-xs">
                <b className="block font-mono text-lg text-acid">{selected.pickups ?? 0}</b>
                <small className="text-muted">pick-ups</small>
              </span>
              <span className="text-xs">
                <b className="block font-mono text-lg text-acid">
                  {selected.conversion_percent ?? 0}%
                </b>
                <small className="text-muted">conversión</small>
              </span>
            </div>
          )}
        </aside>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <span className="eyebrow">EVIDENCIA VISUAL</span>
            <h2 className="mt-1 text-base font-semibold">Frames + detecciones</h2>
          </div>
          <div className="scroll flex gap-3 overflow-x-auto pb-2">
            {result.annotated_frames.map((filename, index) => (
              <figure className="m-0 flex flex-col gap-1.5" key={filename}>
                <img
                  src={artifactUrl(analysis.id, filename)}
                  alt={`Frame procesado ${index + 1}`}
                  className="h-40 w-64 rounded-lg border border-line object-cover"
                />
                <figcaption className="font-mono text-[10px] tracking-[0.1em] text-muted">
                  YOLO · FRAME {index + 1}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <section className="flex flex-col gap-4">
          <div>
            <span className="eyebrow">HALLAZGOS CALCULADOS</span>
            <h2 className="mt-1 text-base font-semibold">Qué indican los datos</h2>
          </div>
          {result.findings.map((finding, index) => (
            <article
              className="flex gap-3 rounded-xl border border-line bg-panel p-4"
              key={`${finding.title}-${index}`}
            >
              <span className="font-mono text-xs text-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">{finding.title}</h3>
                <p className="m-0 text-xs leading-5 text-muted">{finding.detail}</p>
              </div>
            </article>
          ))}
          <div className="flex flex-col gap-1 rounded-xl border border-mint/20 bg-panel p-4 text-xs">
            <b className="text-mint">Calidad del análisis</b>
            <span className="text-muted">Homografía: {result.quality.calibration}</span>
            <span className="text-muted">Interacción: {result.quality.interaction}</span>
            <span className="text-muted">Sin rostros, biometría ni atributos personales.</span>
          </div>
        </section>
      </section>

      <AnalysisVideo analysis={analysis} selectedId={selectedId} onSelect={setSelectedId} />
      <OverlayViewer analysis={analysis} />
    </section>
  )
}

export default function AnalysesPage() {
  const { analysisId } = useParams()
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    api(`/api/analyses/${analysisId}`)
      .then(setAnalysis)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false))
  }, [analysisId])

  useEffect(() => {
    if (!analysis) return
    if (['completed', 'failed'].includes(analysis.status)) return
    const timer = window.setInterval(() => {
      api(`/api/analyses/${analysisId}`)
        .then(setAnalysis)
        .catch(() => {})
    }, 1000)
    return () => window.clearInterval(timer)
  }, [analysis, analysisId])

  return (
    <PageShell>
      {loading && <p className="text-sm text-muted">Cargando análisis…</p>}
      {error && (
        <p className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember">
          {error}
        </p>
      )}
      {analysis && analysis.status === 'failed' && (
        <p className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember">
          {analysis.error || analysis.message || 'El análisis falló.'}
        </p>
      )}
      {analysis &&
        !['completed', 'failed'].includes(analysis.status) && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel2 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm">{analysis.message || 'Procesando el video…'}</span>
              <b className="font-mono text-sm text-acid">{analysis.progress ?? 0}%</b>
            </div>
            <progress value={analysis.progress ?? 0} max="100" />
            <ProcessRail
              stage={analysis.stage}
              progress={analysis.progress}
              running={!['completed', 'failed'].includes(analysis.status)}
            />
          </div>
        )}
      {analysis && analysis.status === 'completed' && analysis.result && (
        <ResultsContent analysis={analysis} />
      )}
    </PageShell>
  )
}