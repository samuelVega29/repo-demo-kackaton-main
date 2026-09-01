import { useEffect, useRef, useState } from 'react'
import { api, artifactUrl } from './api/client'
import { useAuth } from './auth/AuthProvider'
import ProcessRail from './components/ProcessRail'
import ShelfMatrix from './components/ShelfMatrix'
import StoreScene from './components/StoreScene'
import PlanogramEditor from './components/flow/PlanogramEditor'
import CameraCalibration from './components/flow/CameraCalibration'
import VideoOverlay from './components/VideoOverlay'
import AnalysisVideo from './components/AnalysisVideo'

const modes = [['traffic', 'Tráfico'], ['dwell', 'Permanencia'], ['interaction', 'Interacción']]

function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('admin@scapder.ai')
  const [password, setPassword] = useState('Scapder2026!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true)
    try { await login(email, password) } catch (requestError) { setError(requestError.message) } finally { setLoading(false) }
  }
  return (
    <main className="login-page">
      <div className="login-visual">
        <div className="radar"><i /><i /><i /><span /></div>
        <span className="eyebrow">SPATIAL RETAIL INTELLIGENCE</span>
        <h1>La tienda también<br /><em>habla en datos.</em></h1>
        <p>Computer Vision para comprender movimiento, permanencia y comportamiento frente a góndola sin identificar personas.</p>
        <div className="privacy-seal">PRIVACY BY DESIGN · TEMPORARY IDS · NO BIOMETRICS</div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="brand-mark">S</span><span>SCAPDER<small>VISION OS</small></span></div>
        <div><span className="eyebrow">ACCESO SEGURO</span><h2>Bienvenido.</h2><p>Ingresa al espacio de tu organización.</p></div>
        <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={loading}>{loading ? 'Verificando…' : 'Ingresar'}<b>→</b></button>
        <small className="demo-note">Demo local: admin@scapder.ai / Scapder2026!</small>
      </form>
    </main>
  )
}

function Header({ user, logout, retailer, site, goHome }) {
  return (
    <header className="app-header">
      <button className="brand brand-button" onClick={goHome}><span className="brand-mark">S</span><span>SCAPDER<small>SPATIAL OS</small></span></button>
      <nav className="breadcrumbs"><button onClick={goHome}>Retailers</button>{retailer && <><i>/</i><span>{retailer.name}</span></>}{site && <><i>/</i><span>{site.name}</span></>}</nav>
      <div className="user-chip"><span>{user.name}<small>{user.role}</small></span><button onClick={logout} aria-label="Cerrar sesión">↗</button></div>
    </header>
  )
}

function RetailerPicker({ retailers, onSelect }) {
  return (
    <section className="selection-page">
      <span className="eyebrow">01 · ORGANIZACIÓN</span><h1>Selecciona un <em>retailer.</em></h1>
      <p className="lead">Cada retailer mantiene aisladas sus sedes, configuraciones espaciales y análisis.</p>
      <div className="retailer-grid">{retailers.map((item, index) => <button className="retailer-card" key={item.id} onClick={() => onSelect(item)}><span>R/{String(index + 1).padStart(2, '0')}</span><div><h3>{item.name}</h3><p>{item.site_count} sede{item.site_count === 1 ? '' : 's'} configurada{item.site_count === 1 ? '' : 's'}</p></div><b>→</b></button>)}</div>
    </section>
  )
}

