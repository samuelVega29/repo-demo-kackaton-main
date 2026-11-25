import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import FlowStep from './FlowStep'
import PlanogramEditor from './flow/PlanogramEditor'
import { api } from '../services/client'

const CONFIDENCE_CONFIG = {
  alta: { label: 'Alta', color: '#b6f542', score: 100 },
  media: { label: 'Media', color: '#f5c842', score: 60 },
  baja: { label: 'Baja', color: '#f55842', score: 25 },
}

function ConfidencePanel({ result }) {
  if (!result?.gondolas?.length) return null

  const gondolas = result.gondolas
  const scores = gondolas.map((gondola) => CONFIDENCE_CONFIG[gondola.confianza]?.score ?? 60)
  const globalScore = Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
  const globalColor = globalScore >= 75 ? '#b6f542' : globalScore >= 50 ? '#f5c842' : '#f55842'
  const globalLabel = globalScore >= 75 ? 'Fiable' : globalScore >= 50 ? 'Revisable' : 'Baja fiabilidad'

  return (
    <div className="mt-4 mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Fiabilidad de la sugerencia IA</span>
          <h3 className="mt-1 text-lg font-black text-gray-900">Grado de acierto estimado</h3>
          <p className="mt-1 text-sm text-gray-500">Claude analiza frames del video; la fiabilidad depende de la claridad de la imagen y el ángulo de cámara. Revisa y ajusta en el editor antes de guardar.</p>
        </div>
        <div className="relative flex h-20 w-20 flex-none flex-col items-center justify-center">
          <span className="text-2xl font-black leading-none" style={{ color: globalColor }}>{globalScore}</span>
          <span className="mt-1 text-[8px] font-bold uppercase tracking-widest" style={{ color: globalColor }}>{globalLabel}</span>
          <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={globalColor} strokeWidth="3" strokeDasharray={`${globalScore} 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {gondolas.map((gondola, index) => {
          const config = CONFIDENCE_CONFIG[gondola.confianza] ?? CONFIDENCE_CONFIG.media
          return (
            <div key={gondola.id ?? index} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span style={{ background: config.color }} className="h-2 w-2 flex-none rounded-full" />
                <b className="flex-1 text-sm text-gray-800">{gondola.name}</b>
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: config.color }}>{config.label}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${config.score}%`, background: config.color }} />
              </div>
              {gondola.nota && <p className="m-0 pl-4 text-[10px] italic text-gray-500">{gondola.nota}</p>}
            </div>
          )
        })}
      </div>
      {result.advertencias?.length > 0 && (
        <div className="mt-5 border-l-2 border-red-500 bg-red-50 p-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">Advertencias</span>
          <ul className="mt-1 list-disc pl-4 marker:text-red-500">
            {result.advertencias.map((warning, index) => <li key={index} className="text-[10px] text-red-600">{warning}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function GondolaStep({ configuration, frameCapture, onChange, onSave }) {
  const { siteId } = useParams()
  const [layoutSuggesting, setLayoutSuggesting] = useState(false)
  const [layoutMessage, setLayoutMessage] = useState('')
  const [layoutResult, setLayoutResult] = useState(null)
  const fileInputRef = useRef(null)

  const suggestLayout = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLayoutSuggesting(true)
    setLayoutMessage('')
    setLayoutResult(null)
    try {
      const body = new FormData()
      body.append('video', file)
      const result = await api(`/api/sites/${siteId}/layout-suggestions`, { method: 'POST', body })
      const coloredGondolas = result.gondolas.map((g) => ({
  ...g,
  color: CONFIDENCE_CONFIG[g.confianza]?.color ?? CONFIDENCE_CONFIG.media.color,
}))
      onChange({ ...configuration, gondolas: coloredGondolas })
      setLayoutResult(result)
      setLayoutMessage(`Claude sugirió ${result.gondolas.length} góndola(s).`)
    } catch (error) {
      setLayoutMessage(`Error: ${error.message}`)
    } finally {
      setLayoutSuggesting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <FlowStep 
      number="04" 
      eyebrow="GÓNDOLAS Y PLANO" 
      title="Cuadrá el video y dibujá tu planograma" 
      desc="El planograma se proyecta en vivo sobre el frame capturado. Cada góndola que dibujés o movés se ve reflejada en el video y en el plano." 
      open 
      badge={configuration.gondolas.length ? `${configuration.gondolas.length} góndolas` : 'sin góndolas'} 
      onToggle={() => {}}
    >
      <div className="w-full min-w-0 flex flex-col gap-4">
        <input type="file" hidden ref={fileInputRef} onChange={suggestLayout} accept="video/mp4" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={layoutSuggesting}
          className="w-full rounded-lg bg-[#151323] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[#29263d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {layoutSuggesting ? 'Analizando video...' : '✨ Sugerir góndolas con IA'}
        </button>
        <p className="m-0 text-xs font-medium text-[#7d8392]">
         Opcional — el análisis con IA puede tardar unos <b>4 minutos</b>. Si prefieres no esperar, podés saltar este paso y dibujar las góndolas manualmente en el planograma de abajo.
        </p>
        {layoutMessage && <p className="m-0 text-sm font-semibold text-[#7d8392]">{layoutMessage}</p>}
        {layoutResult && <ConfidencePanel result={layoutResult} />}
        
        <PlanogramEditor configuration={configuration} onChange={onChange} onSave={onSave} frameCapture={frameCapture} />
      </div>
    </FlowStep>
  )
}