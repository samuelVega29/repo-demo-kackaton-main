import { useParams } from 'react-router-dom'
import CameraCalibration from '../components/flow/CameraCalibration'
import FlowNav from '../components/flow/FlowNav'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { sessionSteps } from '../components/flow/sessionSteps'
import { useApp } from '../context/AppProvider'

export default function CalibrationPage() {
  const { site, preview, frameCapture, updateConfiguration, saveConfiguration, onFrameCapture } = useApp()
  const { siteId } = useParams()
  const step = sessionSteps[2]
  const calibrated = site.configuration.camera.calibration_status !== 'uncalibrated'

  return (
    <SiteFlowPage step={step}>
      <div className="flex flex-col gap-4">
        <section className="rounded-lg border border-[#e5e7ee] bg-white p-5 shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
          <CameraCalibration preview={preview} externalCapture={frameCapture} configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} onCapture={onFrameCapture} onClose={() => {}} />
        </section>
      </div>
      <FlowNav
        back={`/sites/${siteId}/captura`}
        backLabel="Capturar frame"
        next={`/sites/${siteId}/planograma`}
        nextLabel="Dibujar gondolas"
        nextDisabled={!calibrated}
        nextHint={!calibrated ? 'Guarda la calibracion para avanzar.' : 'Calibracion lista para generar mapa de calor sobre video.'}
      />
    </SiteFlowPage>
  )
}