function SitePicker({ retailer, sites, onSelect, onBack, onCreate }) {
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

function OverlayViewer({ analysis }) {
  const [mode, setMode] = useState('traffic')
  const overlays = analysis.result?.heatmaps?.overlays || {}
  const files = overlays[mode] || []
  const order = ['traffic', 'dwell', 'interaction']
  if (!order.some((key) => (overlays[key] || []).length)) return null
  return (
    <section className="overlay-viewer">
      <div className="section-title"><span className="eyebrow">HEATMAP SOBRE VIDEO REAL</span><h2>Calor en la escena</h2><p>Las zonas calientes del piso proyectadas sobre los fotogramas de la cámara.</p></div>
      <div className="lens-tabs" role="tablist">{order.map((value) => <button role="tab" aria-selected={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} key={value} disabled={!(overlays[value] || []).length}>{value}</button>)}</div>
      <div className="frame-strip overlay-strip">{files.map((filename, index) => <figure key={filename}><img src={artifactUrl(analysis.id, filename)} alt={`Heatmap ${mode} frame ${index + 1}`} /><figcaption>{mode.toUpperCase()} · FRAME {index + 1}</figcaption></figure>)}</div>
    </section>
  )
}

function UploadView({ site, file, preview, chooseFile, inputRef, analyze, job, updateConfiguration, saveConfiguration, frameCapture, onFrameCapture, onSuggestGondolas }) {
  const running = job && !['completed', 'failed'].includes(job.status)
  const [showCalibration, setShowCalibration] = useState(false)
  const [showVerify, setShowVerify] = useState(false)
  const calibrationLabel = site.configuration.camera.calibration_status === 'uncalibrated' ? 'sin calibrar' : site.configuration.camera.calibration_status
  return (
    <section className="upload-workspace">
      <div className="workspace-intro"><div><span className="eyebrow">03 · NUEVO ANÁLISIS</span><h1>Observa el espacio<br /><em>en movimiento.</em></h1></div><p>{site.city} · {site.name}<br />Calibración: <b>{calibrationLabel}</b></p></div>
      {site.configuration.camera.calibration_status === 'uncalibrated' && <div className="calibration-warning"><b>Cámara sin calibrar</b><span>Puedes configurar y guardar el planograma, pero la proyección en metros será aproximada hasta relacionar cuatro puntos del video con el piso real.</span></div>}
      <div className="tool-callouts"><button onClick={() => setShowCalibration((value) => !value)} className={showCalibration ? 'active' : ''}>◈ Calibrar cámara</button><button onClick={() => setShowVerify((value) => !value)} className={showVerify ? 'active' : ''}>⌖ Verificar alineación</button></div>
      {showCalibration && <CameraCalibration preview={preview} configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} onCapture={onFrameCapture} onClose={() => setShowCalibration(false)} />}
      {showVerify && <VideoOverlay preview={preview} configuration={site.configuration} onClose={() => setShowVerify(false)} />}
      <PlanogramEditor configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} frameCapture={frameCapture} onSuggest={onSuggestGondolas} />
      <div className="upload-grid">
        <div className="upload-controls">
          <span className="field-label">VIDEO MP4 · CÁMARA CONFIGURADA</span>
          <button className={`drop-zone ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept="video/mp4,.mp4" hidden onChange={(event) => chooseFile(event.target.files[0])} /><span className="upload-icon">＋</span><strong>{file?.name || 'Seleccionar video MP4'}</strong><small>{file ? `${(file.size / 1048576).toFixed(1)} MB · listo` : 'Desde tu computador o celular'}</small></button>
          <div className="configuration-summary"><span><b>{site.configuration.floor.width}×{site.configuration.floor.depth}m</b>Piso configurado</span><span><b>{site.configuration.zones.length}</b>Zonas</span><span><b>{site.configuration.gondolas.length}</b>Góndolas</span></div>
          <button className="primary-button" disabled={!file || running} onClick={analyze}>{running ? 'Procesando…' : 'Analizar video'}<b>→</b></button>
          {job && <div className={`job-progress ${job.status === 'failed' ? 'error' : ''}`} aria-live="polite"><div><span>{job.message}</span><b>{job.progress}%</b></div><progress value={job.progress} max="100" /></div>}
        </div>
        <div className="video-preview">{preview ? <video src={preview} controls playsInline /> : <div><span>CAMERA FEED</span><p>La vista previa aparecerá aquí</p></div>}<i className="scan-line" /></div>
      </div>
      <ProcessRail stage={job?.stage} progress={job?.progress} running={running} />
    </section>
  )
}

function ResultsView({ analysis, mode, setMode, selectedId, setSelectedId, closeDetail }) {
  const result = analysis.result
  const selected = result.gondolas.find((item) => item.id === selectedId)
  const heatmapUrl = artifactUrl(analysis.id, `${mode}.png`)
  const interactionAvailable = Boolean(result.heatmaps.interaction)
  return (
    <section className="results-page">
      <div className="results-header"><div><span className="eyebrow">ANÁLISIS COMPLETADO · {result.model.tracker.toUpperCase()}</span><h1>Spatial <em>Lens.</em></h1></div><div className="video-facts"><span><b>{result.metrics.tracked_presences ?? result.metrics.people_detected}</b>Presencias rastreadas</span><span><b>{result.video.duration_seconds}s</b>Duración</span><span><b>{result.video.processed_frames}</b>Frames</span><span><b>{result.metrics.interaction_events}</b>Interacciones inferidas</span><span><b>{result.metrics.average_speed_m_s ?? 0} m/s</b>Velocidad media</span><span><b>{result.metrics.flow_per_minute ?? 0}/min</b>Flujo</span><span><b>{result.metrics.peak_presence ?? 0}</b>Pico simultáneo</span></div></div>
      <div className="lens-tabs" role="tablist">{modes.map(([value, label]) => <button role="tab" aria-selected={mode === value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)} key={value}>{label}{value === 'interaction' && !interactionAvailable && <small>evidencia insuficiente</small>}</button>)}</div>
      <div className="spatial-layout">
        <div className="spatial-main">
          <StoreScene result={result} mode={mode} selectedId={selectedId} onSelect={setSelectedId} heatmapUrl={heatmapUrl} slices={result.heatmaps?.slices} analysisId={analysis.id} />
          <div className="map-legend"><span>BAJA</span><i /><span>ALTA</span><b>{mode.toUpperCase()} · METROS</b></div>
        </div>
        <aside className={`detail-panel ${selected ? 'open' : ''}`}>
          <button className="sheet-close" onClick={closeDetail}>×</button>
          <ShelfMatrix gondola={selected} mode={mode} events={result.interaction_events_log || []} />
          {selected && <div className="gondola-stats"><span><b>{selected.visitors}</b>visitantes</span><span><b>{selected.dwell_seconds}s</b>permanencia</span><span><b>{selected.interactions}</b>eventos inferidos</span><span><b>{selected.conversion_percent ?? 0}%</b>conversión</span></div>}
        </aside>
      </div>
      <div className="evidence-layout">
        <section><div className="section-title"><span className="eyebrow">EVIDENCIA VISUAL</span><h2>Frames + detecciones</h2></div><div className="frame-strip">{result.annotated_frames.map((filename, index) => <figure key={filename}><img src={artifactUrl(analysis.id, filename)} alt={`Frame procesado ${index + 1}`} /><figcaption>YOLO · FRAME {index + 1}</figcaption></figure>)}</div></section>
        <section className="findings"><div className="section-title"><span className="eyebrow">HALLAZGOS CALCULADOS</span><h2>Qué indican los datos</h2></div>{result.findings.map((finding, index) => <article key={`${finding.title}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{finding.title}</h3><p>{finding.detail}</p></div></article>)}<div className="quality-note"><b>Calidad del análisis</b><span>Homografía: {result.quality.calibration}</span><span>Interacción: {result.quality.interaction}</span><span>Sin rostros, biometría ni atributos personales.</span></div></section>
      </div>
      <AnalysisVideo analysis={analysis} selectedId={selectedId} onSelect={setSelectedId} />
      <OverlayViewer analysis={analysis} />
    </section>
  )
}

