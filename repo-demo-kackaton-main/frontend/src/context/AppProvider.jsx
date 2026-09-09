import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { useJobPolling } from '../hooks/useJobPolling'
import { createAnalysis, getAnalysis } from '../services/analyses'
import { createRetailer as createRetailerRequest, createSite as createSiteRequest, deleteRetailer as deleteRetailerRequest, getRetailerSites, getRetailers } from '../services/retailers'
import { deleteSite as deleteSiteRequest, saveSiteConfiguration, getSite } from '../services/sites'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

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
  const [analysisArea, setAnalysisArea] = useState(null)

  const inputRef = useRef(null)
  const siteRef = useRef(site)
  siteRef.current = site

  useEffect(() => { if (user) getRetailers().then(setRetailers).catch(() => logout()) }, [user, logout])
  useEffect(() => { if (retailer) getRetailerSites(retailer.id).then(setSites) }, [retailer])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useJobPolling(job, setJob)

  useEffect(() => {
    if (!job?.result || !job?.id) return
    const resultPath = `/analyses/${job.id}`
    const processingPath = `${resultPath}/procesando`

    const isProcessingRoute = location.pathname === processingPath || location.pathname.startsWith(`${processingPath}/`)
    if (isProcessingRoute) {
      navigate(resultPath, { replace: true })
    }
  }, [job?.result, job?.id, location.pathname, navigate])

  const goHome = useCallback(() => {
    setRetailer(null)
    setSite(null)
    setJob(null)
    setFile(null)
    setSelectedId(null)
    setFrameCapture(null)
    setAnalysisArea(null)
    navigate('/empresas', { replace: true })
  }, [navigate])

  const selectRetailer = useCallback((item) => {
    setRetailer(item)
    setSite(null)
    setJob(null)
    navigate(`/empresas/${item.id}/sedes`)
  }, [navigate])

  const createRetailer = useCallback(async (values) => {
    const created = await createRetailerRequest(values)
    setRetailers((current) => [created, ...current])
    setRetailer(created)
    navigate(`/empresas/${created.id}/sedes`)
  }, [navigate])

  const deleteRetailer = useCallback(async (item) => {
    await deleteRetailerRequest(item.id)
    setRetailers((current) => current.filter((retailerItem) => retailerItem.id !== item.id))
    setSites([])
    if (retailer?.id === item.id) setRetailer(null)
    if (site?.retailer_id === item.id) setSite(null)
    navigate('/empresas', { replace: true })
  }, [navigate, retailer?.id, site?.retailer_id])

  const selectSite = useCallback((item) => {
    setSite(item)
    setJob(null)
    setSelectedId(null)
    setAnalysisArea(null)
    navigate(`/sedes/${item.id}`)
  }, [navigate])

  const createSite = useCallback(async (values) => {
    const created = await createSiteRequest(retailer.id, values)
    setSites((current) => [...current, created])
    setSite(created)
    navigate(`/sites/${created.id}/video`)
  }, [navigate, retailer?.id])

  const deleteSite = useCallback(async (item) => {
    await deleteSiteRequest(item.id)
    setSites((current) => current.filter((siteItem) => siteItem.id !== item.id))
    if (site?.id === item.id) setSite(null)
  }, [site?.id])

  const chooseFile = (candidate) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.mp4')) { setJob({ status: 'failed', stage: 'upload', progress: 0, message: 'Selecciona un archivo MP4' }); return }
    setFile(candidate)
    setPreview(URL.createObjectURL(candidate))
    setJob(null)
    setFrameCapture(null)
    setAnalysisArea(null)
  }

  const clearFile = () => {
    setFile(null)
    setPreview('')
    setJob(null)
    setAnalysisArea(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const updateConfiguration = (configuration) => setSite((current) => ({ ...current, configuration }))

  const onFrameCapture = (dataUrl, width, height) => {
    const capture = { dataUrl, width, height }
    setFrameCapture(capture)
    setSite((current) => current ? ({
      ...current,
      configuration: {
        ...current.configuration,
        reference_frame: capture,
      },
    }) : current)
  }

  const saveConfiguration = useCallback(async (configuration) => {
    const payload = configuration ?? siteRef.current.configuration
    const saved = await saveSiteConfiguration(siteRef.current.id, payload)
    setSite(saved)
    setSites((current) => current.map((item) => item.id === saved.id ? saved : item))
    return saved
  }, [])

  const analyze = useCallback(async (roi = analysisArea) => {
    const body = new FormData()
    body.append('site_id', site.id)
    body.append('video', file)
    if (roi?.length) body.append('roi', JSON.stringify(roi))
    setJob({ status: 'uploading', stage: 'upload', progress: 0, message: 'Subiendo video...' })
    try {
      const created = await createAnalysis(body)
      setJob({ id: created.id, status: 'queued', stage: 'upload', progress: 1, message: 'Video recibido' })
      navigate(`/analyses/${created.id}/procesando`)
    } catch (error) {
      setJob({ status: 'failed', stage: 'failed', progress: 100, message: error.message })
    }
  }, [analysisArea, file, navigate, site?.id])

  const loadAnalysis = useCallback(async (analysisId) => {
    const data = await getAnalysis(analysisId)
    setJob(data)
    return data
  }, [])

  const loadSite = useCallback(async (siteId) => {
    const data = await getSite(siteId)
    setSite(data)
    if (data.configuration?.reference_frame?.dataUrl) {
      setFrameCapture(data.configuration.reference_frame)
    }
    setSites((current) => current.map((item) => item.id === data.id ? data : item))
    if (retailers.length) {
      const owner = retailers.find((item) => item.id === data.retailer_id)
      if (owner) setRetailer(owner)
    }
    return data
  }, [retailers])

  const value = {
    retailers,
    retailer,
    sites,
    site,
    file,
    preview,
    job,
    mode,
    selectedId,
    frameCapture,
    analysisArea,
    inputRef,
    setRetailer,
    setSite,
    setSites,
    setJob,
    setMode,
    setSelectedId,
    setAnalysisArea,
    selectRetailer,
    createRetailer,
    deleteRetailer,
    selectSite,
    createSite,
    deleteSite,
    chooseFile,
    clearFile,
    updateConfiguration,
    saveConfiguration,
    onFrameCapture,
    analyze,
    goHome,
    loadAnalysis,
    loadSite,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export const useApp = () => useContext(AppContext)
