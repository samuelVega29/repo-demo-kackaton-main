'use client'

import { ROWS as rows, COLUMNS as columns } from '@/lib/constants'

export default function ShelfMatrix({ gondola, mode, events = [] }) {
  if (!gondola) {
    return <div className="px-2 py-10 text-center text-sm text-muted">Selecciona una góndola en el planograma para inspeccionar su actividad.</div>
  }
  const matrix = gondola.matrices[mode]
  const labels = {
    traffic: `${gondola.traffic} visitantes`,
    dwell: `${gondola.dwell_seconds} s`,
    interaction: `${gondola.interactions} eventos`,
    pickup: `${gondola.pickups ?? 0} pick-ups`,
  }
  const peak = Math.max(...matrix.flat(), 1)
  const cellTotal = (gondola.products || []).flat().length || 9
  const tagged = (gondola.products || []).flat().filter(Boolean).length
  const completeness = Math.round((tagged / cellTotal) * 100)
  const gondolaEvents = events.filter((event) => event.gondola_id === gondola.id)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">ANÁLISIS DE GÓNDOLA</span>
          <h3 className="mt-1 text-sm font-semibold">{gondola.name}</h3>
        </div>
        <strong className="font-mono text-xs text-acid">{labels[mode]}</strong>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <span />
        {columns.map((column) => (
          <span key={column} className="text-center font-mono text-[10px] uppercase text-muted">
            {column}
          </span>
        ))}
        {matrix.map((row, rowIndex) => (
          <div className="contents" key={rows[rowIndex]}>
            <span className="flex items-center justify-center font-mono text-[10px] uppercase text-muted">
              {rows[rowIndex]}
            </span>
            {row.map((value, columnIndex) => (
              <div
                key={`${rowIndex}-${columnIndex}`}
                className="flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-center"
                style={{
                  backgroundColor: `rgba(97, 222, 192, ${0.06 + ((value / peak) * 0.5)})`,
                  border: `1px solid rgba(97, 222, 192, ${0.15 + ((value / peak) * 0.6)})`,
                }}
                title={`${rows[rowIndex]} / ${columns[columnIndex]}: ${value}`}
              >
                <span className="font-mono text-[11px] text-ink">
                  {mode === 'dwell' ? `${value.toFixed(1)}s` : value}
                </span>
                <small className="max-w-full truncate text-[9px] text-muted">
                  {gondola.products?.[rowIndex]?.[columnIndex]}
                </small>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-xs text-muted">
          <b className="text-ink">{gondola.conversion_percent ?? 0}%</b> conversión
        </span>
        <span className="text-xs text-muted">
          <b className="text-ink">{gondola.dwell_avg_seconds ?? 0}s</b> perman. media
        </span>
        <span className="text-xs text-muted">
          <b className="text-ink">{gondola.engagement_avg_seconds ?? 0}s</b> atención media
        </span>
        <span className="text-xs text-muted">
          <b className="text-ink">{gondolaEvents.length}</b> interacciones
        </span>
        <span className="text-xs text-muted">
          <b className="text-ink">{gondola.pickups ?? 0}</b> pick-ups
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">Etiquetado de productos</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
          <i
            className="block h-full rounded-full bg-mint transition-all"
            style={{ width: `${completeness}%` }}
          />
        </div>
        <b className="font-mono text-xs text-ink">
          {tagged}/{cellTotal}
        </b>
      </div>
      <p className="m-0 text-[11px] leading-4 text-muted">
        Valores absolutos del video. El nivel vertical es una inferencia de baja confianza hasta
        disponer del modelo de interacción propio.
      </p>
    </section>
  )
}