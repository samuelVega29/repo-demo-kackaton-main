import { useState } from 'react'

export default function RetailerPicker({ retailers, onSelect, onCreate }) {
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', code: '' })
  const submit = async (event) => {
    event.preventDefault(); setCreating(true); setError('')
    try { await onCreate(form); setForm({ name: '', code: '' }); setShowCreate(false) } catch (requestError) { setError(requestError.message) }
    setCreating(false)
  }
  return (
    <section className="selection-page">
      <span className="eyebrow">01 · ORGANIZACIÓN</span><h1>Selecciona un <em>retailer.</em></h1>
      <p className="lead">Cada retailer mantiene aisladas sus sedes, configuraciones espaciales y análisis.</p>
      <div className="retailer-grid">
        {retailers.map((item, index) => <button className="retailer-card" key={item.id} onClick={() => onSelect(item)}><span>R/{String(index + 1).padStart(2, '0')}</span><div><h3>{item.name}</h3><p>{item.site_count} sede{item.site_count === 1 ? '' : 's'} configurada{item.site_count === 1 ? '' : 's'}</p></div><b>→</b></button>)}
        <button className="retailer-card new-retailer-card" onClick={() => setShowCreate((v) => !v)}><span>+</span><div><h3>{showCreate ? 'Cancelar' : 'Crear empresa'}</h3><p>{showCreate ? 'Cerrar formulario' : 'Registrar nuevo retailer'}</p></div><b>→</b></button>
      </div>
      {showCreate && <form className="new-retailer-form" onSubmit={submit}>
        <div><span className="eyebrow">NUEVO RETAILER</span><h2>Crear empresa</h2><p>Completá el nombre y un código único (ej. <code>MAY-001</code>). Después elegís la empresa y creás sedes.</p></div>
        <label>Nombre<input required minLength="2" maxLength="120" placeholder="Ej. Mi Empresa" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Código único<input required minLength="2" maxLength="50" placeholder="Ej. MAY-001" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /><small>Código corto, sin espacios.</small></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={creating}>{creating ? 'Creando…' : 'Crear empresa'}<b>→</b></button>
      </form>}
    </section>
  )
}