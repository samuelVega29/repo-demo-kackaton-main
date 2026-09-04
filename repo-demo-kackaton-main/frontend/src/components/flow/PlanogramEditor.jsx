import { useEffect, useRef, useState } from 'react'
import { forwardHomography, inverseHomography, projectFloor } from '../../lib/homography'
import LiveAlignment from './LiveAlignment'

const rows = ['Superior', 'Media', 'Inferior']
const columns = ['Izquierda', 'Centro', 'Derecha']
const emptyProducts = () => Array.from({ length: 3 }, () => ['', '', ''])
const PALETTE = ['#61dec0', '#d4ff70', '#ff9ecb', '#7fb2ff', '#ffb26f', '#c88bff']
const nextColor = (count) => PALETTE[count % PALETTE.length]
const hexToRgba = (hex, alpha) => {
  const normalized = hex.replace('#', '')
  const full = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized
  const num = parseInt(full, 16)
  if (Number.isNaN(num)) return `rgba(97, 222, 192, ${alpha})`
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

let drawId = 0

function DrawOnVideo({ frameCapture, configuration, onCandidate }) {
  const canvasRef = useRef(null)
  const forward = forwardHomography(configuration.camera)
  const inverse = inverseHomography(configuration.camera)
  const [corners, setCorners] = useState([])
  const width = frameCapture.width
  const height = frameCapture.height
  const floor = configuration.floor || {}

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frameCapture) return
    const ctx = canvas.getContext('2d')
    canvas.width = width
    canvas.height = height
    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(4, 10, 8, .30)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const toPx = (x, z) => {
        const normalized = projectFloor(inverse, x, z)
        if (!normalized) return null
        return [normalized[0] * canvas.width, normalized[1] * canvas.height]
      }
      ;(configuration.gondolas || []).forEach((gondola) => {
        const color = gondola.color || '#61dec0'
        const gondolaCorners = [[gondola.x, gondola.z], [gondola.x + gondola.width, gondola.z], [gondola.x + gondola.width, gondola.z + gondola.depth], [gondola.x, gondola.z + gondola.depth]]
        const pixels = gondolaCorners.map(([x, z]) => toPx(x, z)).filter(Boolean)
        if (pixels.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...pixels[0])
        pixels.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = hexToRgba(color, .10)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.stroke()
      })
      if (forward) {
        corners.forEach((point, index) => {
          ctx.beginPath()
          ctx.arc(point[0], point[1], 9, 0, 2 * Math.PI)
          ctx.fillStyle = '#0c1714'
          ctx.fill()
          ctx.strokeStyle = '#d4ff70'
          ctx.lineWidth = 2.5
          ctx.stroke()
          ctx.fillStyle = '#d4ff70'
          ctx.font = 'bold 13px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(index + 1), point[0], point[1])
        })
        if (corners.length === 4) {
          const xs = corners.map((p) => p[0])
          const ys = corners.map((p) => p[1])
          const minX = Math.min(...xs)
          const maxX = Math.max(...xs)
          const minY = Math.min(...ys)
          const maxY = Math.max(...ys)
          ctx.strokeStyle = 'rgba(212, 255, 112, .95)'
          ctx.lineWidth = 3
          ctx.setLineDash([8, 6])
          ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
          ctx.setLineDash([])
          ctx.fillStyle = 'rgba(212, 255, 112, .12)'
          ctx.fillRect(minX, minY, maxX - minX, maxY - minY)
          const m1 = projectFloor(forward, minX / width, minY / height)
          const m2 = projectFloor(forward, maxX / width, maxY / height)
          if (m1 && m2) {
            const w = Math.abs(m2[0] - m1[0])
            const d = Math.abs(m2[1] - m1[1])
            ctx.fillStyle = '#d4ff70'
            ctx.font = '12px ui-monospace, monospace'
            ctx.fillText(`${w.toFixed(2)} × ${d.toFixed(2)} m`, (minX + maxX) / 2, minY - 12)
          }
        }
      }
      if (!forward) {
        ctx.fillStyle = '#ffd9c9'
        ctx.font = '12px ui-monospace, monospace'
        ctx.textAlign = 'center'
        ctx.fillText('Calibra la cámara (4 puntos) para proyectar en metros', width / 2, 22)
      }
    }
    image.src = frameCapture.dataUrl
  }, [frameCapture, width, height, corners, configuration.gondolas, inverse, forward, floor])

  const toPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [Math.max(0, Math.min(width, (event.clientX - rect.left) / rect.width * width)), Math.max(0, Math.min(height, (event.clientY - rect.top) / rect.height * height))]
  }

  const addCorner = (event) => {
    if (!forward) return
    const point = toPoint(event)
    setCorners((current) => {
      const next = [...current, point]
      if (next.length === 4) {
        const xs = next.map((p) => p[0])
        const ys = next.map((p) => p[1])
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)
        const a = projectFloor(forward, minX / width, minY / height)
        const b = projectFloor(forward, maxX / width, maxY / height)
        if (a && b) {
          const x = Math.min(a[0], b[0])
          const z = Math.min(a[1], b[1])
          const candidateWidth = Math.abs(b[0] - a[0])
          const candidateDepth = Math.abs(b[1] - a[1])
          if (!(candidateWidth < 0.5 || candidateDepth < 0.4 || x < -0.5 || z < -0.5 || x + candidateWidth > floor.width + 0.5 || z + candidateDepth > floor.depth + 0.5)) {
            onCandidate({ id: `d-${Date.now()}-${drawId++}`, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, width: Math.round(candidateWidth * 100) / 100, depth: Math.round(candidateDepth * 100) / 100, confidence: 1 })
          }
        }
        return []
      }
      return next
    })
  }

  return (
    <div className="mx-auto my-4 max-w-2xl">
      <canvas
        ref={canvasRef}
        onPointerDown={addCorner}
      />
      <div className="my-2 flex items-center gap-3 [&_button]:border [&_button]:border-teal-900 [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs [&_button]:text-slate-300">
        <span className="font-mono text-xs font-semibold text-lime-300">{corners.length} / 4 esquinas</span>
        {corners.length > 0 && <button type="button" onClick={() => setCorners((current) => current.slice(0, -1))}>Deshacer último</button>}
      </div>
      <p>Haz 4 clics sobre las <b>esquinas</b> del piso de la góndola en el frame (en cualquier orden). Al marcar la 4ª, se proyecta a metros con tu calibración y aparece como candidato. Si no se dibujan bien los contornos, revisa la calibración de la cámara.</p>
    </div>
  )
}

