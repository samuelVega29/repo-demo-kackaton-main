import { NavLink, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppProvider'
import { sessionSteps } from './sessionSteps'

export default function FlowStepper({ active }) {
  const app = useApp()
  const { siteId } = useParams()
  return (
    <nav className="my-[6px] mb-6 flex items-stretch gap-2 overflow-x-auto rounded-[14px] border border-[rgba(206,236,221,.14)] bg-[#0a1512] p-2" aria-label="Pasos de la sesión">
      {sessionSteps.map((step) => {
        const isActive = step.id === active
        const done = step.done(app)
        return (
          <NavLink
            to={step.path(siteId)}
            key={step.id}
            end={step.id === 'video'}
            className={`flex flex-1 min-w-max items-center gap-[9px] rounded-[10px] border border-transparent px-3 py-[9px] text-[10px] font-bold uppercase tracking-[.05em] no-underline whitespace-nowrap text-[#7c9289] hover:bg-[rgba(97,222,192,.05)] hover:text-[#d5e6df] ${isActive ? 'border-[#d4ff70] bg-[rgba(212,255,112,.08)] text-[#e8f6f0]' : ''} ${done ? 'text-[#8faea2]' : ''} ${isActive && done ? 'text-[#e8f6f0]' : ''}`}
          >
            <span className={`grid h-[26px] w-[26px] place-items-center rounded-full border border-[#d4ff70] text-[12px] font-semibold font-[ui-monospace,monospace] text-[#d4ff70] ${done && !isActive ? 'border-[#61dec0] text-[#61dec0]' : ''}`}>{done && !isActive ? '✓' : step.number}</span>
            <span>{step.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}