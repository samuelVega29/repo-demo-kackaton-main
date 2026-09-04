const rows = ['Superior', 'Media', 'Inferior']
const columns = ['Izquierda', 'Centro', 'Derecha']

export default function ShelfMatrix({ gondola, mode, events = [], pickupEvents = [] }) {
  if (!gondola) {
    return <div className="grid min-h-64 place-items-center p-8 text-center text-sm leading-7 text-slate-500">Selecciona una gondola en el planograma para inspeccionar su actividad.</div>
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
  const gondolaPickups = pickupEvents.filter((event) => event.gondola_id === gondola.id)

  return (
    <section className="p-5">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-teal-300">ANALISIS DE GONDOLA</span>
          <h3 className="mt-2 text-2xl font-semibold">{gondola.name}</h3>
        </div>
        <strong className="whitespace-nowrap font-mono text-xs text-lime-300">{labels[mode]}</strong>
      </div>

      <div className="grid grid-cols-[50px_repeat(3,minmax(0,1fr))] gap-1">
        <span />
        {columns.map((column) => <span className="grid h-14 place-items-center justify-self-center font-mono text-[7px] uppercase text-slate-500 [writing-mode:vertical-rl]" key={column}>{column}</span>)}
        {matrix.map((row, rowIndex) => (
          <div className="contents" key={rows[rowIndex]}>
            <span className="grid rotate-180 place-items-center font-mono text-[7px] uppercase text-slate-500 [writing-mode:vertical-rl]">{rows[rowIndex]}</span>
            {row.map((value, columnIndex) => (
              <div
                className="flex aspect-[1/.96] min-w-0 flex-col items-center justify-center border border-orange-400/40 bg-[#101e1a] p-1 text-center"
                key={`${rowIndex}-${columnIndex}`}
                style={{ opacity: 0.35 + (value / peak) * 0.65 }}
                title={`${rows[rowIndex]} / ${columns[columnIndex]}: ${value}`}
              >
                <span className="font-mono text-[10px] font-semibold">{mode === 'dwell' ? `${value.toFixed(1)}s` : value}</span>
                <small className="mt-1 block max-w-full overflow-hidden text-ellipsis text-[7px] text-slate-300/60">{gondola.products?.[rowIndex]?.[columnIndex]}</small>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 border border-white/10 text-center text-[10px] text-slate-500 sm:grid-cols-4 [&_b]:mb-1 [&_b]:block [&_b]:font-mono [&_b]:text-sm [&_b]:text-slate-100 [&>span]:border-r [&>span]:border-white/10 [&>span]:p-3 [&>span:last-child]:border-r-0">
        <span><b>{gondola.conversion_percent ?? 0}%</b>conversion</span>
        <span><b>{gondola.dwell_avg_seconds ?? 0}s</b>perman. media</span>
        <span><b>{gondola.engagement_avg_seconds ?? 0}s</b>atencion media</span>
        <span><b>{gondolaEvents.length}</b>interacciones</span>
        <span><b>{gondola.pickups ?? 0}</b>pick-ups</span>
      </div>
      {mode === 'pickup' && <div className="mt-4 grid gap-1 border border-white/10 bg-[#0c1714] p-3 text-[10px] text-slate-400 sm:grid-cols-2 [&_b]:text-lime-300">
        <span><b>{gondolaPickups.length}</b> pick-ups registrados en el video</span>
        <span><b>{gondola.pickup_ratio_percent ?? 0}%</b> de las interacciones resultaron en pick-up probable</span>
      </div>}
      <div className="mt-4 flex items-center gap-3 text-[10px] uppercase text-slate-500">
        <span>Etiquetado de productos</span>
        <div className="h-2 flex-1 overflow-hidden border border-slate-700 bg-[#12211c]"><i className="block h-full bg-lime-300" style={{ width: `${completeness}%` }} /></div>
        <b className="font-mono text-lime-300">{tagged}/{cellTotal}</b>
      </div>
      <p className="mt-5 text-xs leading-6 text-slate-500">Valores absolutos del video. El nivel vertical es una inferencia de baja confianza hasta disponer del modelo de interaccion propio. Los pick-ups son una aproximacion del alcance de la mano hacia la gondola (heuristica de baja confianza), no una confirmacion de compra.</p>
    </section>
  )
}
