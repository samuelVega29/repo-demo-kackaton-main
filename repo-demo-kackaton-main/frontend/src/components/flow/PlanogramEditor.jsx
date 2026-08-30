import { useRef, useState } from 'react'

const rows = ['Superior', 'Media', 'Inferior']
const columns = ['Izquierda', 'Centro', 'Derecha']
const emptyProducts = () => Array.from({ length: 3 }, () => ['', '', ''])

export default function PlanogramEditor({ configuration, onChange, onSave, frameCapture, onSuggest }) {
  const [selectedId, setSelectedId] = useState(configuration.gondolas[0]?.id || null)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [detecting, setDetecting] = useState(false)
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
    setSaving(true)
    try { await onSave() } finally { setSaving(false) }
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

  return (
    <section className="planogram-editor">
      <div className="editor-toolbar">
        <div><span className="eyebrow">CONFIGURACIÓN FÍSICA DE LA SEDE</span><h2>Dibuja tu planograma</h2><p>Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en futuros videos.</p></div>
        <div className="floor-fields"><label>Ancho<input type="number" min="2" step="0.5" value={floor.width} onChange={(event) => changeFloor('width', event.target.value)} /><small>m</small></label><label>Fondo<input type="number" min="2" step="0.5" value={floor.depth} onChange={(event) => changeFloor('depth', event.target.value)} /><small>m</small></label></div>
        <div className="editor-actions"><button onClick={detect} disabled={detecting}>{detecting ? 'Detectando…' : '◎ Detectar góndolas'}</button><button onClick={addGondola}>＋ Añadir góndola</button><button className="save-layout" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plano'}</button></div>
      </div>
      {suggestError && <div className="suggest-error">{suggestError}</div>}
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