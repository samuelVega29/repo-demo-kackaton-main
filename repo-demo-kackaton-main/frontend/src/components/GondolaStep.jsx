import FlowStep from './FlowStep'
import PlanogramEditor from './flow/PlanogramEditor'

export default function GondolaStep({ configuration, frameCapture, onChange, onSave }) {
  return (
    <FlowStep number="04" eyebrow="GÓNDOLAS Y PLANO" title="Cuadrá el video y dibujá tu planograma" desc="El planograma se proyecta en vivo sobre el frame capturado. Cada góndola que dibujés o movés se ve reflejada en el video y en el plano." open badge={configuration.gondolas.length ? `${configuration.gondolas.length} góndolas` : 'sin góndolas'} onToggle={() => {}}>
      <div className="w-full min-w-0">
        <PlanogramEditor configuration={configuration} onChange={onChange} onSave={onSave} frameCapture={frameCapture} />
      </div>
    </FlowStep>
  )
}