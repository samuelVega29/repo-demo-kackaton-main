import { useMemo, useState } from 'react'
import { Sparkles, RotateCcw, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import { simulateLayout } from '../services/analyses'

const panel = 'rounded-2xl border border-[#e5e7ee] bg-white shadow-[0_8px_30px_-24px_rgba(21,19,35,.25)]'

function toDraft(gondolas) {
  return gondolas.map((gondola) => ({ ...gondola, x: Number(gondola.x ?? 0), z: Number(gondola.z ?? 0) }))
}

export default function SimulationPanel({ analysis, gondolas }) {
  const coordinateSystem = analysis.result?.coordinate_system
  const [draft, setDraft] = useState(() => toDraft(gondolas))
  const [simulation, setSimulation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const baseline = useMemo(() => new Map(gondolas.map((gondola) => [gondola.id, gondola])), [gondolas])
  const dirty = useMemo(
    () => draft.some((item) => {
      const original = baseline.get(item.id)
      return !original || original.x !== item.x || original.z !== item.z
    }),
    [draft, baseline],
  )

  if (coordinateSystem && coordinateSystem !== 'meters') {
    return (
      <section className={`${panel} mt-8 p-5 sm:p-6`}>
        <Header />
        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          Este análisis se corrió en <b>modo rápido</b> (sin calibración de cámara en metros), así que no hay
          coordenadas físicas para simular un layout alternativo. Para usar esta función: entrá a la sede, hacé la
          <b> calibración de cámara</b> (4 puntos) en el editor de planograma, y corré un análisis nuevo — ese sí
          quedará en modo avanzado y vas a poder simular acá.
        </p>
      </section>
    )
  }

  if (!gondolas.length) {
    return (
      <section className={`${panel} mt-8 p-5 sm:p-6`}>
        <Header />
        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          Este análisis no tiene góndolas configuradas, así que no hay nada que mover para simular. Definí góndolas
          en el editor de planograma de la sede y corré un análisis nuevo.
        </p>
      </section>
    )
  }

  const move = (id, axis, value) => {
    setDraft((current) => current.map((item) => (item.id === id ? { ...item, [axis]: value } : item)))
  }

  const reset = () => {
    setDraft(toDraft(gondolas))
    setSimulation(null)
    setError('')
  }

  const run = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await simulateLayout(analysis.id, draft)
      setSimulation(result)
    } catch (err) {
      setError(err?.message || 'No fue posible simular este layout.')
      setSimulation(null)
    } finally {
      setLoading(false)
    }
  }

  const simulatedById = new Map((simulation?.gondolas || []).map((item) => [item.id, item]))

  return (
    <section className={`${panel} mt-8 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Header />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={!dirty && !simulation}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e5e7ee] px-3 text-xs font-bold text-slate-500 transition hover:border-slate-300 disabled:opacity-40"
          >
            <RotateCcw size={14} aria-hidden="true" />Reiniciar
          </button>
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff7a1a] px-4 text-xs font-bold text-white shadow-[0_14px_30px_-20px_rgba(255,122,26,.9)] transition hover:bg-[#ed6909] disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {loading ? 'Simulando…' : 'Simular este layout'}
          </button>
        </div>
      </div>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-500">
        Movés las góndolas (en metros) y volvemos a proyectar las mismas trayectorias reales de este video contra el
        nuevo layout. No es una predicción de clientes futuros: es "así se hubieran comportado los mismos visitantes
        con este acomodo". Los pick-ups no se recalculan (requieren datos de mano/pose que no se guardan).
      </p>

      {error && <p className="mt-3 rounded-xl bg-[#fff1f0] px-3 py-2 text-xs font-semibold text-[#c0392b]">{error}</p>}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#e5e7ee] text-[10px] font-black uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Góndola</th>
              <th className="py-2 pr-3">X (m)</th>
              <th className="py-2 pr-3">Z (m)</th>
              <th className="py-2 pr-3">Tráfico</th>
              <th className="py-2 pr-3">Permanencia (s)</th>
              <th className="py-2 pr-3">Interacciones</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((item) => {
              const original = baseline.get(item.id)
              const simulated = simulatedById.get(item.id)
              return (
                <tr key={item.id} className="border-b border-[#f1f4f8]">
                  <td className="py-2 pr-3 font-bold text-[#151323]">{item.name || item.id}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      step="0.1"
                      value={item.x}
                      onChange={(event) => move(item.id, 'x', Number(event.target.value))}
                      className="w-20 rounded-lg border border-[#e5e7ee] px-2 py-1 text-xs font-bold text-[#151323]"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      step="0.1"
                      value={item.z}
                      onChange={(event) => move(item.id, 'z', Number(event.target.value))}
                      className="w-20 rounded-lg border border-[#e5e7ee] px-2 py-1 text-xs font-bold text-[#151323]"
                    />
                  </td>
                  <MetricCells original={original} simulated={simulated} field="traffic" />
                  <MetricCells original={original} simulated={simulated} field="dwell_seconds" />
                  <MetricCells original={original} simulated={simulated} field="interactions" />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {simulation && (
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Simulado con {simulation.sampled_tracks} trayectorias reales a {simulation.sample_hz} muestras/seg.
        </p>
      )}
    </section>
  )
}

function Header() {
  return (
    <div>
      <span className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[.17em] text-[#cf4921]">
        <span className="h-1 w-7 rounded-full bg-[#ff7a1a]" />Simulación de layout
      </span>
      <h2 className="mt-2 text-xl font-bold tracking-[-.035em] text-[#151323]">¿Qué hubiera pasado con otro acomodo?</h2>
    </div>
  )
}

function MetricCells({ original, simulated, field }) {
  const originalValue = Number(original?.[field] ?? 0)
  if (!simulated) {
    return <td className="py-2 pr-3 text-slate-400">{formatMetric(originalValue, field)}</td>
  }
  const simulatedValue = Number(simulated[field] ?? 0)
  const delta = simulatedValue - originalValue
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const tone = delta > 0 ? 'text-[#12824c]' : delta < 0 ? 'text-[#c0392b]' : 'text-slate-400'
  return (
    <td className="py-2 pr-3">
      <span className="font-bold text-[#151323]">{formatMetric(simulatedValue, field)}</span>
      <span className={`ml-2 inline-flex items-center gap-1 text-[10px] font-bold ${tone}`}>
        <Icon size={11} aria-hidden="true" />
        {delta === 0 ? 'igual' : `${delta > 0 ? '+' : ''}${formatMetric(delta, field)}`}
      </span>
    </td>
  )
}

function formatMetric(value, field) {
  const rounded = field === 'dwell_seconds' ? Math.round(value * 10) / 10 : Math.round(value)
  return rounded.toLocaleString('es-CO', { maximumFractionDigits: 1 })
}
