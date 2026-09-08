import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Crosshair, Play, Save, ScanLine, Store } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import PlanogramEditor from '../components/flow/PlanogramEditor'
import { forwardHomography, projectFloor } from '../utils/homography'

const areaStep = {
  id: 'area',
  number: '04',
  eyebrow: 'AREA Y GONDOLAS',
  title: 'Prepara el',
  accent: 'analisis.',
  desc: 'Primero define que parte del video se analiza. Luego ubica las gondolas sobre el frame y ejecuta el analisis.',
}

export default function AnalysisAreaPage() {
  const { file, preview, analyze, job, analysisArea, setAnalysisArea, site, frameCapture, updateConfiguration, saveConfiguration, onFrameCapture } = useApp()
  const { siteId } = useParams()
  const videoRef = useRef(null)
  const [tab, setTab] = useState('area')
  const [mode, setMode] = useState(analysisArea?.length ? 'zone' : 'all')
  const [points, setPoints] = useState(analysisArea || [])
  const [zoneSaved, setZoneSaved] = useState(false)
  const running = job && !['completed', 'failed'].includes(job.status)
  const hasGondolas = (site?.configuration?.gondolas || []).length > 0
  const areaReady = mode === 'all' || points.length >= 4
  const configReady = hasGondolas && areaReady
  const canAnalyze = !running && configReady

  useEffect(() => {
    setAnalysisArea(mode === 'zone' ? points : null)
  }, [mode, points, setAnalysisArea])

  useEffect(() => {
    setPoints([])
    setMode('all')
    setZoneSaved(false)
    setTab('area')
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
    setZoneSaved(false)
  }

  const captureFrame = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return false
    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(video, 0, 0, width, height)
    onFrameCapture(canvas.toDataURL('image/jpeg', 0.85), width, height)
    return true
  }

  const saveZone = async () => {
    if (mode !== 'zone' || points.length < 4) return false
    const forward = forwardHomography(site.configuration.camera)
    const meters = (points || [])
      .map(([nx, ny]) => (forward ? projectFloor(forward, nx, ny) : null))
      .filter(Boolean)
      .filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z))
      .map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100])
    if (meters.length < 3) return false
    const next = { ...site.configuration, floor: { ...site.configuration.floor, outline: meters } }
    updateConfiguration(next)
    try {
      await saveConfiguration(next)
      setZoneSaved(true)
      return true
    } catch {
      setZoneSaved(false)
      return false
    }
  }

  const clearZone = async () => {
    const next = { ...site.configuration, floor: { ...site.configuration.floor, outline: [] } }
    updateConfiguration(next)
    setZoneSaved(false)
    setPoints([])
    try {
      await saveConfiguration(next)
    } catch {
      setZoneSaved(false)
    }
  }

  const continueToGondolas = async () => {
    if (!areaReady) return
    if (mode === 'zone' && !zoneSaved) {
      const saved = await saveZone()
      if (!saved) return
    }
    captureFrame()
    setTab('gondolas')
  }

  const start = async () => {
    if (!canAnalyze) return
    try {
      await saveConfiguration(site.configuration)
    } catch {
      // El analisis usa la ultima configuracion disponible si el guardado falla.
    }
    analyze(mode === 'zone' ? points : null)
  }

  return (
    <SiteFlowPage step={areaStep}>
      <section className="rounded-lg border border-[#e5e7ee] bg-white p-4 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] sm:p-5">
        <div className="mb-5 grid gap-3 md:grid-cols-[1fr_320px]">
          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === 'area'} done={areaReady} icon={ScanLine} label="1. Area del video" onClick={() => setTab('area')} />
            <TabButton active={tab === 'gondolas'} done={hasGondolas} icon={Store} label="2. Gondolas" onClick={() => areaReady && setTab('gondolas')} disabled={!areaReady} />
          </div>
          <div className="rounded-md border border-[#e5e7ee] bg-[#f8fafc] px-4 py-3 text-sm font-semibold leading-6 text-[#64748b]">
            {tab === 'area'
              ? 'Marca el espacio que quieres medir. Si no marcas una zona, se analiza toda la camara.'
              : 'Ubica cada gondola sobre el frame. Esta geometria alimenta zonas calientes, permanencia, interacciones y pick-ups.'}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
          <div className={tab === 'area' ? 'block' : 'hidden'}>
            <AreaPanel
              addPoint={addPoint}
              mode={mode}
              points={points}
              preview={preview}
              setMode={setMode}
              videoRef={videoRef}
            />
          </div>

          <div className={tab === 'gondolas' ? 'block' : 'hidden'}>
            <GondolasPanel
              captureFrame={captureFrame}
              frameCapture={frameCapture}
              mode={mode}
              points={points}
              site={site}
              updateConfiguration={updateConfiguration}
              saveConfiguration={saveConfiguration}
            />
          </div>

          <aside className="rounded-lg border border-[#e5e7ee] bg-white p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
            <Play className="mb-3 text-[#ff5b12]" size={32} />
            <h3 className="text-lg font-black text-[#151323]">{tab === 'area' ? 'Paso 1: area' : 'Paso 2: gondolas'}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#7d8392]">
              {tab === 'area'
                ? 'Cuando el area este lista, continua para dibujar o revisar las gondolas.'
                : 'Cuando haya al menos una gondola guardada, puedes lanzar el analisis.'}
            </p>
            <div className="mt-4 grid gap-2">
              <ReadyItem icon={ScanLine} active={areaReady} label={mode === 'all' ? 'Toda la camara seleccionada' : `${points.length}/4 puntos del area`} />
              <ReadyItem icon={Save} active={mode === 'all' || zoneSaved} label={mode === 'all' ? 'Sin recorte adicional' : 'Zona guardada en el plano'} />
              <ReadyItem icon={Store} active={hasGondolas} label={hasGondolas ? `${site.configuration.gondolas.length} gondolas guardadas` : 'Falta dibujar gondolas'} />
            </div>

            {tab === 'area' && mode === 'zone' && points.length > 0 && (
              <button className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] transition hover:-translate-y-px hover:border-[#ff5b12]" onClick={() => { setPoints([]); setZoneSaved(false) }} type="button">
                Limpiar seleccion
              </button>
            )}
            {tab === 'area' && mode === 'zone' && points.length >= 4 && !zoneSaved && (
              <button className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#ff5b12] bg-[#fff4ee] px-4 text-[13px] font-black text-[#ff5b12] transition hover:-translate-y-px hover:bg-[#ffebe2]" onClick={saveZone} type="button">
                Guardar zona
              </button>
            )}
            {zoneSaved && tab === 'area' && <p className="mt-3 rounded-md bg-[#ecfdf3] px-4 py-3 text-sm font-bold text-[#177345]">Zona guardada. Ahora puedes pasar a gondolas.</p>}
            {site?.configuration?.floor?.outline?.length > 0 && tab === 'area' && (
              <button className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] transition hover:-translate-y-px hover:border-[#ff5b12]" onClick={clearZone} type="button">
                Quitar zona guardada
              </button>
            )}
            {job?.status === 'failed' && <p className="mt-4 rounded-md bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{job.message}</p>}
            {tab === 'gondolas' && !hasGondolas && <p className="mt-4 rounded-md bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">Para medir zonas calientes y pick-ups, guarda al menos una gondola.</p>}

            {tab === 'area' ? (
              <button className="mt-6 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white transition hover:-translate-y-px hover:bg-[#e94d08] disabled:cursor-not-allowed disabled:opacity-45" disabled={!areaReady} onClick={continueToGondolas} type="button">
                Continuar a gondolas <ArrowRight size={16} />
              </button>
            ) : (
              <button className="mt-6 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white transition hover:-translate-y-px hover:bg-[#e94d08] disabled:cursor-not-allowed disabled:opacity-45" disabled={!canAnalyze} onClick={start} type="button">
                {running ? 'Iniciando...' : 'Guardar y analizar'}
              </button>
            )}
            {tab === 'gondolas' && (
              <button className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] transition hover:-translate-y-px hover:border-[#ff5b12]" onClick={() => setTab('area')} type="button">
                <ArrowLeft size={16} /> Volver al area
              </button>
            )}
            <Link className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12]" to={`/sedes/${siteId}/analisis/nuevo`}>
              <ArrowLeft size={16} /> Cambiar video
            </Link>
          </aside>
        </div>
      </section>
    </SiteFlowPage>
  )
}

