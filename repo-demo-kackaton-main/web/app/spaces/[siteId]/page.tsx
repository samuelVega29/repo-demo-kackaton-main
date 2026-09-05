'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PageShell from '@/components/layout/PageShell'
import FlowStep from '@/components/layout/FlowStep'
import ProcessRail from '@/components/analysis/ProcessRail'
import CameraCalibration from '@/components/setup/CameraCalibration'
import VideoOverlay from '@/components/common/VideoOverlay'
import PlanogramEditor from '@/components/setup/PlanogramEditor'
import { PlanogramPreview3DClient } from '@/components/three/clients'
import { api } from '@/lib/api'

function VideoStep({ file, preview, chooseFile, inputRef }) {
  const ready = Boolean(file)
  return (
    <FlowStep index={0} title="Subí el video MP4 de la cámara" done={ready} active={!ready}>
      <p className="m-0 text-xs leading-5 text-muted">
        Cámara fija del pasillo completo. Este paso habilita los siguientes.
      </p>
      <span className="flex flex-col gap-1">
        {ready && (
          <span className="w-fit border border-mint/40 bg-mint/10 px-2 py-0.5 font-mono text-[10px] text-mint">
            ✓ listo
          </span>
        )}
        {!ready && (
          <span className="w-fit border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
            pendiente
          </span>
        )}
      </span>
      <div className="grid gap-3">
        <button
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-8 transition-colors ${
            file
              ? 'border-mint/50 bg-mint/5 hover:border-mint'
              : 'border-line hover:border-mint/40 hover:bg-panel2'
          }`}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,.mp4"
            hidden
            onChange={(event) => chooseFile(event.target.files[0])}
          />
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-acid text-xl text-acid">
            ＋
          </span>
          <strong className="text-sm text-ink">{file?.name || 'Seleccionar video MP4'}</strong>
          <small className="text-xs text-muted">
            {file ? `${(file.size / 1048576).toFixed(1)} MB · listo` : 'Desde tu computador o celular'}
          </small>
        </button>
        {preview && <video src={preview} controls playsInline className="w-full rounded-xl border border-line" />}
      </div>
    </FlowStep>
  )
}

function FrameCaptureFields({ preview, frameCapture, onCapture }) {
  const videoRef = useRef(null)
  const capture = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const width = video.videoWidth
    const height = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(video, 0, 0, width, height)
    onCapture(canvas.toDataURL('image/jpeg', 0.85), width, height)
  }
  return (
    <>
      {preview ? (
        <div className="flex flex-col gap-3">
          <video ref={videoRef} src={preview} controls muted playsInline className="w-full rounded-xl border border-line" />
          <div className="flex items-center gap-3">
            <button
              onClick={capture}
              className="w-fit border border-acid px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-acid transition-colors hover:bg-acid hover:text-base"
            >
              ＋ Capturar frame
            </button>
            {frameCapture && (
              <span className="font-mono text-xs text-mint">
                ✓ Frame capturado ({frameCapture.width}×{frameCapture.height})
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Subí el video en el paso 01 para habilitar la captura del frame.
        </div>
      )}
    </>
  )
}

function GondolaStep({ configuration, frameCapture, onChange, onSave }) {
  return (
    <FlowStep
      index={3}
      title="Cuadrá el video y dibujá tu planograma"
      active={!configuration.gondolas.length}
      done={configuration.gondolas.length > 0}
    >
      <p className="m-0 text-xs leading-5 text-muted">
        El planograma se proyecta en vivo sobre el frame capturado. Cada góndola que dibujés o movés
        se ve reflejada en el video y en el plano.
      </p>
      <span>
        {configuration.gondolas.length ? (
          <span className="w-fit border border-mint/40 bg-mint/10 px-2 py-0.5 font-mono text-[10px] text-mint">
            {configuration.gondolas.length} góndolas
          </span>
        ) : (
          <span className="w-fit border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
            sin góndolas
          </span>
        )}
      </span>
      <PlanogramEditor
        configuration={configuration}
        onChange={onChange}
        onSave={onSave}
        frameCapture={frameCapture}
      />
    </FlowStep>
  )
}

export default function SpacesPage() {
  const { siteId } = useParams()
  const router = useRouter()
  const [site, setSite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [job, setJob] = useState(null)
  const [frameCapture, setFrameCapture] = useState(null)
  const [showVerify, setShowVerify] = useState(false)
  const [showPreview3D, setShowPreview3D] = useState(false)
  const [showFrame, setShowFrame] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    api(`/api/sites/${siteId}`)
      .then(setSite)
      .catch((requestError) => setLoadError(requestError.message))
  }, [siteId])

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  useEffect(() => {
    if (!job?.id || ['completed', 'failed'].includes(job.status)) return
    const timer = window.setInterval(
      () =>
        api(`/api/analyses/${job.id}`)
          .then(setJob)
          .catch((error) => setJob((current) => ({ ...current, status: 'failed', message: error.message }))),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])

  useEffect(() => {
    if (job?.status === 'completed' && job?.result) {
      router.push(`/analyses/${job.id}`)
    }
  }, [job, router])

  if (loadError) {
    return (
      <PageShell>
        <p className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember">
          {loadError}
        </p>
      </PageShell>
    )
  }

  if (!site) {
    return (
      <PageShell>
        <p className="text-sm text-muted">Cargando sede…</p>
      </PageShell>
    )
  }

  const chooseFile = (candidate) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.mp4')) {
      setJob({ status: 'failed', stage: 'upload', progress: 0, message: 'Selecciona un archivo MP4' })
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(candidate)
    setPreview(URL.createObjectURL(candidate))
    setJob(null)
  }

  const updateConfiguration = (configuration) => setSite((current) => ({ ...current, configuration }))

  const stripOutline = (configurationValue) => ({
    ...configurationValue,
    floor: configurationValue.floor
      ? { ...configurationValue.floor, outline: undefined }
      : configurationValue.floor,
  })

  const saveConfiguration = async (configuration) => {
    const current = configuration ?? site?.configuration
    const payload = stripOutline(current)
    const saved = await api(`/api/sites/${site?.id}/configuration`, {
      method: 'PUT',
      body: JSON.stringify({ configuration: payload }),
    })
    const currentFloor = current.floor || {}
    if (currentFloor.outline) {
      setSite({
        ...saved,
        configuration: {
          ...saved.configuration,
          floor: { ...saved.configuration.floor, outline: currentFloor.outline },
        },
      })
    } else {
      setSite(saved)
    }
    return saved
  }

  const handleFrameCapture = (dataUrl, width, height) => setFrameCapture({ dataUrl, width, height })

  const analyze = async () => {
    const body = new FormData()
    body.append('site_id', site.id)
    body.append('video', file)
    setJob({ status: 'uploading', stage: 'upload', progress: 0, message: 'Guardando configuración espacial…' })
    try {
      await saveConfiguration()
      setJob({ status: 'uploading', stage: 'upload', progress: 0, message: 'Guardando MP4…' })
      const created = await api('/api/analyses', { method: 'POST', body })
      setJob({ id: created.id, status: 'queued', stage: 'upload', progress: 1, message: 'Video recibido' })
    } catch (error) {
      setJob({ status: 'failed', stage: 'failed', progress: 100, message: error.message })
    }
  }

  const running = job && !['completed', 'failed'].includes(job.status)
  const canAnalyze = Boolean(file)
  const calibrationLabel =
    site.configuration.camera.calibration_status === 'uncalibrated'
      ? 'sin calibrar'
      : site.configuration.camera.calibration_status

  return (
    <PageShell>
      <section className={`flex flex-col gap-7${running ? '' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="eyebrow">03 · NUEVO ANÁLISIS</span>
            <h1 className="mt-2 text-2xl font-bold md:text-3xl">
              Armá tu espacio <em className="not-italic text-mint">paso a paso.</em>
            </h1>
          </div>
          <p className="m-0 text-right text-xs leading-5 text-muted">
            {site.city} · {site.name}
            <br />
            Calibración: <b className="text-ink">{calibrationLabel}</b>
          </p>
        </div>

        {site.configuration.camera.calibration_status === 'uncalibrated' && (
          <div className="flex items-center gap-3 rounded-lg border border-ember/40 bg-ember/10 px-4 py-2.5 text-xs">
            <b className="text-ember">Cámara sin calibrar</b>
            <span className="text-muted">
              Cuadrá los 4 puntos (paso 03) para que la proyección de góndolas a metros sea correcta.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-6">
          <VideoStep file={file} preview={preview} chooseFile={chooseFile} inputRef={inputRef} />

          <FlowStep
            index={1}
            title="Capturá el frame del video"
            active={showFrame}
            done={Boolean(frameCapture)}
          >
            <p className="m-0 text-xs leading-5 text-muted">
              Se habilita al subir el video. Es la base para calibrar y cuadrar las góndolas.
            </p>
            <FrameCaptureFields preview={preview} frameCapture={frameCapture} onCapture={handleFrameCapture} />
          </FlowStep>

          <FlowStep
            index={2}
            title="Calibrá la perspectiva (P1–P4)"
            done={site.configuration.camera.calibration_status !== 'uncalibrated'}
          >
            <p className="m-0 text-xs leading-5 text-muted">
              El video va en el medio: arrastrá los 4 puntos a las esquinas del piso para alinear
              metros y góndolas.
            </p>
            <CameraCalibration
              preview={preview}
              externalCapture={frameCapture}
              configuration={site.configuration}
              onChange={updateConfiguration}
              onSave={saveConfiguration}
              onCapture={handleFrameCapture}
              onClose={() => {}}
            />
          </FlowStep>

          <GondolaStep
            configuration={site.configuration}
            frameCapture={frameCapture}
            onChange={updateConfiguration}
            onSave={saveConfiguration}
          />
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="eyebrow">VISTA 3D DEL PLANO</span>
              <h3 className="mt-1 text-sm font-semibold">Revisá el planograma en 3D</h3>
              <p className="m-0 text-xs text-muted">
                Visualizá el plano de la tienda, sus góndolas y productos antes de analizar.
              </p>
            </div>
            <button
              onClick={() => setShowPreview3D((value) => !value)}
              className="w-fit border border-line px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-mint transition-colors hover:border-mint"
            >
              {showPreview3D ? 'Ocultar modelo 3D' : 'Ver modelo 3D'} ▦
            </button>
          </div>
          {showPreview3D && <PlanogramPreview3DClient configuration={site.configuration} />}
        </section>

        {showVerify && (
          <VideoOverlay preview={preview} configuration={site.configuration} onClose={() => setShowVerify(false)} />
        )}

        <section className="flex flex-col gap-4 rounded-2xl border border-acid/20 bg-panel2 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="eyebrow">LISTO</span>
              <h2 className="mt-1 text-base font-semibold">Todo cuadrado, analizá el video</h2>
              <p className="m-0 text-xs leading-5 text-muted">
                Revisá la alineación si querés y corre el análisis. Los resultados aparecen justo
                abajo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowVerify((value) => !value)}
              className={`border px-3 py-2 font-mono text-xs transition-colors ${
                showVerify ? 'border-acid text-acid' : 'border-mint/50 text-mint hover:border-mint'
              }`}
            >
              ⌖ Verificar alineación
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              className="flex items-center gap-3 bg-acid px-6 py-3 text-sm font-bold text-base transition-colors hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canAnalyze || running}
              onClick={analyze}
            >
              {running ? 'Procesando…' : 'Analizar video'}
              <b>→</b>
            </button>
            {!canAnalyze && (
              <span className="text-xs text-muted">Subí el video en el paso 01 para habilitar el análisis.</span>
            )}
            {running && <span className="animate-pulse font-mono text-xs text-mint">{job.message}</span>}
          </div>
          {job && (
            <div
              className={`flex flex-col gap-2 ${job.status === 'failed' ? 'text-ember' : ''}`}
              aria-live="polite"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs">{job.message}</span>
                <b className="font-mono text-xs">{job.progress}%</b>
              </div>
              <progress value={job.progress} max="100" />
            </div>
          )}
          <ProcessRail stage={job?.stage} progress={job?.progress} running={running} />
        </section>
      </section>
    </PageShell>
  )
}