import { Check, Circle, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import { getAnalysis, getAnalysisStatus } from '../services/analyses'
import peopleRobot from '../assets/images/team-robot.png'

const steps = [
  ['upload', 'Carga del video'],
  ['detect', 'Deteccion de personas'],
  ['tracking', 'Analisis de trayectoria'],
  ['dwell', 'Tiempo de permanencia'],
  ['heatmaps', 'Generacion del mapa'],
  ['interactions', 'Interacciones detectadas'],
  ['recommendations', 'Recomendaciones finales'],
]

const stageIndex = (stage) => Math.max(0, steps.findIndex(([key]) => key === stage))

export default function ProcessingPage() {
  const { analysisId } = useParams()
  const navigate = useNavigate()
  const { setJob } = useApp()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!analysisId) return undefined
    let stopped = false
    const tick = async () => {
      try {
        const data = await getAnalysisStatus(analysisId)
        if (stopped) return
        setStatus(data)
        if (data.status === 'completed') {
          const detail = await getAnalysis(analysisId)
          if (stopped) return
          setJob(detail)
          navigate(`/analyses/${analysisId}`, { replace: true })
        }
        if (data.status === 'failed') setError(data.message || 'No fue posible completar el analisis.')
      } catch (requestError) {
        if (!stopped) setError(requestError.message)
      }
    }
    tick()
    const timer = window.setInterval(tick, 1200)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [analysisId, navigate, setJob])

  const current = stageIndex(status?.stage)
  const progress = status?.progress ?? 0

  return (
    <section className="grid min-h-[calc(100vh-72px)] place-items-center bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[940px] overflow-hidden rounded-[10px] border border-[#e5e7ee] bg-white/90 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
        <div className="flex h-[30px] items-center gap-1.5 border-b border-[#e5e7ee] bg-white/70 px-3"><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /></div>
        <div className="relative min-h-[560px] bg-[radial-gradient(circle_at_92%_88%,rgba(255,91,18,.10),transparent_24%),#fff] p-5 sm:p-7 lg:p-8">
          <div className="relative z-10 grid items-center gap-8 md:grid-cols-[260px_1fr]">
            <div className="relative hidden md:block">
              <img src={peopleRobot} alt="" className="relative z-10 h-[360px] w-full object-contain object-bottom" />
            </div>
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">10</span> Procesamiento</span>
              <h1 className="mt-1 text-3xl font-black leading-none text-[#151323]">Procesando tu analisis de video</h1>
              <p className="mt-3 text-sm font-semibold text-[#7d8392]">{status?.message || 'Preparando el analisis real del backend.'}</p>

              <div className="my-7 flex items-center gap-6">
                <div className="grid h-32 w-32 place-items-center rounded-full border-[12px] border-[#ff5b12] bg-white text-3xl font-black text-[#151323] shadow-[0_18px_50px_-35px_rgba(255,91,18,.9)]">{progress}%</div>
                <Loader2 className="animate-spin text-[#ff5b12]" size={32} />
              </div>

              <div className="grid gap-2">
                {steps.map(([key, label], index) => {
                  const done = index < current || status?.status === 'completed'
                  const active = index === current && !error
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-md bg-[#f6f6f4] px-4 py-3">
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${done ? 'bg-[#13a563] text-white' : active ? 'bg-[#ff5b12] text-white' : 'border border-[#d8dbe3] text-[#7d8392]'}`}>
                        {done ? <Check size={14} /> : <Circle size={10} fill={active ? 'currentColor' : 'none'} />}
                      </span>
                      <span className="text-sm font-bold text-[#151323]">{label}</span>
                    </div>
                  )
                })}
              </div>

              {error && (
                <div className="mt-6 rounded-md border border-[#ffd2c2] bg-[#fff1eb] p-4">
                  <p className="text-sm font-bold text-[#b43b1d]">{error}</p>
                  <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#111827] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px mt-3" to="/empresas">Volver a empresas</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

