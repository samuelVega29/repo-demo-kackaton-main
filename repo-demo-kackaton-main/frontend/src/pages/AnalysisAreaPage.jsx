import { ArrowLeft, Crosshair, Play, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import SiteFlowPage from '../components/flow/SiteFlowPage'

const areaStep = {
  id: 'area',
  number: '04',
  eyebrow: 'AREA DE ANALISIS',
  title: 'Selecciona el',
  accent: 'espacio.',
}

export default function AnalysisAreaPage() {
  const { file, preview, analyze, job, analysisArea, setAnalysisArea } = useApp()
  const { siteId } = useParams()
  const videoRef = useRef(null)
  const [mode, setMode] = useState(analysisArea?.length ? 'zone' : 'all')
  const [points, setPoints] = useState(analysisArea || [])
  const running = job && !['completed', 'failed'].includes(job.status)

  useEffect(() => {
    setAnalysisArea(mode === 'zone' ? points : null)
  }, [mode, points, setAnalysisArea])

  if (!file || !preview) return <Navigate to={`/sedes/${siteId}/analisis/nuevo`} replace />

  const addPoint = (event) => {
    if (mode !== 'zone') return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    setPoints((current) => [...current, [Number(x.toFixed(4)), Number(y.toFixed(4))]])
  }

  const start = () => analyze(mode === 'zone' ? points : null)

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
            <video ref={videoRef} src={preview} muted playsInline className="block w-full" onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = 0.1 }} />
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
          {job?.status === 'failed' && <p className="mt-4 rounded-md bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{job.message}</p>}
          <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] mt-6 w-full disabled:cursor-not-allowed disabled:opacity-45" disabled={running || (mode === 'zone' && points.length < 4)} onClick={start} type="button">
            {running ? 'Iniciando...' : 'Analizar video'}
          </button>
          <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12] mt-3 w-full" to={`/sedes/${siteId}/analisis/nuevo`}><ArrowLeft size={16} /> Volver</Link>
        </aside>
      </section>
    </SiteFlowPage>
  )
}

