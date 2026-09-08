import { ArrowDown, ArrowRight, FileText, FileVideo, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { isSiteConfigured } from '../utils/siteConfiguration'
import analisisRobot from '../assets/images/analisis_robot.png'


const uploadStep = {
  id: 'upload',
  number: '03',
  eyebrow: 'NUEVO ANALISIS',
  title: 'Sube tu',
  accent: 'video.',
}

const formatBytes = (bytes) => {
  if (!bytes) return ''
  const mb = bytes / 1048576
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return ''
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

export default function UploadPage() {
  const { file, preview, chooseFile, inputRef, site } = useApp()
  const { siteId } = useParams()
  const [metadata, setMetadata] = useState(null)
  const configured = isSiteConfigured(site)
  const calibrationLabel = site?.configuration?.camera?.calibration_status || 'lista'
  const nextPath = `/sedes/${siteId}/analisis/nuevo/siguiente`
  const nextLabel = 'Continuar a zona'

  useEffect(() => {
    if (!preview) {
      setMetadata(null)
      return undefined
    }
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = preview
    video.onloadedmetadata = () => {
      setMetadata({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }
    return () => { video.src = '' }
  }, [preview])

  return (
    <SiteFlowPage step={uploadStep} hideHeader>
      <div className="relative min-h-[520px]">
        
        <div className="pointer-events-none absolute left-[38%] top-[18px] hidden h-2.5 w-2.5 rounded-full bg-[#ff5b12]/55 shadow-[0_0_24px_8px_rgba(255,91,18,.25)] sm:block" />
        <div className="pointer-events-none absolute right-[15%] top-[160px] hidden h-3 w-3 rounded-full bg-[#ffb347]/70 shadow-[0_0_26px_9px_rgba(255,179,71,.28)] sm:block" />
        <div className="pointer-events-none absolute left-[52%] top-[128px] hidden grid-cols-3 gap-1.5 md:grid">
          {Array.from({ length: 9 }).map((_, index) => (
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff5b12]/20" key={index} />
          ))}
        </div>
        <section className="relative left-1/2 mb-8 min-h-[520px] w-[100dvw] -translate-x-1/2 overflow-hidden border-t-[8px] border-[#ff7a1a] bg-[linear-gradient(180deg,#02060b_0%,#030911_22%,#04101b_40%,#061728_62%,#061a2e_78%,#030d18_100%)] text-white sm:min-h-[clamp(390px,31vw,460px)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(54,144,196,.28),transparent_26%),radial-gradient(circle_at_18%_28%,rgba(47,122,184,.18),transparent_24%),radial-gradient(circle_at_46%_72%,rgba(255,122,26,.12),transparent_28%)]" />
          <div className="pointer-events-none absolute left-[14%] top-[24%] h-44 w-44 rounded-full bg-[#1e9bff]/12 blur-3xl" />
          <div className="pointer-events-none absolute right-[22%] top-[18%] h-52 w-52 rounded-full bg-[#62c7ff]/12 blur-3xl" />
          <div className="pointer-events-none absolute right-[7%] bottom-[18%] h-40 w-40 rounded-full bg-[#ff7a1a]/12 blur-3xl" />
          <div className="pointer-events-none absolute left-[18%] top-[30%] h-px w-[52vw] bg-[linear-gradient(90deg,transparent,rgba(98,199,255,.26),rgba(255,122,26,.16),transparent)]" />
          <div className="pointer-events-none absolute left-[8%] top-9 hidden grid-cols-4 gap-1.5 md:grid">
            {Array.from({ length: 12 }).map((_, index) => (
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5b12]/25" key={index} />
            ))}
          </div>
          <div className="pointer-events-none absolute right-[7%] top-8 hidden h-16 w-16 rounded-full border-[12px] border-[#ff5b12]/14 md:block" />
          <div className="pointer-events-none absolute right-[22%] top-[72px] hidden h-9 w-9 rotate-12 place-items-center rounded-lg bg-[#ff5b12]/10 text-[#ff5b12] shadow-[0_18px_40px_-24px_rgba(255,91,18,.9)] md:grid">
            <FileText size={17} />
          </div>
          <div className="pointer-events-none absolute left-[43%] top-[78px] hidden h-3 w-3 rounded-full bg-[#62c7ff] shadow-[0_0_22px_8px_rgba(98,199,255,.42)] sm:block" />
          <div className="pointer-events-none absolute left-[54%] top-10 hidden h-2 w-2 rounded-full bg-[#ff7a1a] shadow-[0_0_18px_7px_rgba(255,122,26,.35)] sm:block" />
          <div className="pointer-events-none absolute left-1/2 top-[68px] h-px w-[min(72vw,760px)] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(255,91,18,.28),transparent)] sm:top-[58px]" />
          <div className="pointer-events-none absolute -bottom-[92px] -left-[74px] h-[240px] w-[240px] rounded-full border-[20px] border-[#ff5b12] sm:-bottom-[128px] sm:-left-[104px] sm:h-[330px] sm:w-[330px] sm:border-[26px]" />
          <div className="relative z-10 mx-auto grid min-h-[520px] w-full max-w-[1180px] items-end gap-8 px-5 pb-[230px] pt-16 sm:min-h-[clamp(390px,31vw,460px)] sm:px-7 sm:pb-8 lg:grid-cols-[minmax(0,430px)_1fr] lg:px-8 lg:pb-10">
            <div className="max-w-[420px] pb-2">
              <span className="mb-3 flex items-center gap-3 text-sm font-black uppercase text-[#ff7a1a]">
                <span className="text-[clamp(54px,7vw,86px)] leading-[.8] text-[#ffcab9]">{uploadStep.number}</span>
                {uploadStep.eyebrow}
              </span>
              <h2 className="text-[clamp(38px,5vw,64px)] font-black leading-[.92] text-white">
                {uploadStep.title} <span className="text-[#ff7a1a]">{uploadStep.accent}</span>
              </h2>
              <p className="mt-3 text-sm font-medium leading-6 text-white/70">
                Selecciona la fuente y carga un video real de tu punto de venta para que Scapde, lo analice y genere insights de tus gondolas
              </p>
              <p className="mt-3 text-sm leading-6 text-white/60">{site?.city || 'Sede'} - {site?.name || 'Punto de venta'} - Calibracion: <b className="text-white">{calibrationLabel}</b></p>
              <button
                className="mt-7 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[#ff8a4d]/40 bg-[#ff5b12] px-5 text-sm font-black text-white shadow-[0_0_26px_rgba(255,91,18,.45),0_18px_42px_-24px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08]"
                onClick={() => document.getElementById('upload-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                type="button"
              >
                Sube tu video
                <ArrowDown size={18} strokeWidth={3} />
              </button>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-full w-full max-w-[1180px] -translate-x-1/2">
            <img
              className="absolute bottom-[-18px] right-[-88px] h-[54%] max-h-[300px] w-auto max-w-none select-none object-contain sm:right-0 sm:h-[92%] sm:max-h-[430px] lg:h-[108%] lg:max-h-[500px]"
              src={analisisRobot}
              alt=""
              aria-hidden="true"
            />
          </div>
        </section>

        <section id="upload-panel" className="relative z-10 scroll-mt-6 grid gap-5 px-5 pb-8 sm:px-7 lg:grid-cols-[1fr_330px] lg:px-8">
          <div className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
            <button
              className={`relative z-10 mt-6 grid min-h-[240px] w-full place-items-center rounded-md border border-dashed p-8 text-center transition ${file ? 'border-[#ff5b12] bg-[#fff4ee]' : 'border-[#f5a782] bg-[#fffaf7] hover:border-[#ff5b12]'}`}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <input ref={inputRef} type="file" accept="video/mp4,.mp4" hidden onChange={(event) => chooseFile(event.target.files[0])} />
              <span>
                <b className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-[#ff5b12] text-[#ff5b12]"><UploadCloud size={34} /></b>
                <strong className="block text-xl font-black text-[#151323]">{file ? file.name : 'Arrastra tu video aqui'}</strong>
                <small className="mt-2 block text-sm font-semibold text-[#7d8392]">{file ? 'Video listo para continuar' : 'o haz clic para seleccionar'}</small>
              </span>
            </button>
          </div>

          <aside className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
            <FileVideo className="mb-3 text-[#ff5b12]" size={32} />
            <h3 className="text-lg font-black text-[#151323]">Archivo seleccionado</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#7d8392]">
              {configured
                ? 'Esta sede ya tiene calibracion y gondolas guardadas. Puedes elegir toda la camara o una zona y analizar sin configurar otra vez.'
                : 'Esta sede necesita frame, vertices P1-P4 y gondolas para generar mapas de calor sobre el video.'}
            </p>
            {file ? (
              <div className="mt-5 grid gap-3">
                <Data label="Nombre" value={file.name} />
                <Data label="Tamano" value={formatBytes(file.size)} />
                <Data label="Formato" value={file.type || 'MP4'} />
                {metadata?.duration ? <Data label="Duracion" value={formatDuration(metadata.duration)} /> : null}
                {metadata?.width && metadata?.height ? <Data label="Resolucion" value={`${metadata.width} x ${metadata.height}`} /> : null}
                <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08] mt-4" to={nextPath}>{nextLabel} <ArrowRight size={16} /></Link>
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold leading-6 text-[#7d8392]">Cuando selecciones un video, SCAPDER mostrara sus datos reales aqui.</p>
            )}
          </aside>
        </section>
      </div>
    </SiteFlowPage>
  )
}

function Data({ label, value }) {
  return (
    <div className="rounded-md bg-[#f6f6f4] px-4 py-3">
      <span className="block text-[10px] font-black uppercase text-[#7d8392]">{label}</span>
      <b className="mt-1 block break-words text-sm text-[#151323]">{value}</b>
    </div>
  )
}
