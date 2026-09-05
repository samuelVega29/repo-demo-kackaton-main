import { useState } from 'react'

export default function SitePicker({ retailer, sites, onSelect, onBack, onCreate }) {
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', city: '', camera_name: 'Cámara principal', floor_width: 12, floor_depth: 8 })
  const submit = async (event) => {
    event.preventDefault(); setCreating(true); setError('')
    try { await onCreate(form) } catch (requestError) { setError(requestError.message); setCreating(false) }
  }
  return (
    <section className="selection-page">
      <button className="back-button" onClick={onBack}>← Retailers</button>
      <div className="site-picker-heading"><div><span className="eyebrow">02 · SEDES DE {retailer.name.toUpperCase()}</span><h1>Elige el <em>espacio.</em></h1><p className="lead">La configuración crea el espacio. El video crea la inteligencia.</p></div><button className="new-site-button" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancelar' : '＋ Nueva sede'}</button></div>
      {showCreate && <form className="new-site-form" onSubmit={submit}><div><span className="eyebrow">REGISTRAR ESPACIO</span><h2>Nueva sede</h2><p>Comienza con un plano vacío. Después podrás dibujar todas sus góndolas.</p></div><label>Nombre de la sede<input required minLength="2" placeholder="Ej. Sucursal Norte" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Ciudad<input required minLength="2" placeholder="Ej. Medellín" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label><label>Nombre de cámara<input required minLength="2" value={form.camera_name} onChange={(event) => setForm({ ...form, camera_name: event.target.value })} /></label><div className="new-site-measures"><label>Ancho del piso<input type="number" min="2" max="100" step="0.5" value={form.floor_width} onChange={(event) => setForm({ ...form, floor_width: Number(event.target.value) })} /><small>metros</small></label><label>Fondo del piso<input type="number" min="2" max="100" step="0.5" value={form.floor_depth} onChange={(event) => setForm({ ...form, floor_depth: Number(event.target.value) })} /><small>metros</small></label></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={creating}>{creating ? 'Creando sede…' : 'Crear y configurar'}<b>→</b></button></form>}
      <div className="site-grid">{sites.map((site) => <button className="site-card" key={site.id} onClick={() => onSelect(site)}><div className="site-mini-map">{site.configuration.gondolas.map((gondola) => <i key={gondola.id} style={{ left: `${gondola.x / site.configuration.floor.width * 100}%`, top: `${gondola.z / site.configuration.floor.depth * 100}%`, width: `${gondola.width / site.configuration.floor.width * 100}%` }} />)}<span>CAM 01</span></div><div><span className="eyebrow">{site.city}</span><h3>{site.name}</h3><p>{site.configuration.gondolas.length} góndolas · {site.configuration.zones.length} zonas · {site.configuration.camera.name}</p></div><b>Entrar →</b></button>)}</div>
    </section>
  )
}