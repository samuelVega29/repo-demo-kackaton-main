import { useEffect, useRef, useState } from 'react'
import { forwardHomography, inverseHomography, projectFloor } from '../../lib/homography'

const rows = ['Superior', 'Media', 'Inferior']
const columns = ['Izquierda', 'Centro', 'Derecha']
const emptyProducts = () => Array.from({ length: 3 }, () => ['', '', ''])

let drawId = 0

function DrawOnVideo({ frameCapture, configuration, onCandidate }) {
  const canvasRef = useRef(null)
  const dragStart = useRef(null)
  const forward = forwardHomography(configuration.camera)
  const inverse = inverseHomography(configuration.camera)
  const [marquee, setMarquee] = useState(null)
  const width = frameCapture.width
  const height = frameCapture.height

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
        const corners = [[gondola.x, gondola.z], [gondola.x + gondola.width, gondola.z], [gondola.x + gondola.width, gondola.z + gondola.depth], [gondola.x, gondola.z + gondola.depth]]
        const pixels = corners.map(([x, z]) => toPx(x, z)).filter(Boolean)
        if (pixels.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...pixels[0])
        pixels.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.strokeStyle = 'rgba(97, 222, 192, .7)'
        ctx.lineWidth = 3
        ctx.stroke()
      })
      if (marquee) {
        ctx.strokeStyle = 'rgba(212, 255, 112, .95)'
        ctx.lineWidth = 3
        ctx.strokeRect(marquee[0], marquee[1], marquee[2] - marquee[0], marquee[3] - marquee[1])
        ctx.fillStyle = 'rgba(212, 255, 112, .12)'
        ctx.fillRect(marquee[0], marquee[1], marquee[2] - marquee[0], marquee[3] - marquee[1])
      }
    }
    image.src = frameCapture.dataUrl
  }, [frameCapture, width, height, marquee, configuration.gondolas, inverse])

  const toPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [Math.max(0, Math.min(width, (event.clientX - rect.left) / rect.width * width)), Math.max(0, Math.min(height, (event.clientY - rect.top) / rect.height * height))]
  }

  const pointerDown = (event) => {
    dragStart.current = toPoint(event)
    setMarquee(dragStart.current)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event) => {
    if (!dragStart.current) return
    const point = toPoint(event)
    setMarquee([dragStart.current[0], dragStart.current[1], point[0], point[1]])
  }
  const pointerUp = (event) => {
    if (!dragStart.current || !forward) return
    const start = dragStart.current
    const point = toPoint(event)
    dragStart.current = null
    const x1 = Math.min(start[0], point[0])
    const y1 = Math.min(start[1], point[1])
    const x2 = Math.max(start[0], point[0])
    const y2 = Math.max(start[1], point[1])
    if (x2 - x1 < 18 || y2 - y1 < 18) { setMarquee(null); return }
    const a = projectFloor(forward, x1 / width, y1 / height)
    const b = projectFloor(forward, x2 / width, y2 / height)
    setMarquee(null)
    if (!a || !b) return
    const x = Math.min(a[0], b[0])
    const z = Math.min(a[1], b[1])
    const candidateWidth = Math.abs(b[0] - a[0])
    const candidateDepth = Math.abs(b[1] - a[1])
    const floor = configuration.floor || {}
    if (candidateWidth < 0.5 || candidateDepth < 0.4) return
    if (x < -0.5 || z < -0.5 || x + candidateWidth > floor.width + 0.5 || z + candidateDepth > floor.depth + 0.5) return
    onCandidate({ id: `d-${Date.now()}-${drawId++}`, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, width: Math.round(candidateWidth * 100) / 100, depth: Math.round(candidateDepth * 100) / 100, confidence: 1 })
  }

  return (
    <div className="draw-video">
      <canvas
        ref={canvasRef}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => { dragStart.current = null; setMarquee(null) }}
      />
      {!forward && <div className="draw-hint">Calibra la cámara (4 puntos) para habilitar el trazo y su proyección en metros.</div>}
      <p>Arrastra sobre el frame para dibujar el rectángulo de una góndola. Al soltar se proyecta a metros con tu calibración actual y aparece como candidato.</p>
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
      segments: { rows, columns }, products: emptyProducts(),
    }))
    replaceGondolas([...configuration.gondolas, ...items])
    setSuggestions([])
    setSelectedId(items[0]?.id || null)
  }

  const addDrawnCandidate = (candidate) => setSuggestions((current) => [...current, candidate])

  return (
    <section className="planogram-editor">
      <div className="editor-toolbar">
        <div><span className="eyebrow">CONFIGURACIÓN FÍSICA DE LA SEDE</span><h2>Dibuja tu planograma</h2><p>Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en futuros videos.</p></div>
        <div className="floor-fields"><label>Ancho<input type="number" min="2" step="0.5" value={floor.width} onChange={(event) => changeFloor('width', event.target.value)} /><small>m</small></label><label>Fondo<input type="number" min="2" step="0.5" value={floor.depth} onChange={(event) => changeFloor('depth', event.target.value)} /><small>m</small></label></div>
        <div className="editor-actions"><button onClick={detect} disabled={detecting}>{detecting ? 'Detectando…' : '◎ Detectar góndolas'}</button><button className={drawMode ? 'active' : ''} onClick={() => setDrawMode((value) => !value)}>✎ Dibujar en el frame</button><button onClick={addGondola}>＋ Añadir góndola</button><button className="save-layout" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plano'}</button></div>
      </div>
      {drawMode && (frameCapture
        ? <DrawOnVideo frameCapture={frameCapture} configuration={configuration} onCandidate={addDrawnCandidate} />
        : <div className="suggest-error">Captura primero un frame en “Calibrar cámara” para poder dibujar sobre él.</div>)}
      {suggestError && <div className="suggest-error">{suggestError}</div>}
      {saveState && <div className="suggest-error ok">{saveState}</div>}
      {suggestions.length > 0 && <div className="suggest-bar">Encontré <b>{suggestions.length}</b> góndola{suggestions.length === 1 ? '' : 's'} candidata{suggestions.length === 1 ? '' : 's'} en el frame. Revisa los contornos punteados y decídete.<button onClick={acceptSuggestions}>＋ Aceptar todas</button><button className="dismiss" onClick={() => setSuggestions([])}>Descartar</button></div>}
      <div className="editor-content">
        <div
          className="floor-editor"
          ref={canvasRef}
          style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
          onPointerMove={movePointer}
          onPointerUp={() => { pointer.current = null }}
          onPointerCancel={() => { pointer.current = null }}
        >
          {configuration.zones?.map((zone) => {
            const xs = zone.polygon.map(([x]) => x); const zs = zone.polygon.map(([, z]) => z)
            return <div className="editor-zone" key={zone.id} style={{ left: `${Math.min(...xs) / floor.width * 100}%`, top: `${Math.min(...zs) / floor.depth * 100}%`, width: `${(Math.max(...xs) - Math.min(...xs)) / floor.width * 100}%`, height: `${(Math.max(...zs) - Math.min(...zs)) / floor.depth * 100}%` }}><span>{zone.name}</span></div>
          })}
          {suggestions.map((candidate, index) => <div className="editor-suggestion" key={`${candidate.x}-${candidate.z}-${index}`} style={{ left: `${candidate.x / floor.width * 100}%`, top: `${candidate.z / floor.depth * 100}%`, width: `${candidate.width / floor.width * 100}%`, height: `${candidate.depth / floor.depth * 100}%` }}><span>D{index + 1} · {Math.round(candidate.confidence * 100)}%</span></div>)}
          {configuration.gondolas.map((item) => <button
            className={`editor-gondola ${selectedId === item.id ? 'selected' : ''}`}
            key={item.id}
            style={{ left: `${item.x / floor.width * 100}%`, top: `${item.z / floor.depth * 100}%`, width: `${item.width / floor.width * 100}%`, height: `${item.depth / floor.depth * 100}%` }}
            onPointerDown={(event) => startPointer(event, item, 'move')}
          ><span>{item.name}</span><i onPointerDown={(event) => startPointer(event, item, 'resize')} /></button>)}
          {!configuration.gondolas.length && !suggestions.length && <button className="empty-floor" onClick={addGondola}>＋ Dibuja tu primera góndola</button>}
        </div>
        <aside className="editor-detail">
          {selected ? <><div className="editor-detail-heading"><span className="eyebrow">GÓNDOLA SELECCIONADA</span><button onClick={removeGondola}>Eliminar</button></div><label>Nombre<input value={selected.name} onChange={(event) => updateGondola(selected.id, { name: event.target.value })} /></label><div className="geometry-fields"><label>X<input type="number" step="0.1" value={selected.x} onChange={(event) => updateGondola(selected.id, { x: Number(event.target.value) })} /></label><label>Z<input type="number" step="0.1" value={selected.z} onChange={(event) => updateGondola(selected.id, { z: Number(event.target.value) })} /></label><label>Ancho<input type="number" step="0.1" value={selected.width} onChange={(event) => updateGondola(selected.id, { width: Number(event.target.value) })} /></label><label>Fondo<input type="number" step="0.1" value={selected.depth} onChange={(event) => updateGondola(selected.id, { depth: Number(event.target.value) })} /></label></div><span className="field-label">PRODUCTOS POR SEGMENTO</span><div className="product-editor">{rows.map((row, rowIndex) => columns.map((column, columnIndex) => <label key={`${row}-${column}`}><small>{row} · {column}</small><input value={selected.products?.[rowIndex]?.[columnIndex] || ''} placeholder="Producto" onChange={(event) => updateProduct(rowIndex, columnIndex, event.target.value)} /></label>))}</div></> : <div className="editor-empty-detail">Selecciona una góndola para configurar sus segmentos y productos.</div>}
        </aside>
      </div>
    </section>
  )
}