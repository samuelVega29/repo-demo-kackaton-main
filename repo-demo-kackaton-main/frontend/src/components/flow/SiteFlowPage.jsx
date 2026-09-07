import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppProvider'

const BrowserDots = () => (
  <div className="flex h-[30px] items-center gap-1.5 border-b border-[#e5e7ee] bg-white/70 px-3">
    <span className="h-[7px] w-[7px] rounded-full bg-[#ff5f57]" />
    <span className="h-[7px] w-[7px] rounded-full bg-[#ffbd2e]" />
    <span className="h-[7px] w-[7px] rounded-full bg-[#28c840]" />
  </div>
)

export default function SiteFlowPage({ step, children }) {
  const { site, job, loadSite } = useApp()
  const { siteId } = useParams()
  const [loading, setLoading] = useState(Boolean(siteId && (!site || String(site.id) !== String(siteId))))

  useEffect(() => {
    if (!siteId) {
      setLoading(false)
      return
    }
    if (site && String(site.id) === String(siteId)) {
      setLoading(false)
      return
    }
    setLoading(true)
    loadSite(siteId).catch(() => {}).finally(() => setLoading(false))
  }, [site, siteId, loadSite])

  if (job?.result) return <Navigate to={`/analyses/${job.id}`} replace />
  if (loading) return <section className="grid min-h-[calc(100vh-72px)] place-items-center bg-[#f6f6f4] p-6 text-sm font-black text-[#7d8392]">Cargando sede</section>
  if (!site) return <Navigate to="/" replace />

  const uncalibrated = site.configuration?.camera?.calibration_status === 'uncalibrated'
  const calibrationLabel = uncalibrated ? 'sin calibrar' : site.configuration?.camera?.calibration_status || 'lista'

  return (
    <section className="min-h-[calc(100vh-72px)] bg-[radial-gradient(circle_at_96%_10%,rgba(255,91,18,.10),transparent_25%),linear-gradient(135deg,rgba(255,255,255,.92),rgba(246,246,244,.96))] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1180px] overflow-hidden rounded-[10px] border border-[#e5e7ee] bg-white/90 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
        <BrowserDots />
        <div className="relative min-h-[calc(100vh-128px)] bg-[radial-gradient(circle_at_92%_88%,rgba(255,91,18,.10),transparent_24%),#fff] p-5 sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute bottom-0 right-0 h-[min(260px,35vw)] w-[min(260px,35vw)] rounded-br-[10px] border-b-8 border-r-8 border-[#ff5b12]/90" />
          <div className="relative z-10">
            <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">{step.number}</span> {step.eyebrow}</span>
                <h1 className="m-0 text-[clamp(28px,4vw,44px)] font-black leading-[.92] text-[#151323]">{step.title} <span className="text-[#ff5b12]">{step.accent}</span></h1>
                <p className="mt-2 text-sm leading-6 text-[#7d8392]">{site.city} · {site.name} · Calibracion: <b className="text-[#151323]">{calibrationLabel}</b></p>
              </div>
            </div>
            {uncalibrated && (
              <div className="mb-5 rounded-md border border-[#ffd2c2] bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">
                Camara sin calibrar. Ajusta la configuracion cuando necesites mediciones exactas.
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
