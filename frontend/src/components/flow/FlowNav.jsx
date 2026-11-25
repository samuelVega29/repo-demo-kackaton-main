import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function FlowNav({ back, backLabel = 'Anterior', next, nextLabel = 'Siguiente paso', nextDisabled = false, nextHint }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#e5e7ee] pt-5">
      {back
        ? <Link className="inline-flex items-center gap-2 text-sm font-black text-[#7d8392] no-underline hover:text-[#ff5b12]" to={back}><ArrowLeft size={16} /> {backLabel}</Link>
        : <span className="hidden" />}
      <div className="flex flex-wrap items-center gap-3">
        {next && (nextDisabled
          ? <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-45" disabled type="button">{nextLabel} <ArrowRight size={16} /></button>
          : <Link className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-[#ff5b12] px-4 text-[13px] font-black text-white no-underline transition hover:-translate-y-px hover:bg-[#e94d08]" to={next}>{nextLabel} <ArrowRight size={16} /></Link>)}
        {nextHint && <small className="max-w-[280px] text-xs font-bold text-[#7d8392]">{nextHint}</small>}
      </div>
    </div>
  )
}
