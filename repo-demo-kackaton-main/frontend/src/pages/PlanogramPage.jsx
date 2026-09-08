import { Link, useParams } from 'react-router-dom'
import GondolaStep from '../components/GondolaStep'
import FlowNav from '../components/flow/FlowNav'
import PlanogramPreview3D from '../components/flow/PlanogramPreview3D'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { sessionSteps } from '../components/flow/sessionSteps'
import { useApp } from '../context/AppProvider'

export default function PlanogramPage() {
  const { site, frameCapture, updateConfiguration, saveConfiguration } = useApp()
  const { siteId } = useParams()
  const step = sessionSteps[3]
  const hasGondolas = site.configuration.gondolas.length > 0

  return (
    <SiteFlowPage step={step}>
      <div className="flex flex-col gap-4">
        <GondolaStep configuration={site.configuration} frameCapture={frameCapture} onChange={updateConfiguration} onSave={saveConfiguration} />
      </div>
      <div className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] mt-5 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-black text-[#151323]">Vista 3D del plano</h3>
            <p className="mt-1 text-sm font-semibold text-[#7d8392]">Revisa la configuracion guardada de esta sede antes de analizar nuevos videos.</p>
          </div>
          <Link className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-[#e5e7ee] bg-white px-4 text-[13px] font-black text-[#151323] no-underline transition hover:-translate-y-px hover:border-[#ff5b12]" to={`/sites/${siteId}/captura`}>
            Volver a configurar camara
          </Link>
        </div>
        <PlanogramPreview3D configuration={site.configuration} />
      </div>
      <FlowNav
        back={`/sites/${siteId}/calibracion`}
        backLabel="Calibrar camara"
        next={`/sedes/${siteId}`}
        nextLabel="Volver a la sede"
        nextDisabled={!hasGondolas}
        nextHint={!hasGondolas ? 'Dibuja al menos una gondola para guardar el flujo.' : 'Plano listo. Desde la sede puedes cargar un nuevo video o revisar historial.'}
      />
    </SiteFlowPage>
  )
}

