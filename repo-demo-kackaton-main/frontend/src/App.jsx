import { useEffect, useRef, useState } from 'react'
import { api } from './api/client'
import { useAuth } from './auth/AuthProvider'
import AppHeader from './components/layout/AppHeader'
import RetailerPicker from './pages/RetailerPicker'
import SitePicker from './pages/SitePicker'
import UploadWorkspace from './pages/UploadWorkspace'
import ResultsView from './pages/ResultsView'
import LoginPage from './pages/LoginPage'

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

  useEffect(() => { if (user) api('/api/retailers').then(setRetailers).catch(() => logout()) }, [user])
  useEffect(() => { if (retailer) api(`/api/retailers/${retailer.id}/sites`).then((items) => setSites(items.map((item) => ({ ...item, configuration: { ...(item.configuration || {}), floor: { ...(item.configuration?.floor || {}), outline: undefined } } })))) }, [retailer])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => {
    if (!job?.id || ['completed', 'failed'].includes(job.status)) return
    const timer = window.setInterval(() => api(`/api/analyses/${job.id}`).then(setJob).catch((error) => setJob((current) => ({ ...current, status: 'failed', message: error.message }))), 1000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  if (checking) return <div className="boot-screen">SCAPDER <span>INITIALIZING</span></div>
  if (!user) return <LoginPage />

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
  const stripOutline = (configurationValue) => ({ ...configurationValue, floor: configurationValue.floor ? { ...configurationValue.floor, outline: undefined } : configurationValue.floor })
  const saveConfiguration = async (configuration) => {
    const current = configuration ?? site?.configuration
    const payload = stripOutline(current)
    const saved = await api(`/api/sites/${site?.id}/configuration`, { method: 'PUT', body: JSON.stringify({ configuration: payload }) })
    // El contorno del piso es solo visual: nunca llega al backend. Se re-inyecta en memoria
    // para que siga visible durante la sesión y desaparezca al re-entrar a la sede.
    const currentFloor = current.floor || {}
    if (currentFloor.outline) {
      setSite({ ...saved, configuration: { ...saved.configuration, floor: { ...saved.configuration.floor, outline: currentFloor.outline } } })
    } else {
      setSite(saved)
    }
    return saved
  }
  const goHome = () => { setRetailer(null); setSite(null); setJob(null); setFile(null); setSelectedId(null); setFrameCapture(null) }
  const createSite = async (values) => {
    const created = await api(`/api/retailers/${retailer.id}/sites`, { method: 'POST', body: JSON.stringify(values) })
    setSites((current) => [...current, created])
    setSite(created)
  }
  const createRetailer = async (values) => {
    const created = await api('/api/retailers', { method: 'POST', body: JSON.stringify(values) })
    setRetailers((current) => [created, ...current])
    setRetailer(created)
  }
  return (
    <main className="app-shell">
      <AppHeader user={user} logout={logout} retailer={retailer} site={site} goHome={goHome} />
      {!retailer && <RetailerPicker retailers={retailers} onSelect={setRetailer} onCreate={createRetailer} />}
      {retailer && !site && <SitePicker retailer={retailer} sites={sites} onSelect={setSite} onBack={() => setRetailer(null)} onCreate={createSite} />}
      {site && !job?.result && <UploadWorkspace site={site} file={file} preview={preview} chooseFile={chooseFile} inputRef={inputRef} analyze={analyze} job={job} updateConfiguration={updateConfiguration} saveConfiguration={saveConfiguration} frameCapture={frameCapture} onFrameCapture={handleFrameCapture} />}
      {job?.result && <ResultsView analysis={job} mode={mode} setMode={setMode} selectedId={selectedId} setSelectedId={setSelectedId} closeDetail={() => setSelectedId(null)} />}
    </main>
  )
}