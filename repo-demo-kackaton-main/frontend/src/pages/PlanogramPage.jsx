import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import GondolaStep from '../components/GondolaStep'
import FlowNav from '../components/flow/FlowNav'
import PlanogramPreview3D from '../components/flow/PlanogramPreview3D'
import SiteFlowPage from '../components/flow/SiteFlowPage'
import { sessionSteps } from '../components/flow/sessionSteps'
import { useApp } from '../context/AppProvider'

export default function PlanogramPage() {
  const { site, loadSite, frameCapture, updateConfiguration, saveConfiguration } = useApp()
  const { siteId } = useParams()
  const step = sessionSteps[3]

  useEffect(() => {
    if (siteId && (!site || String(site.id) !== String(siteId))) {
      if (loadSite) loadSite(siteId)
    }
  }, [siteId, site, loadSite])

  if (!site || !site.configuration) {
    return <div className="flex h-[50vh] items-center justify-center text-sm font-bold text-gray-400">Cargando datos del espacio...</div>
  }

  const hasGondolas = site.configuration.gondolas.length > 0

  return (
    <SiteFlowPage step={step}>
      <div className="flex flex-col gap-4">
        <GondolaStep 
          configuration={site.configuration} 
          frameCapture={frameCapture} 
          onChange={updateConfiguration} 
          onSave={saveConfiguration} 
        />
      </div>
      <div className="rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)] mt-5 p-5">
        <h3 className="text-xl font-black text-[#151323]">Vista 3D del plano</h3>
        <p className="mb-4 mt-1 text-sm font-semibold text-[#7d8392]">Revisa el plano de la tienda, sus gondolas y productos antes de analizar.</p>
        <PlanogramPreview3D configuration={site.configuration} />
      </div>
      <FlowNav
        back={`/sites/${siteId}/calibracion`}
        backLabel="Calibrar camara"
        next={`/sites/${siteId}/analizar`}
        nextLabel="Revisar y analizar"
        nextDisabled={!hasGondolas}
        nextHint={!hasGondolas ? 'Dibuja al menos una gondola para avanzar.' : 'Plano listo para el analisis.'}
      />
    </SiteFlowPage>
  )
}