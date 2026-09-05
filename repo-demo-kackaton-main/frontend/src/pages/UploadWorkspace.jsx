import { useRef, useState } from 'react'
import ProcessRail from '../components/analysis/ProcessRail'
import PlanogramEditor from '../components/setup/PlanogramEditor'
import PlanogramPreview3D from '../components/setup/PlanogramPreview3D'
import CameraCalibration from '../components/setup/CameraCalibration'
import VideoOverlay from '../components/common/VideoOverlay'
import FlowStep from '../components/layout/FlowStep'

function VideoStep({ file, preview, chooseFile, inputRef, onNext }) {
  const ready = Boolean(file)
  return (
    <FlowStep number="01" eyebrow="VIDEO" title="Subí el video MP4 de la cámara" open desc="Cámara fija del pasillo completo. Este paso habilita los siguientes." badge={ready ? '✓ listo' : 'pendiente'} onToggle={() => {}}>
      <div className="flow-video">
        <button className={`drop-zone ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept="video/mp4,.mp4" hidden onChange={(event) => chooseFile(event.target.files[0])} /><span className="upload-icon">＋</span><strong>{file?.name || 'Seleccionar video MP4'}</strong><small>{file ? `${(file.size / 1048576).toFixed(1)} MB · listo` : 'Desde tu computador o celular'}</small></button>
        {preview && <video src={preview} controls playsInline />}
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
      {preview
        ? <div className="frame-capture"><video ref={videoRef} src={preview} controls muted playsInline /><div className="flow-body-actions"><button className="primary-button-inline" onClick={capture}>＋ Capturar frame</button>{frameCapture && <span className="frame-thumb-ok">✓ Frame capturado ({frameCapture.width}×{frameCapture.height})</span>}</div></div>
        : <div className="calib-empty">Subí el video en el paso 01 para habilitar la captura del frame.</div>}
    </>
  )
}

function GondolaStep({ configuration, frameCapture, onChange, onSave }) {
  return (
    <FlowStep number="04" eyebrow="GÓNDOLAS Y PLANO" title="Cuadrá el video y dibujá tu planograma" desc="El planograma se proyecta en vivo sobre el frame capturado. Cada góndola que dibujés o movés se ve reflejada en el video y en el plano." open badge={configuration.gondolas.length ? `${configuration.gondolas.length} góndolas` : 'sin góndolas'} onToggle={() => {}}>
      <div className="editor-full">
        <PlanogramEditor configuration={configuration} onChange={onChange} onSave={onSave} frameCapture={frameCapture} />
      </div>
    </FlowStep>
  )
}

export default function UploadWorkspace({ site, file, preview, chooseFile, inputRef, analyze, job, updateConfiguration, saveConfiguration, frameCapture, onFrameCapture }) {
  const running = job && !['completed', 'failed'].includes(job.status)
  const [showVerify, setShowVerify] = useState(false)
  const [showPreview3D, setShowPreview3D] = useState(false)
  const [showFrame, setShowFrame] = useState(false)
  const calibrationLabel = site.configuration.camera.calibration_status === 'uncalibrated' ? 'sin calibrar' : site.configuration.camera.calibration_status
  const canAnalyze = Boolean(file)
  return (
    <section className="upload-workspace flow-workspace">
      <div className="workspace-intro"><div><span className="eyebrow">03 · NUEVO ANÁLISIS</span><h1>Armá tu espacio<br /><em>paso a paso.</em></h1></div><p>{site.city} · {site.name}<br />Calibración: <b>{calibrationLabel}</b></p></div>
      {site.configuration.camera.calibration_status === 'uncalibrated' && <div className="calibration-warning"><b>Cámara sin calibrar</b><span>Cuadrá los 4 puntos (paso 03) para que la proyección de góndolas a metros sea correcta.</span></div>}
      <div className="flow-stack">
        <VideoStep file={file} preview={preview} chooseFile={chooseFile} inputRef={inputRef} />

        <FlowStep number="02" eyebrow="TOMAR FRAME" title="Capturá el frame del video" desc="Se habilita al subir el video. Es la base para calibrar y cuadrar las góndolas." open={showFrame} onToggle={() => setShowFrame((value) => !value)} badge={frameCapture ? '✓ capturado' : (showFrame ? '' : 'desplegable')}>
          <FrameCaptureFields preview={preview} frameCapture={frameCapture} onCapture={onFrameCapture} />
        </FlowStep>

        <FlowStep number="03" eyebrow="PUNTOS" title="Calibrá la perspectiva (P1–P4)" desc="El video va en el medio: arrastrá los 4 puntos a las esquinas del piso para alinear metros y góndolas." open badge={site.configuration.camera.calibration_status !== 'uncalibrated' ? 'calibrada' : 'pendiente'} onToggle={() => {}}>
          <div className="points-body"><CameraCalibration preview={preview} externalCapture={frameCapture} configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} onCapture={onFrameCapture} onClose={() => {}} /></div>
        </FlowStep>

        <GondolaStep configuration={site.configuration} frameCapture={frameCapture} onChange={updateConfiguration} onSave={saveConfiguration} />
      </div>

      <div className="step-section preview-3d-section preview-3d-compact">
        <div className="section-heading"><div><span className="eyebrow">VISTA 3D DEL PLANO</span><h3>Revisá el planograma en 3D</h3><p>Visualizá el plano de la tienda, sus góndolas y productos antes de analizar.</p></div><button className="primary-button-inline" onClick={() => setShowPreview3D((value) => !value)}>{showPreview3D ? 'Ocultar modelo 3D' : 'Ver modelo 3D'} ▦</button></div>
        {showPreview3D && <PlanogramPreview3D configuration={site.configuration} />}
      </div>

      {showVerify && <VideoOverlay preview={preview} configuration={site.configuration} onClose={() => setShowVerify(false)} />}

      <section className="flow-final">
        <div className="flow-final-head"><div><span className="eyebrow">LISTO</span><h2>Todo cuadrado, analizá el video</h2><p>Revisá la alineación si querés y corre el análisis. Los resultados aparecen justo abajo.</p></div><button type="button" onClick={() => setShowVerify((value) => !value)} className={showVerify ? 'active tool-chip' : 'tool-chip'}>⌖ Verificar alineación</button></div>
        <div className="flow-actions">
          <button className="primary-button big" disabled={!canAnalyze || running} onClick={analyze}>{running ? 'Procesando…' : 'Analizar video'}<b>→</b></button>
          {!canAnalyze && <span className="flow-hint">Subí el video en el paso 01 para habilitar el análisis.</span>}
        </div>
        {job && <div className={`job-progress ${job.status === 'failed' ? 'error' : ''}`} aria-live="polite"><div><span>{job.message}</span><b>{job.progress}%</b></div><progress value={job.progress} max="100" /></div>}
        <ProcessRail stage={job?.stage} progress={job?.progress} running={running} />
      </section>
    </section>
  )
}