export default function App() {
  const { user, checking, logout } = useAuth()
  const [retailers, setRetailers] = useState([])
  const [retailer, setRetailer] = useState(null)
  const [sites, setSites] = useState([])
  const [site, setSite] = useState(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [job, setJob] = useState(null)
  const [mode, setMode] = useState('traffic')
  const [selectedId, setSelectedId] = useState(null)
  const [frameCapture, setFrameCapture] = useState(null)
  const inputRef = useRef(null)
  const siteRef = useRef(site)
  siteRef.current = site

  useEffect(() => { if (user) api('/api/retailers').then(setRetailers).catch(() => logout()) }, [user])
  useEffect(() => { if (retailer) api(`/api/retailers/${retailer.id}/sites`).then(setSites) }, [retailer])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => {
    if (!job?.id || ['completed', 'failed'].includes(job.status)) return
    const timer = window.setInterval(() => api(`/api/analyses/${job.id}`).then(setJob).catch((error) => setJob((current) => ({ ...current, status: 'failed', message: error.message }))), 1000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  if (checking) return <div className="boot-screen">SCAPDER <span>INITIALIZING</span></div>
  if (!user) return <LoginScreen />

  const chooseFile = (candidate) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.mp4')) { setJob({ status: 'failed', stage: 'upload', progress: 0, message: 'Selecciona un archivo MP4' }); return }
    if (preview) URL.revokeObjectURL(preview)
    setFile(candidate); setPreview(URL.createObjectURL(candidate)); setJob(null)
  }
  const analyze = async () => {
    const body = new FormData(); body.append('site_id', site.id); body.append('video', file)
    setJob({ status: 'uploading', stage: 'upload', progress: 0, message: 'Guardando configuración espacial…' })
    try {
      await saveConfiguration()
      setJob({ status: 'uploading', stage: 'upload', progress: 0, message: 'Guardando MP4…' })
      const created = await api('/api/analyses', { method: 'POST', body })
      setJob({ id: created.id, status: 'queued', stage: 'upload', progress: 1, message: 'Video recibido' })
    } catch (error) { setJob({ status: 'failed', stage: 'failed', progress: 100, message: error.message }) }
  }
  const updateConfiguration = (configuration) => setSite((current) => ({ ...current, configuration }))
  const handleFrameCapture = (dataUrl, width, height) => setFrameCapture({ dataUrl, width, height })
  const saveConfiguration = async (configuration) => {
    const payload = configuration ?? siteRef.current.configuration
    const saved = await api(`/api/sites/${siteRef.current.id}/configuration`, { method: 'PUT', body: JSON.stringify({ configuration: payload }) })
    setSite(saved)
    return saved
  }
  const goHome = () => { setRetailer(null); setSite(null); setJob(null); setFile(null); setSelectedId(null); setFrameCapture(null) }
  const createSite = async (values) => {
    const created = await api(`/api/retailers/${retailer.id}/sites`, { method: 'POST', body: JSON.stringify(values) })
    setSites((current) => [...current, created])
    setSite(created)
  }
  const suggestGondolas = async (capture) => {
    if (!capture?.dataUrl || !capture.width || !capture.height) throw new Error('Captura primero un frame en “Calibrar cámara”')
    const response = await api(`/api/sites/${siteRef.current.id}/suggest-gondolas`, {
      method: 'POST',
      body: JSON.stringify({ configuration: siteRef.current.configuration, image: capture.dataUrl, image_width: capture.width, image_height: capture.height }),
    })
    return response.candidates
  }
  return (
    <main className="app-shell">
      <Header user={user} logout={logout} retailer={retailer} site={site} goHome={goHome} />
      {!retailer && <RetailerPicker retailers={retailers} onSelect={setRetailer} />}
      {retailer && !site && <SitePicker retailer={retailer} sites={sites} onSelect={setSite} onBack={() => setRetailer(null)} onCreate={createSite} />}
      {site && !job?.result && <UploadView site={site} file={file} preview={preview} chooseFile={chooseFile} inputRef={inputRef} analyze={analyze} job={job} updateConfiguration={updateConfiguration} saveConfiguration={saveConfiguration} frameCapture={frameCapture} onFrameCapture={handleFrameCapture} onSuggestGondolas={suggestGondolas} />}
      {job?.result && <ResultsView analysis={job} mode={mode} setMode={setMode} selectedId={selectedId} setSelectedId={setSelectedId} closeDetail={() => setSelectedId(null)} />}
    </main>
  )
}
