import { useState } from 'react'
import CameraCalibration from '../components/flow/CameraCalibration'
import PlanogramEditor from '../components/flow/PlanogramEditor'
import PlanogramPreview3D from '../components/flow/PlanogramPreview3D'
import ProcessRail from '../components/ProcessRail'
import VideoOverlay from '../components/VideoOverlay'
import PageIntro from '../components/ui/PageIntro'
import PageShell from '../components/ui/PageShell'

export default function UploadPage({ site, file, preview, chooseFile, inputRef, analyze, job, updateConfiguration, saveConfiguration, frameCapture, onFrameCapture, onSuggestGondolas }) {
  const [showCalibration, setShowCalibration] = useState(false)
  const [showVerify, setShowVerify] = useState(false)
  const [showPreview3D, setShowPreview3D] = useState(false)
  const running = job && !['completed', 'failed'].includes(job.status)
  const calibrationLabel = site.configuration.camera.calibration_status === 'uncalibrated' ? 'sin calibrar' : site.configuration.camera.calibration_status
  const steps = [
    ['Video', 'Selecciona el MP4'],
    ['Calibrar y capturar', 'Alinea el piso'],
    ['Dibujar gondolas', 'Define el plano'],
    ['Ver modelo 3D', 'Vista previa'],
    ['Analizar', 'Corre el analisis'],
  ]
  const currentStep = file ? (frameCapture ? 3 : 2) : 1
  const stepState = (index) => index < currentStep ? 'border-lime-300 text-lime-300' : index === currentStep ? 'border-teal-300 text-white' : 'border-white/10 text-slate-500'

  return (
    <PageShell wide>
      <PageIntro
        eyebrow="03 / NUEVO ANALISIS"
        title="Observa el espacio"
        highlight="en movimiento."
        aside={<p className="text-left text-sm leading-7 text-slate-400 lg:text-right">{site.city} / {site.name}<br />Calibracion: <b className="text-lime-300">{calibrationLabel}</b></p>}
      />

      <div className="my-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map(([label, help], index) => (
          <div className={`border p-4 ${stepState(index)}`} key={label}>
            <span className="font-mono text-xs">{index + 1}</span>
            <strong className="mt-3 block text-sm">{label}</strong>
            <small className="text-xs text-slate-500">{help}</small>
          </div>
        ))}
      </div>

      <section className="grid gap-5 border border-white/10 bg-[#0c1714] p-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="relative min-h-72 overflow-hidden bg-black">
          {preview ? <video className="h-full w-full object-contain" src={preview} controls playsInline /> : <div className="grid h-full min-h-72 place-items-center text-center text-slate-500"><span>CAMERA FEED<br /><small>La vista previa aparecera aqui</small></span></div>}
        </div>
        <div className="flex flex-col gap-4">
          <button className="grid min-h-48 place-items-center border border-dashed border-teal-300/40 bg-teal-300/5 p-6 text-center" onClick={() => inputRef.current?.click()} type="button">
            <input ref={inputRef} type="file" accept="video/mp4,.mp4" hidden onChange={(event) => chooseFile(event.target.files[0])} />
            <span><strong className="block text-lg text-white">{file?.name || 'Seleccionar video MP4'}</strong><small className="mt-2 block text-slate-400">{file ? `${(file.size / 1048576).toFixed(1)} MB / listo` : 'Desde tu computador o celular'}</small></span>
          </button>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <span className="border border-white/10 p-3"><b className="block text-lime-300">{site.configuration.floor.width}x{site.configuration.floor.depth}m</b>Piso</span>
            <span className="border border-white/10 p-3"><b className="block text-lime-300">{site.configuration.zones.length}</b>Zonas</span>
            <span className="border border-white/10 p-3"><b className="block text-lime-300">{site.configuration.gondolas.length}</b>Gondolas</span>
          </div>
        </div>
      </section>

      <section className="mt-6 border border-white/10 bg-[#0c1714] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Paso 2 / calibrar</span><h3 className="mt-2 text-2xl font-semibold">Alinea el piso y captura el frame</h3></div>
          <div className="flex flex-wrap gap-2">
            <button className="border border-white/10 px-4 py-2 text-sm text-slate-200" onClick={() => setShowCalibration((value) => !value)} type="button">Calibrar camara</button>
            <button className="border border-white/10 px-4 py-2 text-sm text-slate-200" onClick={() => setShowVerify((value) => !value)} type="button">Verificar alineacion</button>
          </div>
        </div>
        {showCalibration && <CameraCalibration preview={preview} frameCapture={frameCapture} configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} onCapture={onFrameCapture} onClose={() => setShowCalibration(false)} />}
        {showVerify && <VideoOverlay preview={preview} configuration={site.configuration} onClose={() => setShowVerify(false)} />}
        {!preview && <div className="mt-4 border border-orange-300/30 bg-orange-300/10 p-3 text-sm text-orange-200">Primero selecciona un video para poder calibrar y capturar el frame.</div>}
      </section>

      <section className="mt-6 border border-white/10 bg-[#0c1714] p-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Paso 3 / planograma</span>
        <h3 className="mt-2 text-2xl font-semibold">Define el planograma</h3>
        <PlanogramEditor configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} frameCapture={frameCapture} onSuggest={onSuggestGondolas} />
      </section>

      <section className="mt-6 border border-white/10 bg-[#0c1714] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Paso 4 / vista 3D</span><h3 className="mt-2 text-2xl font-semibold">Revisa el modelo en 3D</h3></div>
          <button className="border border-lime-300 px-4 py-2 text-sm text-lime-300" onClick={() => setShowPreview3D((value) => !value)} type="button">{showPreview3D ? 'Ocultar modelo 3D' : 'Ver modelo 3D'}</button>
        </div>
        {showPreview3D && <PlanogramPreview3D configuration={site.configuration} />}
      </section>

      <section className="mt-6 border border-white/10 bg-[#0c1714] p-5">
        <button className="w-full bg-lime-300 px-5 py-4 font-bold text-[#07100e] disabled:cursor-not-allowed disabled:opacity-40 md:w-auto" disabled={!file || running} onClick={analyze} type="button">{running ? 'Procesando...' : 'Analizar video'}</button>
        {job && <div className="mt-4"><div className="mb-2 flex justify-between text-sm"><span>{job.message}</span><b>{job.progress}%</b></div><progress className="w-full" value={job.progress} max="100" /></div>}
      </section>

      <ProcessRail stage={job?.stage} progress={job?.progress} running={running} />
    </PageShell>
  )
}
