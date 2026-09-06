import { useParams } from 'react-router-dom'
import FlowStep from '../components/FlowStep'
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
        <FlowStep number={step.number} eyebrow="VERTICES DEL PISO" title="Elige P1, P2, P3 y P4" desc={step.desc} open badge={calibrated ? 'calibrada' : 'pendiente'} onToggle={() => {}}>
          <CameraCalibration preview={preview} externalCapture={frameCapture} configuration={site.configuration} onChange={updateConfiguration} onSave={saveConfiguration} onCapture={onFrameCapture} onClose={() => {}} />
        </FlowStep>
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
