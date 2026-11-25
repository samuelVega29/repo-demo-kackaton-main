import { ChevronDown, ChevronRight } from 'lucide-react'

export default function FlowStep({ number, eyebrow, title, desc, open, onToggle, children, badge }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e5e7ee] bg-white shadow-[0_22px_70px_-48px_rgba(18,22,33,.55)]">
      <button className="flex w-full items-center gap-4 border-0 bg-white px-5 py-4 text-left transition hover:bg-[#fff8f4]" onClick={onToggle} aria-expanded={open} type="button">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#ff5b12] text-sm font-black text-white">{number}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase text-[#ff5b12]">{eyebrow}</span>
          <b className="mt-1 block text-lg font-black text-[#151323]">{title}</b>
          {desc && <small className="mt-1 block text-xs font-semibold leading-5 text-[#7d8392]">{desc}</small>}
        </span>
        {badge && <span className="hidden rounded-full bg-[#f6f6f4] px-3 py-1 text-[11px] font-black text-[#7d8392] sm:inline-flex">{badge}</span>}
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[#e5e7ee] text-[#7d8392]">{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</span>
      </button>
      {open && <div className="flex flex-col gap-4 border-t border-[#e5e7ee] px-5 pb-5 pt-4">{children}</div>}
    </section>
  )
}
