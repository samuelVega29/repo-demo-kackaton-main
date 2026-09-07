import { useEffect, useRef, useState } from 'react'
import { retailApi } from '../services/retailApi'

export default function useRetailWorkspace(user, logout) {
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

  useEffect(() => {
    if (!user) return
    retailApi.getRetailers().then(setRetailers).catch(() => logout())
  }, [logout, user])

  useEffect(() => {
    if (!retailer) return
    retailApi.getSites(retailer.id).then(setSites)
  }, [retailer])

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  useEffect(() => {
    if (!job?.id || ['completed', 'failed'].includes(job.status)) return
    const timer = window.setInterval(() => {
      retailApi.getAnalysis(job.id).then(setJob).catch((error) => {
        setJob((current) => ({ ...current, status: 'failed', message: error.message }))
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  const chooseFile = (candidate) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.mp4')) {
      setJob({ status: 'failed', stage: 'upload', progress: 0, message: 'Selecciona un archivo MP4' })
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(candidate)
    setPreview(URL.createObjectURL(candidate))
    setJob(null)
  }

  const updateConfiguration = (configuration) => setSite((current) => ({ ...current, configuration }))
  const handleFrameCapture = (dataUrl, width, height) => setFrameCapture({ dataUrl, width, height })

  const saveConfiguration = async (configuration) => {
    const payload = configuration ?? siteRef.current.configuration
    const saved = await retailApi.saveSiteConfiguration(siteRef.current.id, payload)
    setSite(saved)
    return saved
  }

  const analyze = async () => {
    const body = new FormData()
    body.append('site_id', site.id)
    body.append('video', file)
    setJob({ status: 'uploading', stage: 'upload', progress: 0, message: 'Guardando configuracion espacial...' })
    try {
      await saveConfiguration()
      setJob({ status: 'uploading', stage: 'upload', progress: 0, message: 'Guardando MP4...' })
      const created = await retailApi.createAnalysis(body)
      setJob({ id: created.id, status: 'queued', stage: 'upload', progress: 1, message: 'Video recibido' })
    } catch (error) {
      setJob({ status: 'failed', stage: 'failed', progress: 100, message: error.message })
    }
  }

  const goHome = () => {
    setRetailer(null)
    setSite(null)
    setJob(null)
    setFile(null)
    setSelectedId(null)
    setFrameCapture(null)
  }

  const createSite = async (values) => {
    const created = await retailApi.createSite(retailer.id, values)
    setSites((current) => [...current, created])
    setSite(created)
  }

  const suggestGondolas = async (capture) => {
    if (!capture?.dataUrl || !capture.width || !capture.height) {
      throw new Error('Captura primero un frame en Calibrar camara')
    }
    const response = await retailApi.suggestGondolas(siteRef.current.id, {
      configuration: siteRef.current.configuration,
      image: capture.dataUrl,
      image_width: capture.width,
      image_height: capture.height,
    })
    return response.candidates
  }

  return {
    retailers,
    retailer,
    setRetailer,
    sites,
    site,
    setSite,
    file,
    preview,
    job,
    mode,
    setMode,
    selectedId,
    setSelectedId,
    frameCapture,
    inputRef,
    chooseFile,
    analyze,
    updateConfiguration,
    saveConfiguration,
    handleFrameCapture,
    goHome,
    createSite,
    suggestGondolas,
  }
}