export default function PlanogramEditor({ configuration, onChange, onSave, frameCapture, onSuggest }) {
  const [selectedId, setSelectedId] = useState(configuration.gondolas[0]?.id || null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [detecting, setDetecting] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [showLive, setShowLive] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const canvasRef = useRef(null)
  const pointer = useRef(null)
  const floor = configuration.floor
  const selected = configuration.gondolas.find((item) => item.id === selectedId)

  const replaceGondolas = (gondolas) => onChange({ ...configuration, gondolas })
  const updateGondola = (id, values) => replaceGondolas(configuration.gondolas.map((item) => item.id === id ? { ...item, ...values } : item))
  const addGondola = () => {
    const id = `g-${Date.now()}`
    const item = {
      id, name: `Góndola ${configuration.gondolas.length + 1}`,
      x: 0.5, z: 0.5, width: Math.min(3, floor.width - 0.5), depth: 0.7,
      color: nextColor(configuration.gondolas.length),
      segments: { rows, columns }, products: emptyProducts(),
    }
    replaceGondolas([...configuration.gondolas, item]); setSelectedId(id)
  }
  const removeGondola = () => {
    replaceGondolas(configuration.gondolas.filter((item) => item.id !== selectedId))
    setSelectedId(configuration.gondolas.find((item) => item.id !== selectedId)?.id || null)
  }
  const changeFloor = (field, rawValue) => {
    const value = Math.max(2, Number(rawValue) || 2)
    const nextFloor = { ...floor, [field]: value }
    const camera = {
      ...configuration.camera,
      target_meters: [[0, 0], [nextFloor.width, 0], [nextFloor.width, nextFloor.depth], [0, nextFloor.depth]],
    }
    onChange({ ...configuration, floor: nextFloor, camera })
  }
  const startPointer = (event, item, mode) => {
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedId(item.id)
    pointer.current = { mode, startX: event.clientX, startY: event.clientY, item: { ...item } }
  }
  const movePointer = (event) => {
    if (!pointer.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const dx = (event.clientX - pointer.current.startX) / rect.width * floor.width
    const dz = (event.clientY - pointer.current.startY) / rect.height * floor.depth
    const original = pointer.current.item
    if (pointer.current.mode === 'move') {
      updateGondola(original.id, {
        x: Math.round(Math.min(floor.width - original.width, Math.max(0, original.x + dx)) * 100) / 100,
        z: Math.round(Math.min(floor.depth - original.depth, Math.max(0, original.z + dz)) * 100) / 100,
      })
    } else {
      updateGondola(original.id, {
        width: Math.round(Math.min(floor.width - original.x, Math.max(0.5, original.width + dx)) * 100) / 100,
        depth: Math.round(Math.min(floor.depth - original.z, Math.max(0.4, original.depth + dz)) * 100) / 100,
      })
    }
  }
  const updateProduct = (row, column, value) => {
    const products = (selected.products?.length ? selected.products : emptyProducts()).map((items) => [...items])
    products[row][column] = value
    updateGondola(selected.id, { products })
  }
  const save = async () => {
    setSaving(true); setSaveState('')
    try {
      await onSave(configuration)
      setSaveState('Plano guardado')
    } catch (error) {
      setSaveState(error.message || 'No se pudo guardar el plano')
    } finally {
      setSaving(false)
    }
  }

  const detect = async () => {
    if (!frameCapture) { setSuggestError('Primero captura un frame en “Calibrar cámara”'); return }
    if (!onSuggest) { setSuggestError('Detección no disponible'); return }
    setDetecting(true); setSuggestError('')
    try {
      const candidates = await onSuggest(frameCapture)
      setSuggestions(candidates || [])
    } catch (requestError) { setSuggestError(requestError.message) } finally { setDetecting(false) }
  }
  const acceptSuggestions = () => {
    const timestamp = Date.now()
    const items = suggestions.map((candidate, index) => ({
      id: `d-${timestamp}-${index}`,
      name: `Góndola detectada ${index + 1}`,
      x: candidate.x, z: candidate.z,
      width: candidate.width, depth: candidate.depth,
      color: nextColor(configuration.gondolas.length + index),
      segments: { rows, columns }, products: emptyProducts(),
    }))
    replaceGondolas([...configuration.gondolas, ...items])
    setSuggestions([])
    setSelectedId(items[0]?.id || null)
  }

  const addDrawnCandidate = (candidate) => setSuggestions((current) => [...current, candidate])

  return (
    <section className="my-7 border border-white/10 bg-[#0c1714]">
      <div className="grid min-h-32 items-center gap-6 border-b border-white/10 p-5 lg:grid-cols-[1fr_auto_auto] [&_h2]:mt-2 [&_h2]:text-3xl [&_h2]:font-semibold [&_p]:mt-1 [&_p]:text-xs [&_p]:text-slate-400">
        <div><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-teal-300">CONFIGURACIÓN FÍSICA DE LA SEDE</span><h2>Dibuja tu planograma</h2><p>Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en futuros videos.</p></div>
        <div className="grid grid-cols-2 gap-2 [&_input]:w-20 [&_input]:border [&_input]:border-white/10 [&_input]:bg-[#101e1a] [&_input]:p-2 [&_input]:pr-6 [&_input]:text-white [&_label]:relative [&_label]:grid [&_label]:gap-1 [&_label]:text-[10px] [&_label]:uppercase [&_label]:text-slate-500 [&_small]:absolute [&_small]:bottom-2 [&_small]:right-2 [&_small]:text-teal-300"><label>Ancho<input type="number" min="2" step="0.5" value={floor.width} onChange={(event) => changeFloor('width', event.target.value)} /><small>m</small></label><label>Fondo<input type="number" min="2" step="0.5" value={floor.depth} onChange={(event) => changeFloor('depth', event.target.value)} /><small>m</small></label></div>
        <div className="flex flex-wrap gap-2 [&_button]:border [&_button]:border-teal-900 [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs [&_button]:text-slate-300 disabled:[&_button]:opacity-40"><button onClick={detect} disabled={detecting}>{detecting ? 'Detectando…' : '◎ Detectar góndolas'}</button><button className={drawMode ? 'border-lime-300 bg-lime-300 text-[#07100e]' : ''} onClick={() => setDrawMode((value) => !value)}>✎ Dibujar en el frame</button><button className={showLive ? 'border-lime-300 bg-lime-300 text-[#07100e]' : ''} onClick={() => setShowLive((value) => !value)} disabled={!frameCapture}>⌖ Ver plano 2D en vivo</button><button onClick={addGondola}>＋ Añadir góndola</button><button className="!border-lime-300 !text-lime-300" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plano'}</button></div>
      </div>
      {drawMode && (frameCapture
        ? <DrawOnVideo frameCapture={frameCapture} configuration={configuration} onCandidate={addDrawnCandidate} />
        : <div className="mt-3 text-xs text-orange-300">Captura primero un frame en “Calibrar cámara” para poder dibujar sobre él.</div>)}
      {suggestError && <div className="mt-3 text-xs text-orange-300">{suggestError}</div>}
      {saveState && <div className="mt-3 text-xs text-lime-300">{saveState}</div>}
      {suggestions.length > 0 && <div className="flex flex-wrap items-center gap-2 border border-teal-300/30 bg-teal-300/5 p-4 text-xs text-slate-400 [&_b]:text-lime-300 [&_button]:border [&_button]:border-teal-900 [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs [&_button]:text-slate-300">Encontré <b>{suggestions.length}</b> góndola{suggestions.length === 1 ? '' : 's'} candidata{suggestions.length === 1 ? '' : 's'} en el frame. Revisa los contornos punteados y decídete.<button onClick={acceptSuggestions}>＋ Aceptar todas</button><button className="text-slate-400" onClick={() => setSuggestions([])}>Descartar</button></div>}
      <div className={`grid items-stretch gap-5 p-5 ${showLive ? 'lg:grid-cols-[minmax(0,.72fr)_minmax(0,1.28fr)]' : 'grid-cols-1'}`}>
        {showLive && <div className="flex min-w-0 flex-col gap-2"><span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-lime-300">PLANO 2D EN VIVO · ARRASTRA SOBRE EL FRAME</span>{frameCapture ? <LiveAlignment frameCapture={frameCapture} configuration={configuration} interactive onMoveGondola={updateGondola} selectedId={selectedId} onSelect={setSelectedId} /> : <div className="p-12 text-center text-xs text-slate-500">Captura primero un frame en “Calibrar cámara”.</div>}<span className="font-mono text-[10px] text-slate-500">Arrastra una góndola en el frame o en el mapa para cuadrarla.</span></div>}
      <div className="grid min-h-[640px] grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(310px,.55fr)]">
        <div
          className="relative mx-auto my-7 w-[calc(100%-30px)] max-h-[760px] touch-none select-none overflow-hidden border border-teal-900 bg-[#091512]"
          ref={canvasRef}
          style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
          onPointerMove={movePointer}
          onPointerUp={() => { pointer.current = null }}
          onPointerCancel={() => { pointer.current = null }}
        >
          {configuration.zones?.map((zone) => {
            const xs = zone.polygon.map(([x]) => x); const zs = zone.polygon.map(([, z]) => z)
            return <div className="pointer-events-none absolute border border-dashed border-teal-300/20 bg-teal-300/5 [&_span]:absolute [&_span]:left-2 [&_span]:top-1 [&_span]:font-mono [&_span]:text-[7px] [&_span]:uppercase [&_span]:text-teal-300/40" key={zone.id} style={{ left: `${Math.min(...xs) / floor.width * 100}%`, top: `${Math.min(...zs) / floor.depth * 100}%`, width: `${(Math.max(...xs) - Math.min(...xs)) / floor.width * 100}%`, height: `${(Math.max(...zs) - Math.min(...zs)) / floor.depth * 100}%` }}><span>{zone.name}</span></div>
          })}
          {suggestions.map((candidate, index) => <div className="pointer-events-none absolute border border-dashed border-orange-400 bg-orange-400/10 [&_span]:absolute [&_span]:-top-5 [&_span]:left-0 [&_span]:whitespace-nowrap [&_span]:font-mono [&_span]:text-[8px] [&_span]:font-semibold [&_span]:text-orange-400" key={`${candidate.x}-${candidate.z}-${index}`} style={{ left: `${candidate.x / floor.width * 100}%`, top: `${candidate.z / floor.depth * 100}%`, width: `${candidate.width / floor.width * 100}%`, height: `${candidate.depth / floor.depth * 100}%` }}><span>D{index + 1} · {Math.round(candidate.confidence * 100)}%</span></div>)}
          {configuration.gondolas.map((item) => <button
            className={`absolute grid min-h-5 min-w-6 touch-none place-items-center border p-0 text-slate-100 shadow-lg ${selectedId === item.id ? 'z-10 border-lime-300 bg-teal-900' : 'border-teal-700 bg-teal-950'} [&_span]:pointer-events-none [&_span]:max-w-[90%] [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [&_span]:font-mono [&_span]:text-[8px] [&_span]:font-semibold [&_i]:absolute [&_i]:bottom-0 [&_i]:right-0 [&_i]:h-4 [&_i]:w-4 [&_i]:cursor-nwse-resize [&_i]:touch-none [&_i]:bg-lime-300/60`}
            key={item.id}
            style={{ left: `${item.x / floor.width * 100}%`, top: `${item.z / floor.depth * 100}%`, width: `${item.width / floor.width * 100}%`, height: `${item.depth / floor.depth * 100}%`, '--gcolor': item.color || '#61dec0' }}
            onPointerDown={(event) => startPointer(event, item, 'move')}
          ><span>{item.name}</span><i onPointerDown={(event) => startPointer(event, item, 'resize')} /></button>)}
          {!configuration.gondolas.length && !suggestions.length && <button className="absolute inset-[35%] border border-dashed border-teal-800 bg-[#091512]/80 text-xs text-lime-300" onClick={addGondola}>＋ Dibuja tu primera góndola</button>}
        </div>
        <aside className="min-w-0 border-t border-white/10 bg-[#0a1512] p-5 lg:border-l lg:border-t-0 [&_label]:grid [&_label]:gap-1 [&_label]:text-[10px] [&_label]:uppercase [&_label]:text-slate-500 [&_input]:min-w-0 [&_input]:border [&_input]:border-white/10 [&_input]:bg-[#101e1a] [&_input]:p-2 [&_input]:text-white">
          {selected ? <><div className="mb-5 flex items-center justify-between gap-3 [&_button]:border [&_button]:border-orange-400/30 [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs [&_button]:text-orange-300"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-teal-300">GÓNDOLA SELECCIONADA</span><button onClick={removeGondola}>Eliminar</button></div><label>Nombre<input value={selected.name} onChange={(event) => updateGondola(selected.id, { name: event.target.value })} /></label><label className="[&_span]:flex [&_span]:items-center [&_span]:gap-3 [&_input]:h-9 [&_input]:w-12 [&_input]:p-1 [&_em]:font-mono [&_em]:text-xs [&_em]:not-italic [&_em]:text-slate-300">Color<span><input type="color" value={selected.color || '#61dec0'} onChange={(event) => updateGondola(selected.id, { color: event.target.value })} /><em>{selected.color || '#61dec0'}</em></span></label><div className="my-4 grid grid-cols-4 gap-2"><label>X<input type="number" step="0.1" value={selected.x} onChange={(event) => updateGondola(selected.id, { x: Number(event.target.value) })} /></label><label>Z<input type="number" step="0.1" value={selected.z} onChange={(event) => updateGondola(selected.id, { z: Number(event.target.value) })} /></label><label>Ancho<input type="number" step="0.1" value={selected.width} onChange={(event) => updateGondola(selected.id, { width: Number(event.target.value) })} /></label><label>Fondo<input type="number" step="0.1" value={selected.depth} onChange={(event) => updateGondola(selected.id, { depth: Number(event.target.value) })} /></label></div><span className="mb-3 block font-mono text-[10px] font-semibold uppercase tracking-[0.17em] text-teal-300">PRODUCTOS POR SEGMENTO</span><div className="mt-3 grid grid-cols-3 gap-1 [&_label]:border [&_label]:border-white/10 [&_label]:bg-[#0d1a16] [&_label]:p-2 [&_small]:h-5 [&_small]:text-[7px] [&_small]:leading-tight [&_small]:text-slate-500 [&_input]:p-2 [&_input]:text-[9px] [&_input]:normal-case">{rows.map((row, rowIndex) => columns.map((column, columnIndex) => <label key={`${row}-${column}`}><small>{row} · {column}</small><input value={selected.products?.[rowIndex]?.[columnIndex] || ''} placeholder="Producto" onChange={(event) => updateProduct(rowIndex, columnIndex, event.target.value)} /></label>))}</div></> : <div className="grid h-full place-items-center text-center text-sm leading-7 text-slate-500">Selecciona una góndola para configurar sus segmentos y productos.</div>}
        </aside>
      </div>
      </div>
    </section>
  )
}
