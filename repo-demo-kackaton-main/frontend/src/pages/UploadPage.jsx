import { ArrowDown, ArrowRight, CheckCircle2, Eye, FileText, FileVideo, HelpCircle, Settings2, Store, UploadCloud, Wrench, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { artifactUrl, listAnalyses } from '../services/analyses'
import { calibrationStatusLabel, isMetricCalibrated, isSiteConfigured } from '../utils/siteConfiguration'
import analisisRobot from '../assets/images/analisis_robot.png'


const uploadStep = {
  id: 'upload',
  number: '03',
  eyebrow: 'NUEVO ANALISIS',
  title: 'Sube tu',
  accent: 'video.',
}

const MAX_VIDEO_DURATION_SECONDS = 120

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
  const { file, preview, chooseFile, clearFile, inputRef, site } = useApp()
  const { siteId } = useParams()
  const [searchParams] = useSearchParams()
  const [metadata, setMetadata] = useState(null)
  const [acceptedConfig, setAcceptedConfig] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [historyError, setHistoryError] = useState('')
  const configured = isSiteConfigured(site)
  const reconfiguringCamera = searchParams.get('reconfigurar') === 'camara'
  const metricCalibrated = isMetricCalibrated(site)
  const calibrationLabel = calibrationStatusLabel(site)
  const gondolaCount = site?.configuration?.gondolas?.length || 0
  const referenceFrame = site?.configuration?.reference_frame
  const latestFrameAnalysis = history.find((item) => item.result?.annotated_frames?.length)
  const latestFrame = latestFrameAnalysis?.result?.annotated_frames?.[0]
  const previewFrameSrc = referenceFrame?.dataUrl || (latestFrameAnalysis && latestFrame ? artifactUrl(latestFrameAnalysis.id, latestFrame) : '')
  const previewFrameCaption = referenceFrame?.dataUrl
    ? `Frame guardado de la calibracion${referenceFrame?.width && referenceFrame?.height ? ` (${referenceFrame.width} x ${referenceFrame.height})` : ''}`
    : latestFrame
      ? `Previsualizacion tomada de ${latestFrameAnalysis.filename || 'un analisis anterior'}`
      : 'Sin previsualizacion disponible'
  const mustReviewConfiguration = configured && !acceptedConfig && !reconfiguringCamera
  const nextPath = reconfiguringCamera ? `/sites/${siteId}/captura` : `/sedes/${siteId}/analisis/nuevo/siguiente`
  const nextLabel = reconfiguringCamera ? 'Capturar frame' : 'Continuar a zona'
  const videoTooLong = metadata?.duration > MAX_VIDEO_DURATION_SECONDS

  useEffect(() => {
    setAcceptedConfig(false)
  }, [site?.id])

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

  useEffect(() => {
    if (!siteId) return undefined
    let active = true
    listAnalyses({ site_id: siteId })
      .then((items) => { if (active) setHistory(items || []) })
      .catch((error) => { if (active) setHistoryError(error.message) })
    return () => { active = false }
  }, [siteId])

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
              <p className="mt-3 text-sm leading-6 text-white/60">{site?.city || 'Sede'} - {site?.name || 'Punto de venta'} - Estado: <b className="text-white">{calibrationLabel}</b></p>
              <div className="mt-5 grid gap-2 text-xs font-bold text-white/75 sm:grid-cols-3">
                <StatusPill icon={Settings2} active={configured || metricCalibrated} label={metricCalibrated ? 'Camara calibrada' : configured ? 'Modo rapido' : 'Config pendiente'} />
                <StatusPill icon={Store} active={gondolaCount > 0} label={`${gondolaCount} gondolas`} />
                <StatusPill icon={CheckCircle2} active={configured} label={configured ? 'Pipeline listo' : 'Config pendiente'} />
              </div>
              <div className="mt-5 grid gap-2 text-xs font-bold text-white/75 sm:grid-cols-3">
                <FlowHint number="1" label="Sube video" />
                <FlowHint number="2" label="Define area" />
                <FlowHint number="3" label="Guarda y analiza" />
              </div>
              <button
                className="mt-7 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-[#ff8a4d]/40 bg-[#ff5b12] px-5 text-sm font-black text-white shadow-[0_0_26px_rgba(255,91,18,.45),0_18px_42px_-24px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08]"
                onClick={() => document.getElementById('upload-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                type="button"
              >
                {reconfiguringCamera ? 'Subir video de referencia' : configured ? 'Revisar configuracion' : 'Sube tu video'}
                <ArrowDown size={18} strokeWidth={3} />
              </button>
              <button
                className="ml-0 mt-3 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 text-xs font-black text-white/85 transition hover:border-[#66d6ff]/50 hover:text-white sm:ml-3 sm:mt-7"
                onClick={() => setInstructionsOpen(true)}
                type="button"
              >
                <HelpCircle size={16} /> Instrucciones
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
          {mustReviewConfiguration && (
            <div className="relative overflow-hidden rounded-xl border border-[#ffd0ba] bg-[linear-gradient(135deg,#fffaf6_0%,#ffffff_46%,#eef6ff_100%)] p-3 shadow-[0_26px_86px_-54px_rgba(255,91,18,.82)] sm:p-5 lg:col-span-2">
              <div className="pointer-events-none absolute right-[-70px] top-[-72px] h-44 w-44 rounded-full bg-[#ff5b12]/12" />
              <div className="pointer-events-none absolute bottom-[-86px] left-[34%] h-44 w-44 rounded-full bg-[#1683ff]/10" />
              <div className="pointer-events-none absolute left-5 top-5 h-1.5 w-1.5 rounded-full bg-[#65c8ff] shadow-[58px_28px_0_#ff7a1a,128px_-6px_0_#65c8ff,248px_34px_0_#ffb45f]" />
              <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px]">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#fff1eb] px-3 py-1.5 text-[10px] font-black uppercase text-[#ff5b12]"><CheckCircle2 size={14} /> Configuracion guardada</span>
                  <h3 className="mt-3 max-w-[780px] text-[clamp(24px,5.8vw,38px)] font-black leading-tight text-[#07132c]">Revisa la configuracion de esta sede</h3>
                  <p className="mt-2 max-w-[760px] text-sm font-semibold leading-6 text-[#66758f]">
                    Esta sede ya tiene plano y gondolas guardadas. Verifica la previsualizacion; si coincide con la camara actual, acepta y sube el nuevo video sin repetir la configuracion.
                  </p>
                  <figure className="mt-5 overflow-hidden rounded-xl border border-[#12314b]/20 bg-[#071d25] shadow-[0_24px_60px_-42px_rgba(7,29,37,.95)]">
                    {previewFrameSrc ? (
                      <img src={previewFrameSrc} alt="Previsualizacion de la configuracion guardada" className="block aspect-video w-full object-cover" />
                    ) : (
                      <div className="grid aspect-video place-items-center px-6 text-center text-sm font-bold text-white/65">
                        No hay frame guardado para previsualizar. Reconfigura una vez la camara para guardar una imagen de referencia.
                      </div>
                    )}
                    <figcaption className="flex flex-col gap-1 border-t border-white/10 bg-[#041321] px-4 py-3 text-xs font-semibold text-white/70 sm:flex-row sm:items-center sm:justify-between">
                      <span>{previewFrameCaption}</span>
                      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#ff7a1a]/18 px-2.5 py-1 text-[10px] font-black uppercase text-[#ffd7c4]"><Eye size={12} /> Referencia</span>
                    </figcaption>
                  </figure>
                </div>

                <aside className="relative overflow-hidden rounded-xl border border-[#cde6ff] bg-[linear-gradient(180deg,#ffffff,#f8fbff_58%,#fff4ec)] p-4 shadow-[0_22px_58px_-46px_rgba(22,131,255,.86)] sm:p-5">
                  <div className="pointer-events-none absolute right-[-42px] top-[-42px] h-28 w-28 rounded-full bg-[#1683ff]/10" />
                  <div className="pointer-events-none absolute bottom-[-48px] left-[-48px] h-28 w-28 rounded-full bg-[#ff7a1a]/12" />
                  <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#17a964] text-white shadow-[0_18px_36px_-22px_rgba(23,169,100,.95)]"><CheckCircle2 size={28} /></span>
                  <h3 className="text-xl font-black text-[#07132c]">Pipeline listo</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#66758f]">Acepta esta configuracion para habilitar la carga del video.</p>
                  <div className="mt-4 grid gap-2">
                    <PipelineItem icon={Settings2} active={configured || metricCalibrated} label="Estado de la sede" value={calibrationLabel} />
                    <PipelineItem icon={Store} active={gondolaCount > 0} label="Gondolas" value={gondolaCount > 0 ? `${gondolaCount} guardadas` : 'Pendientes'} />
                    <PipelineItem icon={Eye} active={Boolean(previewFrameSrc)} label="Previsualizacion" value={previewFrameSrc ? 'Disponible' : 'Pendiente'} />
                  </div>
                  <button className="mt-5 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-[#ff5b12] px-4 text-[14px] font-black text-white shadow-[0_18px_40px_-24px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08]" onClick={() => setAcceptedConfig(true)} type="button">
                    <CheckCircle2 size={17} /> Usar esta configuracion
                  </button>
                  <Link className="mt-3 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg border border-[#ffb48f] bg-white px-4 text-[13px] font-black text-[#ff5b12] no-underline shadow-[0_14px_32px_-28px_rgba(255,91,18,.9)] transition hover:-translate-y-px hover:bg-[#fff7f2]" to={`/sites/${siteId}/captura`}>
                    <Wrench size={16} /> Reconfigurar camara
                  </Link>
                </aside>
              </div>
            </div>
          )}

          {!mustReviewConfiguration && (
          <div className="relative overflow-hidden rounded-xl border border-[#d6e4f1] bg-[linear-gradient(135deg,#ffffff,#f8fbff_68%,#fff7f2)] p-4 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] sm:p-5">
            <div className="pointer-events-none absolute right-[-48px] top-[-56px] h-32 w-32 rounded-full bg-[#1683ff]/10" />
            <div className="mb-4">
              <span className="text-xs font-black uppercase text-[#ff5b12]">Paso 1</span>
              <h3 className="mt-1 text-xl font-black text-[#151323]">{reconfiguringCamera ? 'Video de referencia para recalibrar' : 'Paso 1: video de la camara'}</h3>
              <p className="mt-1 text-sm font-semibold text-[#7d8392]">
                {reconfiguringCamera
                  ? `Sube un MP4 de maximo ${MAX_VIDEO_DURATION_SECONDS} segundos desde la camara actual. Con ese video capturas un nuevo frame y actualizas la calibracion.`
                  : `Usa un MP4 de maximo ${MAX_VIDEO_DURATION_SECONDS} segundos. En el siguiente paso eliges el area y confirmas las gondolas.`}
              </p>
            </div>
            <button
              className={`relative z-10 grid min-h-[210px] w-full place-items-center rounded-xl border border-dashed p-5 text-center transition sm:min-h-[240px] sm:p-8 ${file ? 'border-[#ff5b12] bg-[#fff4ee]' : 'border-[#f5a782] bg-[#fffaf7] hover:border-[#ff5b12]'}`}
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <input ref={inputRef} type="file" accept="video/mp4,.mp4" hidden onChange={(event) => chooseFile(event.target.files[0])} />
              <span>
                <b className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-[#ff5b12] text-[#ff5b12]"><UploadCloud size={34} /></b>
                <strong className="block text-xl font-black text-[#151323]">{file ? file.name : 'Arrastra tu video aqui'}</strong>
                <small className="mt-2 block text-sm font-semibold text-[#7d8392]">{file ? `Maximo ${MAX_VIDEO_DURATION_SECONDS} segundos` : 'o haz clic para seleccionar'}</small>
              </span>
            </button>
            {file ? (
              <button
                className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-[#ffd7c4] bg-white px-4 text-[13px] font-black text-[#b43b1d] transition hover:-translate-y-px hover:bg-[#fff1eb]"
                onClick={clearFile}
                type="button"
              >
                <X size={16} /> Quitar video seleccionado
              </button>
            ) : null}
          </div>
          )}

          {!mustReviewConfiguration && <aside className="relative overflow-hidden rounded-xl border border-[#d6e4f1] bg-[linear-gradient(180deg,#ffffff,#f8fbff_72%,#fff7f2)] p-4 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] sm:p-5">
            <div className="pointer-events-none absolute right-[-42px] top-[-42px] h-28 w-28 rounded-full bg-[#ff5b12]/10" />
            <FileVideo className="mb-3 text-[#ff5b12]" size={32} />
            <h3 className="text-lg font-black text-[#151323]">Siguiente: area y gondolas</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#7d8392]">
              {reconfiguringCamera
                ? 'Al continuar capturaras un frame nuevo. El plano guardado se mantiene para que solo ajustes lo necesario.'
                : configured
                ? 'Si la configuracion guardada coincide con esta camara, continua para revisar el area y analizar.'
                : 'Despues de subir el video, captura un frame claro y guarda las gondolas de esta sede.'}
            </p>
            <div className="mt-4 grid gap-2">
              <PipelineItem icon={Settings2} active={configured || metricCalibrated} label="Estado de la sede" value={calibrationLabel} />
              <PipelineItem icon={Store} active={gondolaCount > 0} label="Gondolas del plano" value={gondolaCount > 0 ? `${gondolaCount} guardadas` : 'Pendientes'} />
              <PipelineItem icon={UploadCloud} active={Boolean(file)} label="Video del analisis" value={file ? 'Listo para procesar' : 'Selecciona un MP4'} />
            </div>
            {file ? (
              <div className="mt-5 grid gap-3">
                <Data label="Nombre" value={file.name} />
                <Data label="Tamano" value={formatBytes(file.size)} />
                <Data label="Formato" value={file.type || 'MP4'} />
                {metadata?.duration ? <Data label="Duracion" value={formatDuration(metadata.duration)} /> : null}
                {metadata?.width && metadata?.height ? <Data label="Resolucion" value={`${metadata.width} x ${metadata.height}`} /> : null}
                {videoTooLong ? (
                  <p className="rounded-md bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">
                    El video supera el limite de {MAX_VIDEO_DURATION_SECONDS} segundos. Selecciona un MP4 mas corto.
                  </p>
                ) : null}
                <Link
                  aria-disabled={videoTooLong}
                  className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md px-4 text-[13px] font-black text-white no-underline transition mt-4 ${videoTooLong ? 'pointer-events-none cursor-not-allowed bg-[#d1d5db] opacity-60' : 'bg-[#ff5b12] hover:-translate-y-px hover:bg-[#e94d08]'}`}
                  to={videoTooLong ? '#' : nextPath}
                >
                  {nextLabel} <ArrowRight size={16} />
                </Link>
                <button
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] transition hover:-translate-y-px hover:border-[#ff5b12]"
                  onClick={clearFile}
                  type="button"
                >
                  <X size={16} /> Eliminar este video
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold leading-6 text-[#7d8392]">Cuando selecciones un video, SCAPDER mostrara sus datos reales aqui.</p>
            )}
          </aside>}
        </section>
        <section className="relative z-10 px-5 pb-10 sm:px-7 lg:px-8">
          <div className="relative overflow-hidden rounded-xl border border-[#ffc6aa] bg-[linear-gradient(135deg,#fff7f2,#ffffff_52%,#eef6ff)] p-4 shadow-[0_24px_74px_-48px_rgba(255,91,18,.7)] sm:p-5">
            <div className="pointer-events-none absolute right-[-44px] top-[-62px] h-36 w-36 rounded-full bg-[#ff5b12]/12" />
            <div className="pointer-events-none absolute left-[44%] bottom-[-70px] h-36 w-36 rounded-full bg-[#1f6feb]/10" />
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-black uppercase text-[#ff5b12]">Historial</span>
                <h3 className="mt-1 text-xl font-black text-[#151323]">Analisis anteriores de esta sede</h3>
              </div>
              <Link className="relative inline-flex min-h-[40px] items-center justify-center rounded-md border border-[#ffb48f] bg-white px-4 text-[13px] font-black text-[#ff5b12] no-underline shadow-[0_14px_32px_-28px_rgba(255,91,18,.9)] transition hover:-translate-y-px hover:bg-[#fff7f2]" to={`/sedes/${siteId}/historial`}>Ver historial completo</Link>
            </div>
            {historyError ? <p className="rounded-md bg-[#fff1eb] px-4 py-3 text-sm font-bold text-[#b43b1d]">{historyError}</p> : null}
            <div className="grid gap-2">
              {history.slice(0, 4).map((analysis) => (
                <Link className="relative grid gap-2 rounded-md border border-[#e5e7ee] bg-white/80 px-4 py-3 no-underline transition hover:border-[#ff5b12] sm:grid-cols-[1fr_auto_auto] sm:items-center" key={analysis.id} to={`/analyses/${analysis.id}`}>
                  <b className="truncate text-sm text-[#151323]">{analysis.filename}</b>
                  <span className="text-xs font-semibold text-[#7d8392]">{analysis.created_at ? new Date(analysis.created_at).toLocaleString('es-CO') : ''}</span>
                  <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-black ${analysis.status === 'completed' ? 'bg-[#eaf8ef] text-[#17803f]' : analysis.status === 'failed' ? 'bg-[#fff1eb] text-[#b43b1d]' : 'bg-[#eef5ff] text-[#2f7df6]'}`}>{analysis.status}</span>
                </Link>
              ))}
              {!history.length && !historyError ? <p className="relative rounded-md border border-dashed border-[#ffc6aa] bg-white/70 px-4 py-6 text-center text-sm font-semibold text-[#7d8392]">Todavia no hay analisis previos para esta sede.</p> : null}
            </div>
          </div>
        </section>
        {instructionsOpen && <InstructionsModal onClose={() => setInstructionsOpen(false)} configured={configured} />}
      </div>
    </SiteFlowPage>
  )
}

function InstructionsModal({ onClose, configured }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#02060b]/70 px-4 backdrop-blur-sm">
      <section className="w-full max-w-[560px] rounded-lg border border-[#d6e4f1] bg-white p-5 shadow-[0_30px_90px_rgba(0,0,0,.35)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-black uppercase text-[#ff5b12]">Ayuda rapida</span>
            <h2 className="mt-1 text-2xl font-black text-[#151323]">Como usar este pipeline</h2>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full border border-[#e5e7ee] bg-white text-[#151323]" onClick={onClose} type="button" aria-label="Cerrar instrucciones">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-3 text-sm font-semibold leading-6 text-[#64748b]">
          <p><b className="text-[#151323]">1. Sube el video.</b> Usa un MP4 de la camara fija de la sede.</p>
          <p><b className="text-[#151323]">2. Configura zonas.</b> Elige si vas a analizar toda la camara o solo un area del video.</p>
          <p><b className="text-[#151323]">3. Dibuja el planograma.</b> En la siguiente pantalla puedes marcar gondolas y guardar el plano antes de analizar.</p>
          {!configured && <p className="rounded-md border border-[#ffd7c4] bg-[#fff7f2] px-3 py-2 text-[#b43b1d]">Si la sede no tiene plano guardado, dibuja las gondolas en el paso de zonas antes de analizar.</p>}
        </div>
      </section>
    </div>
  )
}

function StatusPill({ icon: Icon, active, label }) {
  return (
    <span className={`inline-flex min-h-[34px] items-center gap-2 rounded-full border px-3 ${active ? 'border-[#66d6ff]/35 bg-[#0e2a3d]/70 text-white' : 'border-white/10 bg-white/5 text-white/55'}`}>
      <Icon size={15} />
      {label}
    </span>
  )
}

function FlowHint({ number, label }) {
  return (
    <span className="inline-flex min-h-[34px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3">
      <b className="grid h-5 w-5 place-items-center rounded-full bg-[#ff5b12] text-[11px] text-white">{number}</b>
      {label}
    </span>
  )
}

function PipelineItem({ icon: Icon, active, label, value }) {
  return (
    <div className={`relative flex items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 ${active ? 'border-[#bcefd6] bg-[linear-gradient(90deg,#effdf6,#ffffff)] shadow-[inset_4px_0_0_#17a964]' : 'border-[#e5e7ee] bg-[#f8fafc] shadow-[inset_4px_0_0_#94a3b8]'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${active ? 'bg-[#17a964] text-white shadow-[0_14px_28px_-20px_rgba(23,169,100,.9)]' : 'bg-white text-[#7d8392]'}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <b className="block text-xs font-black text-[#151323]">{label}</b>
        <small className="block text-xs font-semibold text-[#7d8392]">{value}</small>
      </span>
    </div>
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
