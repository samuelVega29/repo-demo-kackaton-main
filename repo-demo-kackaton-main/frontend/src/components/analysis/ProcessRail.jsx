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
    <div className="process-rail" aria-label="Etapas del análisis">
      {steps.map(([key, label], index) => {
        const complete = stage === 'results' || index < activeIndex
        const active = running && index === activeIndex
        return (
          <div className={`process-step ${complete ? 'complete' : ''} ${active ? 'active' : ''}`} key={key}>
            <span className="step-node">{complete ? '✓' : String(index + 1).padStart(2, '0')}</span>
            <span>{label}</span>
            {active && <small>{progress}%</small>}
          </div>
        )
      })}
    </div>
  )
}
