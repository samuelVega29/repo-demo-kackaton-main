import { Play, ScanEye } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import ProcessRail from '../components/ProcessRail'
import VideoOverlay from '../components/VideoOverlay'
import FlowNav from '../components/flow/FlowNav'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { sessionSteps } from '../components/flow/sessionSteps'
import { useApp } from '../context/AppProvider'

export default function AnalyzePage() {
  const { site, preview, file, job, analyze } = useApp()
  const { siteId } = useParams()
  const [showVerify, setShowVerify] = useState(false)
  const step = sessionSteps[4]
  const running = job && !['completed', 'failed'].includes(job.status)
  const canAnalyze = Boolean(file)

  return (
    <SiteFlowPage step={step}>
      <section className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] mt-5 p-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#151323]">Configuracion lista</h2>
            <p className="mt-1 text-sm font-semibold text-[#7d8392]">El backend procesara el video con la calibracion P1-P4, gondolas y zonas de esta sede.</p>
          </div>
          <button type="button" onClick={() => setShowVerify((value) => !value)} className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12]">
            <ScanEye size={16} /> Verificar alineacion
          </button>
        </div>

        <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] w-full py-4 text-base disabled:cursor-not-allowed disabled:opacity-45" disabled={!canAnalyze || running} onClick={() => analyze()} type="button">
          <Play size={18} /> {running ? 'Procesando...' : 'Analizar video'}
        </button>
        {!canAnalyze && <span className="mt-3 block text-xs font-bold text-[#7d8392]">Sube el video en el paso inicial para habilitar el analisis.</span>}

        {job && (
          <div className={`mt-4 text-sm font-bold text-[#7d8392] ${job.status === 'failed' ? 'text-[#b43b1d]' : ''}`} aria-live="polite">
            <div className="mb-2 flex justify-between gap-4"><span>{job.message}</span><b>{job.progress}%</b></div>
            <progress value={job.progress} max="100" className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[#edf1f7] [&::-webkit-progress-value]:bg-[#ff5b12] [&::-moz-progress-bar]:bg-[#ff5b12]" />
          </div>
        )}
        <ProcessRail stage={job?.stage} progress={job?.progress} running={running} />
      </section>

      {showVerify && <VideoOverlay preview={preview} configuration={site.configuration} onClose={() => setShowVerify(false)} />}
      <FlowNav back={`/sites/${siteId}/planograma`} backLabel="Editar planograma" />
    </SiteFlowPage>
  )
}

