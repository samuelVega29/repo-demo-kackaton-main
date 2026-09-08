import { ArrowLeft, Camera, Crosshair, Play, ScanLine, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import PlanogramEditor from '../components/flow/PlanogramEditor'
import { forwardHomography, projectFloor } from '../utils/homography'
import { api } from '../services/client'

const areaStep = {
  id: 'area',
  number: '04',
  eyebrow: 'AREA DE ANALISIS',
  title: 'Selecciona el',
  accent: 'espacio.',
}

const CONFIDENCE_CONFIG = {
  alta: { label: 'Alta', color: '#177345', score: 100 },
  media: { label: 'Media', color: '#b26500', score: 60 },
  baja: { label: 'Baja', color: '#b43b1d', score: 25 },
}

function ConfidencePanel({ result }) {
  if (!result?.gondolas?.length) return null
  const gondolas = result.gondolas
  const scores = gondolas.map((g) => CONFIDENCE_CONFIG[g.confianza]?.score ?? 60)
  const globalScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)

  return (
    <div className="mt-4 rounded-lg border border-[#e5e7ee] bg-[#fff4ee] p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#ff5b12]">Sugerencia de IA aplicada</span>
          <h4 className="text-sm font-black text-[#151323]">Claude detectó {gondolas.length} góndolas (Acierto global: {globalScore}%)</h4>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {gondolas.map((g, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-[#151323] border border-[#e5e7ee]">
            <span className="h-2 w-2 rounded-full" style={{ background: CONFIDENCE_CONFIG[g.confianza]?.color || '#ff5b12' }} />
            {g.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function AnalysisAreaPage() {
  const { file, preview, analyze, job, analysisArea, setAnalysisArea, site, frameCapture, updateConfiguration, saveConfiguration, onFrameCapture } = useApp()
  const { siteId } = useParams()
  const videoRef = useRef(null)
  const [mode, setMode] = useState(analysisArea?.length ? 'zone' : 'all')
  const [points, setPoints] = useState(analysisArea || [])
  const [zoneSaved, setZoneSaved] = useState(false)
  const running = job && !['completed', 'failed'].includes(job.status)

  // Estados para la IA de Góndolas
  const [layoutSuggesting, setLayoutSuggesting] = useState(false)
  const [layoutMessage, setLayoutMessage] = useState('')
  const [layoutResult, setLayoutResult] = useState(null)

  // Función para sugerir góndolas usando automáticamente el video que ya está cargado en el contexto
  const suggestLayoutAutomatically = async () => {
    if (!file) {
      setLayoutMessage('Error: No se encontró un video cargado.')
      return
    }
    setLayoutSuggesting(true)
    setLayoutMessage('')
    setLayoutResult(null)
    try {
      const body = new FormData()
      body.append('video', file, file.name || 'video.mp4')
      const result = await api(`/api/sites/${siteId}/layout-suggestions`, { method: 'POST', body })
      
      // Mapeamos los colores de la IA a cada góndola
      const coloredGondolas = result.gondolas.map((g) => ({
        ...g,
        color: CONFIDENCE_CONFIG[g.confianza]?.color ?? '#b26500' // Usa el color de la configuración o un default
      }))

      updateConfiguration({ ...site.configuration, gondolas: coloredGondolas })
      setLayoutResult(result)
      setLayoutMessage(`¡Éxito! Claude sugirió ${result.gondolas.length} góndolas.`)
    } catch (error) {
      setLayoutMessage(`Error: ${error.message}`)
    } finally {
      setLayoutSuggesting(false)
    }
  }

  useEffect(() => {
    setAnalysisArea(mode === 'zone' ? points : null)
  }, [mode, points, setAnalysisArea])

  useEffect(() => {
    setPoints([])
    setMode('all')
    setZoneSaved(false)
    if (site?.configuration?.floor?.outline?.length) {
      updateConfiguration({ ...site.configuration, floor: { ...site.configuration.floor, outline: [] } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  if (!file || !preview) return <Navigate to={`/sedes/${siteId}/analisis/nuevo`} replace />

  const addPoint = (event) => {
    if (mode !== 'zone') return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    setPoints((current) => [...current, [Number(x.toFixed(4)), Number(y.toFixed(4))]])
  }

  const captureFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(video, 0, 0, width, height)
    onFrameCapture(canvas.toDataURL('image/jpeg', 0.85), width, height)
  }

  const saveZone = async () => {
    if (mode !== 'zone' || points.length < 4) return
    const forward = forwardHomography(site.configuration.camera)
    const meters = (points || [])
      .map(([nx, ny]) => (forward ? projectFloor(forward, nx, ny) : null))
      .filter(Boolean)
      .filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z))
      .map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100])
    if (meters.length < 3) return
    const next = { ...site.configuration, floor: { ...site.configuration.floor, outline: meters } }
    updateConfiguration(next)
    try {
      await saveConfiguration(next)
      setZoneSaved(true)
    } catch {
      setZoneSaved(false)
    }
  }

  const clearZone = async () => {
    const next = { ...site.configuration, floor: { ...site.configuration.floor, outline: [] } }
    updateConfiguration(next)
    setZoneSaved(false)
    setPoints([])
    try {
      await saveConfiguration(next)
      setZoneSaved(false)
    } catch {
      setZoneSaved(false)
    }
  }

  const start = async () => {
    if (running || (mode === 'zone' && points.length < 4)) return
    try {
      await saveConfiguration(site.configuration)
    } catch {
      // Continuamos para no bloquear el análisis
    }
    analyze(mode === 'zone' ? points : null)
  }

  return (
    <SiteFlowPage step={areaStep}>
      <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
          <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">08</span> Configurar zonas</span>
          <h2 className="mt-1 text-3xl font-black leading-none text-[#151323]">Configurar zonas</h2>
          <p className="mt-2 text-sm font-semibold text-[#7d8392]">Define las zonas de analisis sobre el video.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button className={`rounded-md border p-4 text-left ${mode === 'all' ? 'border-[#ff5b12] bg-[#fff4ee]' : 'border-[#e5e7ee] bg-white'}`} onClick={() => setMode('all')} type="button">
              <ScanLine className="mb-2 text-[#ff5b12]" size={20} />
              <b className="block text-sm text-[#151323]">Toda la camara</b>
              <span className="mt-1 block text-xs font-semibold text-[#7d8392]">Analiza el espacio completo.</span>
            </button>
            <button className={`rounded-md border p-4 text-left ${mode === 'zone' ? 'border-[#ff5b12] bg-[#fff4ee]' : 'border-[#e5e7ee] bg-white'}`} onClick={() => setMode('zone')} type="button">
              <Crosshair className="mb-2 text-[#ff5b12]" size={20} />
              <b className="block text-sm text-[#151323]">Seleccionar zona</b>
              <span className="mt-1 block text-xs font-semibold text-[#7d8392]">Dibuja el area encima del video.</span>
            </button>
          </div>

          <div className="relative mt-6 overflow-hidden rounded-md bg-black">
            <video ref={videoRef} src={preview} muted controls playsInline className="block w-full" onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.1 }} />
            <svg className="absolute inset-0 h-full w-full cursor-crosshair" viewBox="0 0 1 1" preserveAspectRatio="none" onClick={addPoint}>
              {mode === 'zone' && points.length > 1 && <polyline points={points.map((point) => point.join(',')).join(' ')} fill="none" stroke="#ff5b12" strokeWidth="0.006" />}
              {mode === 'zone' && points.length >= 3 && <polygon points={points.map((point) => point.join(',')).join(' ')} fill="rgba(255,91,18,.22)" stroke="#ff5b12" strokeWidth="0.006" />}
              {mode === 'zone' && points.map((point, index) => <circle key={`${point[0]}-${point[1]}-${index}`} cx={point[0]} cy={point[1]} r="0.012" fill="#fff" stroke="#ff5b12" strokeWidth="0.006" />)}
            </svg>
          </div>
        </div>

        <aside className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
          <Play className="mb-3 text-[#ff5b12]" size={32} />
          <h3 className="text-lg font-black text-[#151323]">Listo para analizar</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#7d8392]">{mode === 'all' ? 'Se analizara toda la camara.' : `${points.length} punto${points.length === 1 ? '' : 's'} seleccionado${points.length === 1 ? '' : 's'}. Minimo 4.`}</p>
          {mode === 'zone' && points.length > 0 && <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12] mt-4" onClick={() => setPoints([])} type="button">Limpiar seleccion</button>}
          {mode === 'zone' && points.length >= 4 && <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#ff5b12] bg-[#fff4ee] px-4 text-[13px] font-black text-[#ff5b12] no-underline transition hover:-translate-y-px hover:bg-[#ffebe2] mt-3 w-full" onClick={saveZone} type="button">Guardar zona en el plano</button>}
          {zoneSaved && <p className="mt-3 rounded-md bg-[#ecfdf3] px-4 py-3 text-sm font-bold text-[#177345]">Zona guardada: se refleja en el frame y en el mapa del plano.</p>}
          {site?.configuration?.floor?.outline?.length > 0 && <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12] mt-3 w-full" onClick={clearZone} type="button">Quitar zona del plano</button>}
          {job?.status === 'failed' && <p className="mt-4 rounded-md bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{job.message}</p>}
          <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] mt-6 w-full disabled:cursor-not-allowed disabled:opacity-45" disabled={running || (mode === 'zone' && points.length < 4)} onClick={start} type="button">
            {running ? 'Iniciando...' : 'Analizar video'}
          </button>
          <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12] mt-3 w-full" to={`/sedes/${siteId}/analisis/nuevo`}><ArrowLeft size={16} /> Volver</Link>
        </aside>
      </section>

      {/* SECCIÓN DE GÓNDOLAS Y PLANO: BOTONES COMPACTOS Y ALINEADOS A LA DERECHA */}
      <section className="mt-5 rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">04</span> Gondolas y plano</span>
            <h2 className="mt-1 text-3xl font-black leading-none text-[#151323]">Dibuja las gondolas</h2>
            <p className="mt-2 text-sm font-semibold text-[#7d8392]">Crea y calibra las gondolas sobre el mapa; la proyeccion se ve en vivo sobre el frame del video.</p>
          </div>
          
          {/* Contenedor alineado a la derecha con botones más compactos */}
          <div className="flex flex-col items-end gap-1 md:ml-auto">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button 
                className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-md bg-[#151323] px-3 text-xs font-black text-white transition hover:bg-[#29263d] disabled:opacity-50" 
                onClick={suggestLayoutAutomatically} 
                disabled={layoutSuggesting}
                type="button"
              >
                <Sparkles size={14} className="text-[#ff5b12]" /> 
                {layoutSuggesting ? 'Analizando...' : 'Sugerir góndolas con IA'}
              </button>

              <button 
                className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-md border border-[#ff5b12] bg-white px-3 text-xs font-black text-[#ff5b12] transition hover:bg-[#fff4ee]" 
                onClick={captureFrame} 
                type="button"
              >
                <Camera size={14} /> {frameCapture ? 'Recapturar frame' : 'Capturar frame'}
              </button>
          </div>
          <span className="text-[10px] font-semibold text-[#7d8392]">
              <b className="text-[#ff5b12]">Opcional:</b> Tarda ~4 min. Puedes saltarlo y dibujar a mano.
            </span>
        </div>
        </div>

        {layoutMessage && (
          <p className={`mt-3 text-xs font-bold ${layoutMessage.includes('Error') ? 'text-red-600' : 'text-[#177345]'}`}>
            {layoutMessage}
          </p>
        )}

        {layoutResult && <ConfidencePanel result={layoutResult} />}

        <div className="mt-5">
          <PlanogramEditor configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} frameCapture={frameCapture} zone={mode === 'zone' ? points : null} />
        </div>
      </section>
    </SiteFlowPage>
  )
}