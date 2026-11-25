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
    <div className="mt-[35px] grid grid-cols-6 gap-[35px] max-[760px]:grid-cols-3 max-[760px]:gap-x-[13px] max-[760px]:gap-y-[25px]" aria-label="Etapas del análisis">
      {steps.map(([key, label], index) => {
        const complete = stage === 'results' || index < activeIndex
        const active = running && index === activeIndex
        return (
          <div className={`relative flex flex-col gap-[9px] text-[8px] font-medium font-[ui-monospace,monospace] tracking-[.23em] text-[#52675f] ${complete ? 'text-[#a9c0b6]' : ''} ${active ? 'text-[#d4ff70]' : ''}`} key={key}>
            {index < steps.length - 1 && <span aria-hidden className="absolute top-[8px] right-0 left-[18px] border-t border-[#294039]" />}
            <span className={`z-[1] grid h-[17px] w-[17px] place-items-center border text-[7px] font-semibold text-[#07100e] border-[#3b5149] bg-[#07100e] ${complete ? 'border-[#d4ff70] bg-[#d4ff70] text-[#10170e]' : ''} ${active ? 'border-[#d4ff70] shadow-[0_0_15px_rgba(212,255,112,.25)]' : ''}`}>{complete ? '✓' : String(index + 1).padStart(2, '0')}</span>
            <span>{label}</span>
            {active && <small className="text-[8px] font-semibold text-[#d4ff70]">{progress}%</small>}
          </div>
        )
      })}
    </div>
  )
}