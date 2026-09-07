import { useParams } from 'react-router-dom'
import FlowStep from '../components/FlowStep'
import FrameCaptureFields from '../components/FrameCaptureFields'
import FlowNav from '../components/flow/FlowNav'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { sessionSteps } from '../components/flow/sessionSteps'
import { useApp } from '../context/AppProvider'

export default function CapturePage() {
  const { preview, frameCapture, onFrameCapture } = useApp()
  const { siteId } = useParams()
  const step = sessionSteps[1]

  return (
    <SiteFlowPage step={step}>
      <div className="flex flex-col gap-4">
        <FlowStep number={step.number} eyebrow="TOMAR FRAME" title="Captura el frame del video" desc={step.desc} open badge={frameCapture ? 'capturado' : 'pendiente'} onToggle={() => {}}>
          <FrameCaptureFields preview={preview} frameCapture={frameCapture} onCapture={onFrameCapture} />
        </FlowStep>
      </div>
      <FlowNav
        back={`/sites/${siteId}/video`}
        backLabel="Subir video"
        next={`/sites/${siteId}/calibracion`}
        nextLabel="Calibrar camara"
        nextDisabled={!frameCapture}
        nextHint={!frameCapture ? 'Captura un frame para avanzar.' : 'Listo para cuadrar P1-P4.'}
      />
    </SiteFlowPage>
  )
}
