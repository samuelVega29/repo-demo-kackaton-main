import { useState } from 'react'
import { ArrowUpRight, BarChart3, Clock3, MousePointer2, PieChart, Users } from 'lucide-react'

const format = (value) => value.toLocaleString('es-CO', { maximumFractionDigits: 1 })
const numeric = (value) => value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value)
const display = (value) => numeric(value) === null ? 'Sin datos' : format(Number(value))
const colors = ['#FF7A1A', '#1F6FEB', '#D95D0B', '#14283F', '#FFAD73', '#75A7EB', '#315A86']
const categories = [
  { key: 'hot', name: 'Alta actividad', color: '#FF7A1A' },
  { key: 'normal', name: 'Actividad media', color: '#D95D0B' },
  { key: 'cold', name: 'Baja actividad', color: '#1F6FEB' },
  { key: 'unknown', name: 'Sin clasificación', color: '#A5ADB5' },
]
const categoryFor = (zone) => categories.find((item) => item.key === zone.classification) || categories[3]
const card = 'min-w-0 rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_32px_-24px_rgba(15,35,60,.22)] sm:p-6'

export default function AnalysisStatistics({ zones = [] }) {

  const rows = zones.map((zone, index) => ({ ...zone, name: zone.name || `Zona ${index + 1}`, color: colors[index % colors.length] }))
  const total = (key) => rows.reduce((sum, zone) => sum + (numeric(zone[key]) ?? 0), 0)
  const groups = categories.map((category) => ({ ...category, value: rows.filter((zone) => categoryFor(zone).key === category.key).length }))
  const ranked = [...rows].sort((a, b) => (numeric(b.visits) ?? 0) - (numeric(a.visits) ?? 0))
  const visible = ranked
  const dwell = [...rows].sort((a, b) => (numeric(b.dwell_seconds) ?? 0) - (numeric(a.dwell_seconds) ?? 0))
  const dwellGroups = dwell.slice(0, 5).map((zone) => ({ ...zone, value: numeric(zone.dwell_seconds) ?? 0 }))
  if (dwell.length > 5) dwellGroups.push({ name: 'Otras zonas', color: '#A5ADB5', value: dwell.slice(5).reduce((sum, zone) => sum + (numeric(zone.dwell_seconds) ?? 0), 0) })
  return <section aria-label="Gráficos estadísticos por zona" className="space-y-6 pt-4">
    {!rows.length ? <p className={card}>Los gráficos aparecerán cuando el análisis tenga zonas registradas.</p> : <>
      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard number="01" title="¿Dónde llegan más visitas?" subtitle="Visitas registradas por zona" className="xl:col-span-2" icon={Users}><Columns rows={visible} field="visits" unit="visitas" /></ChartCard>
        <ChartCard number="02" title="Pulso de actividad" subtitle="Distribución del total de zonas" icon={PieChart}><Donut groups={groups} center={String(rows.length)} label="zonas" unit="zonas" /></ChartCard>
        <ChartCard number="03" title="Tiempo para explorar" subtitle="Permanencia media por zona · segundos" icon={Clock3}><HorizontalBars rows={visible} field="avg_dwell_seconds" unit="s" /></ChartCard>
        <ChartCard number="04" title="Dónde ocurre la interacción" subtitle="Eventos detectados por zona" icon={MousePointer2}><HorizontalBars rows={visible} field="interactions" unit="eventos" /></ChartCard>
        <ChartCard number="05" title="Distribución del tiempo" subtitle="Participación en la permanencia acumulada" icon={PieChart}><Donut groups={dwellGroups} center={rows.some((zone) => numeric(zone.dwell_seconds) !== null) ? format(total('dwell_seconds')) : '—'} label="segundos" unit="s" /></ChartCard>
        <ChartCard number="06" title="Intensidad por zona" subtitle="Índice de actividad calculado · escala de 0 a 1" className="xl:col-span-3" icon={BarChart3}><Columns rows={visible} field="heat_index" unit="de índice" fixedMax={1} /></ChartCard>
      </div>
      <details className={`${card} group`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden"><div><h4 className="font-bold text-[#102d46]">Los números detrás de los gráficos</h4><p className="mt-1 text-xs text-slate-500">Consulta el detalle completo de las {rows.length} zonas</p></div><span className="rounded-full bg-slate-100 p-2 text-slate-500 transition-transform group-open:rotate-90"><ArrowUpRight size={18} /></span></summary>
        <div className="mt-5 overflow-x-auto" tabIndex={0} aria-label="Detalle estadístico por zona"><table className="w-full text-left text-sm"><caption className="sr-only">Datos completos de las zonas analizadas</caption><thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Zona', 'Actividad', 'Visitas', 'Tiempo total (s)', 'Tiempo medio (s)', 'Interacciones'].map((label) => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{ranked.map((zone, index) => <tr key={zone.zone_id ?? index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><th scope="row" className="px-4 py-4 font-medium"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: zone.color }} />{zone.name}</th><td className="whitespace-nowrap px-4 py-4"><span className="rounded-full px-2.5 py-1 text-xs" style={{ color: categoryFor(zone).color, background: `${categoryFor(zone).color}12` }}>{categoryFor(zone).name}</span></td>{[zone.visits, zone.dwell_seconds, zone.avg_dwell_seconds, zone.interactions].map((value, column) => <td key={column} className="px-4 py-4 tabular-nums text-slate-600">{display(value)}</td>)}</tr>)}</tbody></table></div>
      </details>
      <p className="px-1 text-[11px] leading-5 text-slate-500">Los gráficos comparativos muestran {visible.length} de {rows.length} zonas, ordenadas por visitas. Las donas incluyen todas las zonas. Las visitas pueden incluir a una misma persona en varias zonas; el índice de actividad no es un porcentaje de clientes. Los totales suman los valores disponibles.</p>
    </>}
  </section>
}

function ChartCard({ number, title, subtitle, icon: Icon, className = '', children }) {
  return <figure className={`${card} ${className}`}><figcaption className="mb-6 flex items-start justify-between gap-3"><div><span className="mb-2 block text-[10px] font-semibold tracking-[.15em] text-slate-400">GRÁFICO {number}</span><h5 className="text-base font-bold tracking-tight text-[#102d46]">{title}</h5><p className="mt-1 text-[11px] leading-5 text-slate-500">{subtitle}</p></div><span className="rounded-xl bg-slate-50 p-2.5 text-slate-400"><Icon size={18} /></span></figcaption>{children}</figure>
}

function Columns({ rows, field, unit, fixedMax }) {
  const max = fixedMax ?? Math.max(1, ...rows.map((row) => numeric(row[field]) ?? 0))
  return <div className="overflow-x-auto pb-1" tabIndex={0} aria-label={`Gráfico de ${unit} por zona`}><div style={{ minWidth: Math.max(260, rows.length * 76) }}>
    <div className="relative ml-10 mt-4 h-48 border-b border-slate-200">
      {[0, 0.5, 1].map((fraction) => <div key={fraction} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: `${fraction * 88}%` }}><span className="absolute -left-10 -top-2 w-8 text-right text-[10px] tabular-nums text-slate-400">{format(max * fraction)}</span></div>)}
      <div className="absolute inset-0 flex items-end justify-around gap-3 px-3">{rows.map((row, index) => <div key={row.zone_id ?? index} className="group relative flex h-full min-w-0 flex-1 items-end justify-center" title={`${row.name}: ${display(row[field])} ${unit}`}><div className="relative w-full max-w-14 rounded-t-lg transition-all duration-300 group-hover:brightness-110" style={{ height: `${Math.min(1, (numeric(row[field]) ?? 0) / max) * 88}%`, background: row.color }}><span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-600">{numeric(row[field]) === null ? '—' : display(row[field])}</span></div></div>)}</div>
    </div><div className="ml-10 flex justify-around gap-3 px-3 pt-3">{rows.map((row, index) => <span key={row.zone_id ?? index} className="min-w-0 flex-1 break-words text-center text-[10px] leading-4 text-slate-500">{row.name}</span>)}</div>
  </div></div>
}

function HorizontalBars({ rows, field, unit }) {
  const max = Math.max(1, ...rows.map((row) => numeric(row[field]) ?? 0))
  return <div className="max-h-[330px] space-y-5 overflow-y-auto pr-1" tabIndex={0} aria-label={`Comparación de ${unit} por zona`}>{rows.map((row, index) => <div key={row.zone_id ?? index} title={`${row.name}: ${display(row[field])} ${unit}`}><div className="mb-2 flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-slate-600">{row.name}</span><strong className="shrink-0 tabular-nums text-[#102d46]">{display(row[field])}{numeric(row[field]) !== null ? ` ${unit}` : ''}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${(numeric(row[field]) ?? 0) / max * 100}%`, background: row.color }} /></div></div>)}</div>
}

function Donut({ groups, center, label, unit }) {
  const [active, setActive] = useState(null)
  const total = groups.reduce((sum, group) => sum + group.value, 0)
  const selected = groups[active]
  let offset = 0
  return <div><div className="relative mx-auto h-44 w-44"><svg viewBox="0 0 200 200" role="img" aria-label={total ? groups.map((group) => `${group.name}: ${format(group.value)} ${unit}`).join('. ') : 'Sin valores positivos para representar'} className="h-full w-full -rotate-90"><circle cx="100" cy="100" r="80" fill="none" stroke="#f1f5f9" strokeWidth="23" />{groups.map((group, index) => {
    const percentage = total ? group.value / total * 100 : 0
    const start = offset
    offset += percentage
    const length = Math.max(0, percentage - (percentage < 100 ? 0.7 : 0))
    return <circle key={`${group.name}-${index}`} cx="100" cy="100" r="80" pathLength="100" fill="none" stroke={group.color} strokeWidth={active === index ? 28 : 23} strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} className="transition-all duration-200" opacity={active === null || active === index ? 1 : 0.35} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}><title>{group.name}: {format(group.value)} {unit} ({format(percentage)}%)</title></circle>
  })}</svg><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center"><strong className="max-w-full break-words text-2xl font-bold tracking-tight text-[#102d46]">{!selected ? center : `${format(total ? selected.value / total * 100 : 0)}%`}</strong><span className="mt-1 text-[10px] text-slate-400">{!selected ? label : selected.name}</span></div></div>
    <ul className="mt-5 space-y-1">{groups.map((group, index) => <li key={`${group.name}-${index}`}><button type="button" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-slate-50 focus-visible:outline-blue-500"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: group.color }} /><span className="min-w-0 flex-1 truncate text-slate-500">{group.name}</span><span className="tabular-nums text-slate-400">{format(group.value)} {unit}</span><strong className="w-12 text-right tabular-nums text-[#102d46]">{total ? `${format(group.value / total * 100)}%` : '—'}</strong></button></li>)}</ul>
    {!total && <p className="mt-2 text-center text-[11px] text-slate-400">Sin valores positivos para representar.</p>}
  </div>
}
