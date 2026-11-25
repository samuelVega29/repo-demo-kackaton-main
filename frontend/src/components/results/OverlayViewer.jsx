import { useState } from 'react'
import { artifactUrl } from '../../api/client'
import { OVERLAY_MODES } from '../../constants/analysisModes'

export default function OverlayViewer({ analysis }) {
  const [mode, setMode] = useState('traffic')
  const overlays = analysis.result?.heatmaps?.overlays || {}
  const files = overlays[mode] || []
  if (!OVERLAY_MODES.some((key) => (overlays[key] || []).length)) return null

  return (
    <section className="mt-20">
      <div>
        <span className="font-mono text-[10px] uppercase tracking-[0.17em] text-teal-300">Heatmap sobre video real</span>
        <h2 className="mt-2 text-3xl font-semibold">Calor en la escena</h2>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {OVERLAY_MODES.map((value) => (
          <button className="border border-white/10 px-4 py-2 text-xs uppercase text-slate-200 disabled:opacity-30" onClick={() => setMode(value)} key={value} disabled={!(overlays[value] || []).length} type="button">{value}</button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((filename, index) => (
          <figure className="border border-white/10 bg-[#0c1714] p-2" key={filename}>
            <img className="w-full" src={artifactUrl(analysis.id, filename)} alt={`Heatmap ${mode} frame ${index + 1}`} />
            <figcaption className="p-2 font-mono text-[10px] text-slate-400">{mode.toUpperCase()} / FRAME {index + 1}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
