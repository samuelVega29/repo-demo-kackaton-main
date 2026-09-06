import { ArrowRight, FileVideo, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../context/AppProvider'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { isSiteConfigured } from '../utils/siteConfiguration'

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
  const nextPath = `/sedes/${siteId}/analisis/nuevo/siguiente`
  const nextLabel = configured ? 'Continuar a zona' : 'Continuar a calibracion'

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
    <SiteFlowPage step={uploadStep}>
      <section className="grid gap-5 lg:grid-cols-[1fr_330px]">
        <div className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] p-5">
          <span className="inline-flex items-center gap-2 text-sm font-black text-[#ff5b12]"><span className="text-[clamp(44px,6vw,70px)] leading-[.85] opacity-25">09</span> Nuevo analisis</span>
          <h2 className="mt-1 text-3xl font-black leading-none text-[#151323]">Nuevo analisis</h2>
          <p className="mt-2 text-sm font-semibold text-[#7d8392]">Selecciona la fuente y carga tu video real.</p>

          <button
            className={`mt-6 grid min-h-[240px] w-full place-items-center rounded-md border border-dashed p-8 text-center transition ${file ? 'border-[#ff5b12] bg-[#fff4ee]' : 'border-[#f5a782] bg-[#fffaf7] hover:border-[#ff5b12]'}`}
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

