import { useState } from 'react'
import PageIntro from '../components/ui/PageIntro'
import PageShell from '../components/ui/PageShell'

const initialForm = { name: '', city: '', camera_name: 'Camara principal', floor_width: 12, floor_depth: 8 }

export default function SitePickerPage({ retailer, sites, onSelect, onBack, onCreate }) {
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm)

  const submit = async (event) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      await onCreate(form)
    } catch (requestError) {
      setError(requestError.message)
      setCreating(false)
    }
  }

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  return (
    <PageShell>
      <button className="mb-10 bg-transparent text-sm text-slate-400" onClick={onBack} type="button">&lt;- Retailers</button>
      <PageIntro
        eyebrow={`02 / SEDES DE ${retailer.name.toUpperCase()}`}
        title="Elige el"
        highlight="espacio."
        aside={<button className="border border-lime-300 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-lime-300" onClick={() => setShowCreate((value) => !value)} type="button">{showCreate ? 'Cancelar' : '+ Nueva sede'}</button>}
      >
        La configuracion crea el espacio. El video crea la inteligencia.
      </PageIntro>

      {showCreate && (
        <form className="mt-10 grid gap-4 border border-teal-300/30 bg-[#0c1915] p-5 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr_1.1fr]" onSubmit={submit}>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Registrar espacio</span>
            <h2 className="mt-2 text-2xl font-semibold">Nueva sede</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Comienza con un plano vacio.</p>
          </div>
          <label className="grid gap-2 text-[10px] uppercase text-slate-400">Nombre<input className="border border-white/10 bg-[#101f1a] p-3 text-sm text-white" required value={form.name} onChange={(event) => updateField('name', event.target.value)} /></label>
          <label className="grid gap-2 text-[10px] uppercase text-slate-400">Ciudad<input className="border border-white/10 bg-[#101f1a] p-3 text-sm text-white" required value={form.city} onChange={(event) => updateField('city', event.target.value)} /></label>
          <label className="grid gap-2 text-[10px] uppercase text-slate-400">Camara<input className="border border-white/10 bg-[#101f1a] p-3 text-sm text-white" required value={form.camera_name} onChange={(event) => updateField('camera_name', event.target.value)} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-[10px] uppercase text-slate-400">Ancho<input className="border border-white/10 bg-[#101f1a] p-3 text-sm text-white" type="number" min="2" max="100" step="0.5" value={form.floor_width} onChange={(event) => updateField('floor_width', Number(event.target.value))} /></label>
            <label className="grid gap-2 text-[10px] uppercase text-slate-400">Fondo<input className="border border-white/10 bg-[#101f1a] p-3 text-sm text-white" type="number" min="2" max="100" step="0.5" value={form.floor_depth} onChange={(event) => updateField('floor_depth', Number(event.target.value))} /></label>
          </div>
          {error && <p className="lg:col-span-full text-sm text-orange-300">{error}</p>}
          <button className="bg-lime-300 px-5 py-3 font-bold text-[#07100e] lg:col-span-full" disabled={creating} type="submit">{creating ? 'Creando sede...' : 'Crear y configurar'}</button>
        </form>
      )}

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        {sites.map((site) => (
          <button className="grid min-h-72 gap-4 border border-white/10 bg-[#0b1512] p-3 text-left transition hover:-translate-y-1 hover:border-teal-300 md:grid-cols-[1fr_1.15fr]" key={site.id} onClick={() => onSelect(site)} type="button">
            <span className="relative min-h-56 overflow-hidden bg-[#0e1b17]">
              {site.configuration.gondolas.map((gondola) => (
                <i className="absolute h-[8%] border border-teal-300/40 bg-teal-700/50" key={gondola.id} style={{ left: `${gondola.x / site.configuration.floor.width * 100}%`, top: `${gondola.z / site.configuration.floor.depth * 100}%`, width: `${gondola.width / site.configuration.floor.width * 100}%` }} />
              ))}
              <span className="absolute bottom-4 left-4 font-mono text-[10px] text-orange-300">CAM 01</span>
            </span>
            <span className="self-end p-4">
              <small className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">{site.city}</small>
              <strong className="mt-3 block text-2xl">{site.name}</strong>
              <small className="mt-2 block text-xs text-slate-400">{site.configuration.gondolas.length} gondolas / {site.configuration.zones.length} zonas / {site.configuration.camera.name}</small>
              <b className="mt-6 block text-xs text-lime-300">Entrar -&gt;</b>
            </span>
          </button>
        ))}
      </div>
    </PageShell>
  )
}
