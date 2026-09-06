import { ArrowRight, Clock, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAnalyses } from '../services/analyses'

const formatDate = (value) => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''

export default function HistoryPage() {
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listAnalyses()
      .then((items) => { if (active) setAnalyses(items || []) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-[10px] border border-[#e5e7ee] bg-white/90 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
        <div className="flex h-[30px] items-center gap-1.5 border-b border-[#e5e7ee] bg-white/70 px-3"><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /><span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" /></div>
        <div className="relative min-h-[calc(100vh-128px)] bg-[radial-gradient(circle_at_92%_88%,rgba(255,91,18,.10),transparent_24%),#fff] p-5 sm:p-7 lg:p-8">
          <div className="relative z-10">
            <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">11</span> Historial</span>
                <h1 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[.92] text-[#151323]">Historial de analisis</h1>
                <p className="mt-2 text-sm leading-6 text-[#7d8392]">Consulta los videos procesados y sus resultados.</p>
              </div>
              <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12]" onClick={() => navigate('/inicio')} type="button">Volver a inicio</button>
            </div>

            {error && <p className="mb-5 rounded-md border border-[#ffd2c2] bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{error}</p>}
            {loading ? <p className="text-sm font-bold text-[#7d8392]">Cargando historial...</p> : analyses.length ? (
              <div className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] overflow-hidden">
                <div className="grid grid-cols-[1.1fr_.7fr_.55fr_.45fr] gap-3 border-b border-[#e5e7ee] bg-[#f8f8f7] px-4 py-3 text-xs font-black text-[#7d8392] max-[760px]:hidden">
                  <span>Archivo</span><span>Fecha</span><span>Estado</span><span>Acciones</span>
                </div>
                {analyses.map((analysis) => (
                  <button key={analysis.id} className="grid w-full gap-3 border-b border-[#e5e7ee] bg-white px-4 py-4 text-left transition last:border-b-0 hover:bg-[#fff8f4] md:grid-cols-[1.1fr_.7fr_.55fr_.45fr] md:items-center" onClick={() => navigate(`/analyses/${analysis.id}`)} type="button">
                    <span className="flex min-w-0 items-center gap-3">
                      <FileText className="shrink-0 text-[#ff5b12]" size={18} />
                      <b className="truncate text-sm text-[#151323]">{analysis.filename}</b>
                    </span>
                    <span className="flex items-center gap-2 text-xs font-bold text-[#7d8392]"><Clock size={14} /> {formatDate(analysis.created_at)}</span>
                    <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black ${analysis.status === 'completed' ? 'bg-[#eaf8ef] text-[#17803f]' : analysis.status === 'failed' ? 'bg-[#fff1eb] text-[#b43b1d]' : 'bg-[#eef5ff] text-[#2f7df6]'}`}>{analysis.status}</span>
                    <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]">Ver <ArrowRight size={15} /></span>
                  </button>
                ))}
              </div>
            ) : <p className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-6 text-sm font-semibold text-[#7d8392]">Todavia no hay analisis registrados.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

