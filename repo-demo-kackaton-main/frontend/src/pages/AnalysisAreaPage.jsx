import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Crosshair, Flag, Map, Play, Plus, Save, ScanLine, Sparkles, Store } from 'lucide-react'
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
  eyebrow: 'AREA Y GONDOLAS',
  title: 'Prepara el',
  accent: 'analisis.',
  desc: 'Primero define que parte del video se analiza. Luego ubica las gondolas sobre el frame y ejecuta el analisis.',
}

const CONFIDENCE_CONFIG = {
  alta: { color: '#177345', score: 100 },
  media: { color: '#b26500', score: 60 },
  baja: { color: '#b43b1d', score: 25 },
}

function ConfidencePanel({ result }) {
  if (!result?.gondolas?.length) return null
  const gondolas = result.gondolas
  const scores = gondolas.map((g) => CONFIDENCE_CONFIG[g.confianza]?.score ?? 60)
  const globalScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)

  return (
    <div className="mt-4 rounded-lg border border-[#e5e7ee] bg-[#fff4ee] p-4">
      <span className="text-[10px] font-black uppercase tracking-widest text-[#ff5b12]">Sugerencia de IA aplicada</span>
      <h4 className="text-sm font-black text-[#151323]">Claude detecto {gondolas.length} gondolas (acierto global: {globalScore}%)</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {gondolas.map((g, i) => (
          <span key={`${g.name}-${i}`} className="inline-flex items-center gap-1 rounded border border-[#e5e7ee] bg-white px-2 py-1 text-xs font-bold text-[#151323]">
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
  const [tab, setTab] = useState('area')
  const [mode, setMode] = useState(analysisArea?.length ? 'zone' : 'all')
  const [points, setPoints] = useState(analysisArea || [])
  const [zoneSaved, setZoneSaved] = useState(false)
  const running = job && !['completed', 'failed'].includes(job.status)
  const hasGondolas = (site?.configuration?.gondolas || []).length > 0
  const areaReady = mode === 'all' || points.length >= 4
  const configReady = hasGondolas && areaReady
  const canAnalyze = !running && configReady
  const [layoutSuggesting, setLayoutSuggesting] = useState(false)
  const [layoutMessage, setLayoutMessage] = useState('')
  const [layoutResult, setLayoutResult] = useState(null)

  const suggestLayoutAutomatically = async () => {
    if (!file) {
      setLayoutMessage('Error: no se encontro un video cargado.')
      return
    }
    setLayoutSuggesting(true)
    setLayoutMessage('')
    setLayoutResult(null)
    try {
      const body = new FormData()
      body.append('video', file, file.name || 'video.mp4')
      const result = await api(`/api/sites/${siteId}/layout-suggestions`, { method: 'POST', body })
      const coloredGondolas = (result.gondolas || []).map((g) => ({
        ...g,
        color: CONFIDENCE_CONFIG[g.confianza]?.color ?? '#b26500',
      }))

      updateConfiguration({ ...site.configuration, gondolas: coloredGondolas })
      setLayoutResult({ ...result, gondolas: coloredGondolas })
      setLayoutMessage(`Listo: Claude sugirio ${coloredGondolas.length} gondolas.`)
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
    <SiteFlowPage step={areaStep} hideProgress>
      <section className="relative overflow-hidden rounded-xl border border-[#d6e4f1] bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_52%,#fff7f2_100%)] p-3 shadow-[0_28px_90px_-58px_rgba(22,131,255,.8)] sm:p-5">
        <div className="pointer-events-none absolute right-[-90px] top-[-110px] h-64 w-64 rounded-full bg-[#ff5b12]/10" />
        <div className="pointer-events-none absolute bottom-[-120px] left-[28%] h-64 w-64 rounded-full bg-[#1683ff]/10" />
        <div className="relative mb-5 grid gap-3 md:grid-cols-[1fr_360px]">
          <div className="grid gap-2 min-[520px]:grid-cols-2">
            <TabButton active={tab === 'area'} done={areaReady} icon={ScanLine} label="1. Area del video" onClick={() => setTab('area')} />
            <TabButton active={tab === 'gondolas'} done={hasGondolas} icon={Store} label="2. Gondolas" onClick={() => areaReady && setTab('gondolas')} disabled={!areaReady} />
          </div>
          <div className="rounded-xl border border-[#d6e4f1] bg-white/85 px-4 py-3 text-sm font-black leading-6 text-[#58708f] shadow-[0_18px_42px_-36px_rgba(22,131,255,.7)]">
            {tab === 'area'
              ? 'Marca el espacio que quieres medir. Si no marcas una zona, se analiza toda la camara.'
              : 'Ubica cada gondola sobre el frame. Esta geometria alimenta zonas calientes, permanencia, interacciones y pick-ups.'}
          </div>
        </div>

        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
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
              layoutSuggesting={layoutSuggesting}
              layoutMessage={layoutMessage}
              layoutResult={layoutResult}
              onSuggestLayout={suggestLayoutAutomatically}
            />
          </div>

          <aside className="relative overflow-hidden rounded-xl border border-[#ffd0ba] bg-[linear-gradient(180deg,#ffffff,#fffaf6_58%,#eef6ff)] p-4 shadow-[0_24px_70px_-50px_rgba(255,91,18,.75)] sm:p-5 lg:sticky lg:top-4 lg:self-start">
            <div className="pointer-events-none absolute right-[-44px] top-[-44px] h-32 w-32 rounded-full bg-[#ff5b12]/12" />
            <div className="pointer-events-none absolute bottom-[-52px] left-[-48px] h-32 w-32 rounded-full bg-[#1683ff]/10" />
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-[#ff5b12] text-white shadow-[0_18px_38px_-22px_rgba(255,91,18,.95)]"><Play size={26} /></span>
            <span className="text-[10px] font-black uppercase tracking-wide text-[#ff5b12]">Mision actual</span>
            <h3 className="mt-1 text-xl font-black text-[#07132c]">{tab === 'area' ? 'Paso 1: area' : 'Paso 2: gondolas'}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#66758f]">
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
            {tab === 'gondolas' && !hasGondolas && <p className="mt-4 rounded-lg border border-[#ffd7c4] bg-[#fff1eb] px-4 py-3 text-sm font-black leading-6 text-[#b43b1d]">Para medir zonas calientes y pick-ups, guarda al menos una gondola.</p>}

            {tab === 'area' ? (
              <button className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#ff5b12] px-4 text-[14px] font-black text-white shadow-[0_18px_40px_-24px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08] disabled:cursor-not-allowed disabled:opacity-45" disabled={!areaReady} onClick={continueToGondolas} type="button">
                Continuar a gondolas <ArrowRight size={16} />
              </button>
            ) : (
              <button className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#ff5b12] px-4 text-[14px] font-black text-white shadow-[0_18px_40px_-24px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08] disabled:cursor-not-allowed disabled:opacity-45" disabled={!canAnalyze} onClick={start} type="button">
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

function GondolasPanel({ captureFrame, frameCapture, layoutMessage, layoutResult, layoutSuggesting, mode, onSuggestLayout, points, site, updateConfiguration, saveConfiguration }) {
  return (
    <section>
      <div className="relative overflow-hidden rounded-xl border border-[#ffd0ba] bg-[linear-gradient(135deg,#fff7f2,#ffffff_54%,#eef6ff)] p-4 shadow-[0_22px_68px_-52px_rgba(255,91,18,.78)] md:flex md:items-start md:justify-between md:gap-4">
        <div className="pointer-events-none absolute right-[-56px] top-[-70px] h-40 w-40 rounded-full bg-[#ff5b12]/12" />
        <div className="pointer-events-none absolute left-[42%] bottom-[-70px] h-36 w-36 rounded-full bg-[#1683ff]/10" />
        <div>
          <span className="inline-flex items-center gap-3 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(46px,8vw,76px)] leading-[.85] text-[#ffd3c0]">05</span> Gondolas y trazabilidad</span>
          <h2 className="mt-1 max-w-[620px] text-[clamp(28px,6vw,44px)] font-black leading-[.95] text-[#07132c]">Ubica las gondolas sobre el frame</h2>
          <p className="mt-3 max-w-[680px] text-sm font-semibold leading-6 text-[#66758f]">Anade, arrastra y ajusta cada gondola como una pieza del mapa. Esta configuracion se reutiliza en futuros videos de la sede.</p>
        </div>
        <div className="relative mt-4 grid gap-2 sm:grid-cols-2 md:mt-0 md:min-w-[270px] md:grid-cols-1">
          <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-[#151323] px-4 text-[13px] font-black text-white shadow-[0_18px_38px_-24px_rgba(21,19,35,.95)] transition hover:-translate-y-px hover:bg-[#29263d] disabled:opacity-50" onClick={onSuggestLayout} disabled={layoutSuggesting} type="button">
            <Sparkles size={16} className="text-[#ff7a1a]" /> {layoutSuggesting ? 'Analizando...' : 'Sugerir gondolas con IA'}
          </button>
          <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-[#ffb48f] bg-white px-4 text-[13px] font-black text-[#ff5b12] shadow-[0_14px_32px_-28px_rgba(255,91,18,.9)] transition hover:-translate-y-px hover:bg-[#fff4ee]" onClick={captureFrame} type="button">
            <Camera size={16} /> {frameCapture ? 'Recapturar frame' : 'Capturar frame'}
          </button>
        </div>
      </div>
      {layoutMessage && <p className={`mt-3 text-xs font-bold ${layoutMessage.includes('Error') ? 'text-red-600' : 'text-[#177345]'}`}>{layoutMessage}</p>}
      {layoutResult && <ConfidencePanel result={layoutResult} />}
      <div className="mt-4 grid gap-3 rounded-xl border border-[#d6e4f1] bg-[linear-gradient(135deg,#ffffff,#f8fbff_58%,#fff4ee)] p-3 text-sm font-bold leading-6 text-[#58708f] shadow-[0_18px_42px_-36px_rgba(22,131,255,.7)] sm:grid-cols-3">
        <InstructionChip icon={Plus} label="Anade" text="Crea las gondolas que ves." />
        <InstructionChip icon={Map} label="Acomoda" text="Arrastralas sobre el mueble real." />
        <InstructionChip icon={Flag} label="Finaliza" text="Guarda y lanza el analisis." />
      </div>
      <div className="mt-5">
        <PlanogramEditor configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} frameCapture={frameCapture} zone={mode === 'zone' ? points : null} />
      </div>
    </section>
  )
}

function TabButton({ active, disabled, done, icon: Icon, label, onClick }) {
  return (
    <button className={`relative min-h-[86px] overflow-hidden rounded-xl border p-4 text-left transition hover:-translate-y-px ${active ? 'border-[#ff5b12] bg-[#fff4ee] text-[#ff5b12] shadow-[0_18px_38px_-28px_rgba(255,91,18,.9)]' : done ? 'border-[#c9f3df] bg-[#f0fff7] text-[#177345]' : 'border-[#e5e7ee] bg-white text-[#151323]'} disabled:cursor-not-allowed disabled:opacity-45`} disabled={disabled} onClick={onClick} type="button">
      <span className="pointer-events-none absolute right-[-18px] top-[-22px] h-16 w-16 rounded-full bg-current opacity-[.08]" />
      <span className="relative flex items-center gap-2 text-sm font-black">
        {done ? <CheckCircle2 size={17} /> : <Icon size={17} />}
        {label}
      </span>
    </button>
  )
}

function InstructionChip({ icon: Icon, label, text }) {
  return (
    <span className="group flex items-center gap-3 rounded-xl border border-[#d6e4f1] bg-white/90 px-3 py-2 shadow-[0_16px_36px_-30px_rgba(22,131,255,.95)] transition hover:-translate-y-0.5 hover:border-[#ffb48f] hover:shadow-[0_20px_44px_-30px_rgba(255,91,18,.65)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(145deg,#ffefe7_0%,#ff8a3d_44%,#ff5b12_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.65),inset_0_-8px_14px_rgba(150,42,0,.25),0_12px_22px_-14px_rgba(255,91,18,.95)] transition group-hover:scale-105"><Icon className="drop-shadow-[0_2px_2px_rgba(120,38,0,.35)]" size={17} /></span>
      <span>
        <b className="block text-xs font-black text-[#07132c]">{label}</b>
        <small className="block text-[11px] font-semibold leading-4 text-[#66758f]">{text}</small>
      </span>
    </span>
  )
}

function ReadyItem({ icon: Icon, active, label }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${active ? 'border-[#c9f3df] bg-[#f0fff7] shadow-[inset_4px_0_0_#17a964]' : 'border-[#e5e7ee] bg-[#f8fafc] shadow-[inset_4px_0_0_#cbd5e1]'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${active ? 'bg-[#17a964] text-white' : 'bg-white text-[#7d8392]'}`}>
        {active ? <CheckCircle2 size={16} /> : <Icon size={16} />}
      </span>
      <b className="text-xs font-black text-[#151323]">{label}</b>
    </div>
  )
}
