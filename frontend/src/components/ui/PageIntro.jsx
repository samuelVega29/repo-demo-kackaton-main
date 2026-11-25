export default function PageIntro({ eyebrow, title, highlight, children, aside }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-teal-300">{eyebrow}</span>
        <h1 className="mt-4 max-w-4xl text-5xl font-medium leading-[0.95] tracking-normal text-white sm:text-6xl lg:text-7xl">
          {title} {highlight && <em className="not-italic text-lime-300">{highlight}</em>}
        </h1>
        {children && <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-300/70">{children}</p>}
      </div>
      {aside}
    </div>
  )
}