function AreaPanel({ addPoint, mode, points, preview, setMode, videoRef }) {
  return (
    <section>
      <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">04</span> Area de analisis</span>
      <h2 className="mt-1 text-3xl font-black leading-none text-[#151323]">Elige que parte del video se analiza</h2>
      <p className="mt-2 text-sm font-semibold text-[#7d8392]">Selecciona toda la camara o dibuja un poligono sobre el video. Usa minimo 4 puntos para cerrar una zona confiable.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button className={`rounded-md border p-4 text-left ${mode === 'all' ? 'border-[#ff5b12] bg-[#fff4ee]' : 'border-[#e5e7ee] bg-white'}`} onClick={() => setMode('all')} type="button">
          <ScanLine className="mb-2 text-[#ff5b12]" size={20} />
          <b className="block text-sm text-[#151323]">Toda la camara</b>
          <span className="mt-1 block text-xs font-semibold text-[#7d8392]">Mide todo lo que se vea en el frame.</span>
        </button>
        <button className={`rounded-md border p-4 text-left ${mode === 'zone' ? 'border-[#ff5b12] bg-[#fff4ee]' : 'border-[#e5e7ee] bg-white'}`} onClick={() => setMode('zone')} type="button">
          <Crosshair className="mb-2 text-[#ff5b12]" size={20} />
          <b className="block text-sm text-[#151323]">Seleccionar zona</b>
          <span className="mt-1 block text-xs font-semibold text-[#7d8392]">Haz clic sobre el video para marcar el area.</span>
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
    </section>
  )
}

