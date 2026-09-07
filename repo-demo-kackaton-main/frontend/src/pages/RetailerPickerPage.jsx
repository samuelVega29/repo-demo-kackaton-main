import PageIntro from '../components/ui/PageIntro'
import PageShell from '../components/ui/PageShell'

export default function RetailerPickerPage({ retailers, onSelect }) {
  return (
    <PageShell>
      <PageIntro eyebrow="01 / ORGANIZACION" title="Selecciona un" highlight="retailer.">
        Cada retailer mantiene aisladas sus sedes, configuraciones espaciales y analisis.
      </PageIntro>
      <div className="mt-12 grid gap-3 md:grid-cols-2">
        {retailers.map((item, index) => (
          <button
            className="grid min-h-44 grid-cols-[44px_1fr_auto] items-end gap-5 border border-white/10 bg-[#0b1512] p-6 text-left text-slate-100 transition hover:-translate-y-1 hover:border-teal-300"
            key={item.id}
            onClick={() => onSelect(item)}
            type="button"
          >
            <span className="self-start font-mono text-[10px] text-slate-500">R/{String(index + 1).padStart(2, '0')}</span>
            <span>
              <strong className="block text-2xl font-semibold">{item.name}</strong>
              <small className="mt-2 block text-xs text-slate-400">{item.site_count} sede{item.site_count === 1 ? '' : 's'} configurada{item.site_count === 1 ? '' : 's'}</small>
            </span>
            <span className="text-lime-300">-&gt;</span>
          </button>
        ))}
      </div>
    </PageShell>
  )
}
