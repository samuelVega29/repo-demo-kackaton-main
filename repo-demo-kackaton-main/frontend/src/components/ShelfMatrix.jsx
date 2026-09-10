import { ROWS as rows, COLUMNS as columns } from '../utils/constants'

export default function ShelfMatrix({ gondola, mode, events = [] }) {
  if (!gondola) {
    return <div className="grid h-full place-items-center p-5 text-[#151323] text-center text-[12px] leading-[1.7] text-slate-500">Selecciona una góndola en el planograma para inspeccionar su actividad.</div>
  }
  const matrix = gondola.matrices?.[mode] ?? [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
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
    <section className="p-5 text-[#151323] max-[760px]:pt-[5px]">
      <div className="mb-5 flex items-center justify-between gap-[15px]">
        <div>
          <span className="text-[10px] font-medium  tracking-[.17em] text-[#cf4921]">ANÁLISIS DE GÓNDOLA</span>
          <h3 className="mt-2 mb-0 text-[23px]">{gondola.name}</h3>
        </div>
        <strong className="text-[10px] font-medium  whitespace-nowrap text-[#cf4921]">{labels[mode]}</strong>
      </div>
      <div className="grid grid-cols-[50px_repeat(3,1fr)] gap-1">
        <span />
        {columns.map((column) => <span className="grid place-items-center text-[9px] font-medium  uppercase text-slate-500 h-[58px] justify-self-center pb-[7px] [writing-mode:vertical-rl]" key={column}>{column}</span>)}
        {matrix.map((row, rowIndex) => (
          <div className="contents" key={rows[rowIndex]}>
            <span className="grid place-items-center text-[9px] font-medium  uppercase text-slate-500 [writing-mode:vertical-rl] rotate-180">{rows[rowIndex]}</span>
            {row.map((value, columnIndex) => (
              <div
                className="rounded-lg flex aspect-[1/.96] min-w-0 flex-col items-center justify-center border p-[5px] text-center border-[color-mix(in_srgb,rgba(255,107,61,.7)_calc(var(--activity)*70%),#fed7aa)] bg-[color-mix(in_srgb,rgba(255,107,61,.7)_calc(var(--activity)*100%),#fff7ed)]"
                key={`${rowIndex}-${columnIndex}`}
                style={{ '--activity': value / peak }}
                title={`${rows[rowIndex]} / ${columns[columnIndex]}: ${value}`}
              >
                <span className="text-[9px] font-medium ">{mode === 'dwell' ? `${value.toFixed(1)}s` : value}</span>
                <small className="mt-1 block max-w-full overflow-hidden text-ellipsis text-[9px] text-slate-600">{gondola.products?.[rowIndex]?.[columnIndex]}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 border border-[#e5e7ee] max-[390px]:grid-cols-2">
        <span className="border-r border-[#e5e7ee] p-[11px] px-[7px] text-center text-[10px] text-slate-500 last:border-r-0"><b className="mb-[3px] block text-[12px] font-medium  text-[#151323]">{gondola.conversion_percent ?? 0}%</b>conversión</span>
        <span className="border-r border-[#e5e7ee] p-[11px] px-[7px] text-center text-[10px] text-slate-500 last:border-r-0"><b className="mb-[3px] block text-[12px] font-medium  text-[#151323]">{gondola.dwell_avg_seconds ?? 0}s</b>perman. media</span>
        <span className="border-r border-[#e5e7ee] p-[11px] px-[7px] text-center text-[10px] text-slate-500 last:border-r-0"><b className="mb-[3px] block text-[12px] font-medium  text-[#151323]">{gondola.engagement_avg_seconds ?? 0}s</b>atención media</span>
        <span className="border-r border-[#e5e7ee] p-[11px] px-[7px] text-center text-[10px] text-slate-500 last:border-r-0"><b className="mb-[3px] block text-[12px] font-medium  text-[#151323]">{gondolaEvents.length}</b>interacciones</span>
        <span className="border-r border-[#e5e7ee] p-[11px] px-[7px] text-center text-[10px] text-slate-500 last:border-r-0"><b className="mb-[3px] block text-[12px] font-medium  text-[#151323]">{gondola.pickups ?? 0}</b>pick-ups</span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] uppercase text-slate-500">
        <span>Etiquetado de productos</span>
        <div className="h-[7px] flex-1 overflow-hidden border border-[#e5e7ee] bg-slate-100"><i className="block h-full bg-[#e65a2d]" style={{ width: `${completeness}%` }} /></div>
        <b className="text-[11px] font-medium  text-[#cf4921]">{tagged}/{cellTotal}</b>
      </div>
      <p className="mt-5 text-[9px] leading-[1.65] text-slate-500">Valores absolutos del video. El nivel vertical es una inferencia de baja confianza hasta disponer del modelo de interacción propio.</p>
    </section>
  )
}
