'use client'

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
    <div className="flex items-center justify-between gap-3" aria-label="Etapas del análisis">
      {steps.map(([key, label], index) => {
        const complete = stage === 'results' || index < activeIndex
        const active = running && index === activeIndex
        return (
          <div
            className={`flex flex-col items-center gap-2 text-center ${
              complete || active ? 'opacity-100' : 'opacity-45'
            }`}
            key={key}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full border font-mono text-xs transition-colors ${
                complete
                  ? 'border-acid bg-acid text-base'
                  : active
                    ? 'border-ember bg-ember text-base shadow-glow'
                    : 'border-muted text-muted'
              }`}
            >
              {complete ? '✓' : String(index + 1).padStart(2, '0')}
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.15em] ${
                complete ? 'text-mint' : active ? 'text-ember' : 'text-muted'
              }`}
            >
              {label}
            </span>
            {active && (
              <small className="font-mono text-[10px] text-ember">{progress}%</small>
            )}
          </div>
        )
      })}
    </div>
  )
}