function GondolasPanel({ captureFrame, frameCapture, mode, points, site, updateConfiguration, saveConfiguration }) {
  return (
    <section>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">05</span> Gondolas y trazabilidad</span>
          <h2 className="mt-1 text-3xl font-black leading-none text-[#151323]">Ubica las gondolas sobre el frame</h2>
          <p className="mt-2 text-sm font-semibold text-[#7d8392]">Anade, arrastra y ajusta cada gondola. Esta configuracion se reutiliza en futuros videos de la sede.</p>
        </div>
        <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#ff5b12] bg-white px-4 text-[13px] font-black text-[#ff5b12] transition hover:-translate-y-px hover:bg-[#fff4ee]" onClick={captureFrame} type="button">
          <Camera size={16} /> {frameCapture ? 'Recapturar frame' : 'Capturar frame'}
        </button>
      </div>
      <div className="mt-4 rounded-md border border-[#d6e4f1] bg-[#f8fafc] px-4 py-3 text-sm font-semibold leading-6 text-[#64748b]">
        Usa el boton “+ Anadir gondola”, colocalas encima de los muebles reales y presiona “Guardar plano”. Luego vuelve al boton final para analizar.
      </div>
      <div className="mt-5">
        <PlanogramEditor configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} frameCapture={frameCapture} zone={mode === 'zone' ? points : null} />
      </div>
    </section>
  )
}

function TabButton({ active, disabled, done, icon: Icon, label, onClick }) {
  return (
    <button className={`inline-flex min-h-[44px] items-center gap-2 rounded-md border px-4 text-sm font-black transition ${active ? 'border-[#ff5b12] bg-[#fff4ee] text-[#ff5b12]' : done ? 'border-[#c9f3df] bg-[#f0fff7] text-[#177345]' : 'border-[#e5e7ee] bg-white text-[#151323]'} disabled:cursor-not-allowed disabled:opacity-45`} disabled={disabled} onClick={onClick} type="button">
      {done ? <CheckCircle2 size={16} /> : <Icon size={16} />}
      {label}
    </button>
  )
}

function ReadyItem({ icon: Icon, active, label }) {
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${active ? 'border-[#c9f3df] bg-[#f0fff7]' : 'border-[#e5e7ee] bg-[#f8fafc]'}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${active ? 'bg-[#17a964] text-white' : 'bg-white text-[#7d8392]'}`}>
        {active ? <CheckCircle2 size={16} /> : <Icon size={16} />}
      </span>
      <b className="text-xs font-black text-[#151323]">{label}</b>
    </div>
  )
}
