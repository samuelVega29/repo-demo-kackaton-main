const steps = [
  ['upload', 'Video'],
  ['metadata', 'Frames'],
  ['model', 'YOLO'],
  ['tracking', 'ByteTrack'],
  ['heatmaps', 'Spatial'],
  ['results', 'Resultados'],
]

export default function ProcessRail({ stage = 'upload', progress = 0, running }) {
  const activeIndex = Math.max(0, steps.findIndex(([key]) => key === stage))

  return (
    <div className="mt-9 grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-6" aria-label="Etapas del analisis">
      {steps.map(([key, label], index) => {
        const complete = stage === 'results' || index < activeIndex
        const active = running && index === activeIndex
        const tone = active ? 'text-lime-300' : complete ? 'text-slate-300' : 'text-slate-600'
        const nodeTone = complete
          ? 'border-lime-300 bg-lime-300 text-[#07100e]'
          : active
            ? 'border-lime-300 bg-[#07100e] text-lime-300 shadow-[0_0_15px_rgba(212,255,112,.25)]'
            : 'border-slate-700 bg-[#07100e] text-slate-500'

        return (
          <div className={`relative flex min-w-0 flex-col gap-2 font-mono text-[10px] ${tone} after:absolute after:left-6 after:right-2 after:top-2 after:hidden after:border-t after:border-slate-700 lg:after:block last:after:hidden`} key={key}>
            <span className={`z-10 grid h-5 w-5 place-items-center border text-[8px] ${nodeTone}`}>
              {complete ? 'OK' : String(index + 1).padStart(2, '0')}
            </span>
            <span>{label}</span>
            {active && <small className="text-lime-300">{progress}%</small>}
          </div>
        )
      })}
    </div>
  )
}
