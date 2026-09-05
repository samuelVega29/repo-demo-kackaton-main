import { ROWS as rows, COLUMNS as columns } from '../../lib/constants'

export default function ShelfMatrix({ gondola, mode, events = [] }) {
  if (!gondola) {
    return <div className="matrix-empty">Selecciona una góndola en el planograma para inspeccionar su actividad.</div>
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
  const completeness = Math.round(tagged / cellTotal * 100)
  const gondolaEvents = events.filter((event) => event.gondola_id === gondola.id)
  return (
    <section className="shelf-analysis">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">ANÁLISIS DE GÓNDOLA</span>
          <h3>{gondola.name}</h3>
        </div>
        <strong>{labels[mode]}</strong>
      </div>
      <div className="matrix-wrap">
        <span />
        {columns.map((column) => <span className="matrix-axis top" key={column}>{column}</span>)}
        {matrix.map((row, rowIndex) => (
          <div className="matrix-row" key={rows[rowIndex]}>
            <span className="matrix-axis side">{rows[rowIndex]}</span>
            {row.map((value, columnIndex) => (
              <div
                className="matrix-cell"
                key={`${rowIndex}-${columnIndex}`}
                style={{ '--activity': value / peak }}
                title={`${rows[rowIndex]} / ${columns[columnIndex]}: ${value}`}
              >
                <span>{mode === 'dwell' ? `${value.toFixed(1)}s` : value}</span>
                <small>{gondola.products?.[rowIndex]?.[columnIndex]}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="matrix-extra">
        <span><b>{gondola.conversion_percent ?? 0}%</b>conversión</span>
        <span><b>{gondola.dwell_avg_seconds ?? 0}s</b>perman. media</span>
        <span><b>{gondola.engagement_avg_seconds ?? 0}s</b>atención media</span>
        <span><b>{gondolaEvents.length}</b>interacciones</span>
        <span><b>{gondola.pickups ?? 0}</b>pick-ups</span>
      </div>
      <div className="tagging-progress">
        <span>Etiquetado de productos</span>
        <div className="tagging-bar"><i style={{ width: `${completeness}%` }} /></div>
        <b>{tagged}/{cellTotal}</b>
      </div>
      <p className="matrix-note">Valores absolutos del video. El nivel vertical es una inferencia de baja confianza hasta disponer del modelo de interacción propio.</p>
    </section>
  )
}
