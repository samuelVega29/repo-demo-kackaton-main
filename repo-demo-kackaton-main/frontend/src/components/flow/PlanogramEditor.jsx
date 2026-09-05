import { useRef, useState } from 'react'
import LiveAlignment from './LiveAlignment'

const rows = ['Superior', 'Media', 'Inferior']
const columns = ['Izquierda', 'Centro', 'Derecha']
const emptyProducts = () => Array.from({ length: 3 }, () => ['', '', ''])

const GRID_SNAP = 0.25

function snapToGrid(value, gridSize = GRID_SNAP) {
  return Math.round(value / gridSize) * gridSize
}

function PlanogramEditor({ configuration, onChange, onSave, frameCapture }) {
  const [selectedId, setSelectedId] = useState(configuration.gondolas[0]?.id || null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [floorDrawMode, setFloorDrawMode] = useState(false)
  const [dragInfo, setDragInfo] = useState(null)
  const canvasRef = useRef(null)
  const pointer = useRef(null)
  const floor = configuration.floor
  const selected = configuration.gondolas.find((item) => item.id === selectedId)

  const replaceGondolas = (gondolas) => onChange({ ...configuration, gondolas })
  const updateGondola = (id, values) => replaceGondolas(configuration.gondolas.map((item) => item.id === id ? { ...item, ...values } : item))
  const addGondola = () => {
    const id = `g-${Date.now()}`
    const width = Math.min(3, floor.width - 0.5)
    const depth = 0.7
    // Cascada en fila para que cada góndola nueva no nazca exactamente encima de la
    // anterior — antes todas arrancaban en el mismo (0.5, 0.5) y quedaban apiladas
    // hasta que alguien las arrastraba a mano.
    const stepX = width + 0.4
    const stepZ = depth + 0.4
    const perRow = Math.max(1, Math.floor((floor.width - 0.5) / stepX))
    const index = configuration.gondolas.length
    const x = Math.round(Math.min(Math.max(0, floor.width - width), 0.5 + (index % perRow) * stepX) * 100) / 100
    const z = Math.round(Math.min(Math.max(0, floor.depth - depth), 0.5 + Math.floor(index / perRow) * stepZ) * 100) / 100
    const item = {
      id, name: `Góndola ${configuration.gondolas.length + 1}`,
      x, z, width, depth, rotation: 0,
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
    const original = pointer.current.item
    if (pointer.current.mode === 'rotate') {
      // Angle from the gondola's own center to the pointer. The container's aspect-ratio
      // matches the floor's width/depth ratio, so pixel-space angles equal floor-meter ones.
      const centerPx = [
        rect.left + (original.x + original.width / 2) / floor.width * rect.width,
        rect.top + (original.z + original.depth / 2) / floor.depth * rect.height,
      ]
      const angle = Math.atan2(event.clientY - centerPx[1], event.clientX - centerPx[0]) * 180 / Math.PI + 90
      updateGondola(original.id, { rotation: Math.round(((angle % 360) + 360) % 360) })
      return
    }
    const dx = (event.clientX - pointer.current.startX) / rect.width * floor.width
    const dz = (event.clientY - pointer.current.startY) / rect.height * floor.depth
    if (pointer.current.mode === 'move') {
      let newX = original.x + dx
      let newZ = original.z + dz
      if (snapEnabled) {
        newX = snapToGrid(newX)
        newZ = snapToGrid(newZ)
      }
      newX = Math.round(Math.min(floor.width - original.width, Math.max(0, newX)) * 100) / 100
      newZ = Math.round(Math.min(floor.depth - original.depth, Math.max(0, newZ)) * 100) / 100
      updateGondola(original.id, { x: newX, z: newZ })
      setDragInfo({ mode: 'move', x: newX, z: newZ, w: original.width, d: original.depth })
    } else {
      let newW = original.width + dx
      let newD = original.depth + dz
      if (snapEnabled) {
        newW = snapToGrid(newW)
        newD = snapToGrid(newD)
      }
      newW = Math.round(Math.min(floor.width - original.x, Math.max(0.5, newW)) * 100) / 100
      newD = Math.round(Math.min(floor.depth - original.z, Math.max(0.4, newD)) * 100) / 100
      updateGondola(original.id, { width: newW, depth: newD })
      setDragInfo({ mode: 'resize', x: original.x, z: original.z, w: newW, d: newD })
    }
  }
  const updateProduct = (row, column, value) => {
    const products = (selected.products?.length ? selected.products : emptyProducts()).map((items) => [...items])
    products[row][column] = value
    updateGondola(selected.id, { products })
  }

  const commitOutline = (pointsMeters) => {
    onChange({ ...configuration, floor: { ...floor, outline: pointsMeters } })
    setFloorDrawMode(false)
  }
  const clearOutline = () => {
    onChange({ ...configuration, floor: { ...floor, outline: undefined } })
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

  return (
    <section className="planogram-editor">
      <div className="editor-toolbar">
        <div><span className="eyebrow">CONFIGURACIÓN FÍSICA DE LA SEDE</span><h2>Dibuja tu planograma</h2><p>Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en futuros videos.</p></div>
        <div className="floor-fields"><label>Ancho<input type="number" min="2" step="0.5" value={floor.width} onChange={(event) => changeFloor('width', event.target.value)} /><small>m</small></label><label>Fondo<input type="number" min="2" step="0.5" value={floor.depth} onChange={(event) => changeFloor('depth', event.target.value)} /><small>m</small></label></div>
        <div className="editor-actions">
          <button className={snapEnabled ? 'active' : ''} onClick={() => setSnapEnabled((value) => !value)} title="Snap a cuadrícula de 0.25m">⊞ Snap</button>
          <button onClick={addGondola}>＋ Añadir góndola</button>
          <button className={floorDrawMode ? 'active' : ''} onClick={() => setFloorDrawMode((value) => !value)} title="Traza el contorno del piso a mano (no se guarda)">▱ Dibujar el piso</button>
          <button className="save-layout" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plano'}</button>
        </div>
      </div>
      <div className="frame-preview">
        <span className="live-label">Sobre el frame · proyección del plano en metros</span>
        <LiveAlignment frameCapture={frameCapture} configuration={configuration} drawMode={floorDrawMode && Boolean(frameCapture)} onDrawCommit={commitOutline} onDrawCancel={() => setFloorDrawMode(false)} />
        <p className="flow-note">Vista en vivo del planograma sobre el frame capturado. Las góndolas se editan en el plano de abajo. Con «▱ Dibujar el piso» trazás el contorno directo sobre este video.</p>
      </div>
      {floorDrawMode && !frameCapture && <div className="suggest-error">Captura un frame en el paso 03 para poder trazar el contorno sobre el video.</div>}
      {saveState && <div className="suggest-error ok">{saveState}</div>}
      {floor.outline?.length >= 3 && <div className="suggest-error ok"><b>Contorno del piso trazado ({floor.outline.length} puntos)</b><span>solo referencia visual, no se guarda — al cerrar o salir de la sede desaparece.</span><button className="dismiss" onClick={clearOutline}>Borrar contorno</button></div>}
      <div className="editor-content">
        <div
          className="floor-editor"
          ref={canvasRef}
          style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
          onPointerMove={movePointer}
          onPointerUp={() => { pointer.current = null; setDragInfo(null) }}
          onPointerCancel={() => { pointer.current = null; setDragInfo(null) }}
        >
          {/* Grid overlay for snap reference */}
          {snapEnabled && (
            <svg className="floor-grid-overlay" viewBox={`0 0 ${floor.width} ${floor.depth}`} preserveAspectRatio="none">
              {Array.from({ length: Math.floor(floor.width / GRID_SNAP) + 1 }, (_, i) => i * GRID_SNAP).map((x) => (
                <line key={`v${x}`} x1={x} y1={0} x2={x} y2={floor.depth} stroke="rgba(97,222,192,.06)" strokeWidth="0.05" />
              ))}
              {Array.from({ length: Math.floor(floor.depth / GRID_SNAP) + 1 }, (_, i) => i * GRID_SNAP).map((z) => (
                <line key={`h${z}`} x1={0} y1={z} x2={floor.width} y2={z} stroke="rgba(97,222,192,.06)" strokeWidth="0.05" />
              ))}
            </svg>
          )}
          {configuration.zones?.map((zone) => {
            const xs = zone.polygon.map(([x]) => x); const zs = zone.polygon.map(([, z]) => z)
            return <div className="editor-zone" key={zone.id} style={{ left: `${Math.min(...xs) / floor.width * 100}%`, top: `${Math.min(...zs) / floor.depth * 100}%`, width: `${(Math.max(...xs) - Math.min(...xs)) / floor.width * 100}%`, height: `${(Math.max(...zs) - Math.min(...zs)) / floor.depth * 100}%` }}><span>{zone.name}</span></div>
          })}
          {floor.outline?.length >= 3 && (
            <svg className="floor-outline-overlay" viewBox={`0 0 ${floor.width} ${floor.depth}`} preserveAspectRatio="none">
              <polygon points={floor.outline.map(([x, z]) => `${x},${z}`).join(' ')} fill="rgba(91,157,255,.12)" stroke="#5b9dff" strokeWidth="0.07" strokeDasharray="0.18 0.1" strokeLinejoin="round" />
              <text x={floor.outline[0][0]} y={floor.outline[0][1]}>PISO</text>
            </svg>
          )}
          {configuration.gondolas.map((item) => {
            const isSelected = selectedId === item.id
            const isDragging = dragInfo && pointer.current?.item?.id === item.id
            return (
              <div
                className={`editor-gondola ${isSelected ? 'selected' : ''}`}
                key={item.id}
                style={{
                  left: `${item.x / floor.width * 100}%`,
                  top: `${item.z / floor.depth * 100}%`,
                  width: `${item.width / floor.width * 100}%`,
                  height: `${item.depth / floor.depth * 100}%`,
                  transform: `rotate(${item.rotation || 0}deg)`,
                }}
                onPointerDown={(event) => startPointer(event, item, 'move')}
              >
                <span>{item.name}</span>
                <span className="gondola-dimensions">{item.width.toFixed(1)}×{item.depth.toFixed(1)}m</span>
                <i className="rotate-handle" onPointerDown={(event) => startPointer(event, item, 'rotate')} title="Rotar" />
                <i onPointerDown={(event) => startPointer(event, item, 'resize')} />
              </div>
            )
          })}
          {!configuration.gondolas.length && <button className="empty-floor" onClick={addGondola}>＋ Dibuja tu primera góndola</button>}
        </div>
        <aside className="editor-detail">
          {selected ? <><div className="editor-detail-heading"><span className="eyebrow">GÓNDOLA SELECCIONADA</span><button onClick={removeGondola}>Eliminar</button></div><label>Nombre<input value={selected.name} onChange={(event) => updateGondola(selected.id, { name: event.target.value })} /></label>

      {/* Altura y niveles del estante */}
      <span className="field-label">ALTURA Y NIVELES</span>
      <div className="geometry-fields">
        <label>
          Altura total
          <input
            type="number"
            step="0.05"
            min="0.5"
            max="3.0"
            value={selected.height ?? 1.45}
            onChange={(event) => updateGondola(selected.id, { height: Number(event.target.value) })}
          />
          <small>m</small>
        </label>
      </div>
      <div className="tier-heights-fields">
        <label>
          Nivel 1 (bajo)
          <input
            type="number"
            step="0.05"
            min="0"
            max="1.5"
            value={selected.tier_heights?.[0] ?? 0.25}
            onChange={(event) => {
              const tier_heights = [...(selected.tier_heights || [0.25, 0.73, 1.20])]
              tier_heights[0] = Number(event.target.value)
              updateGondola(selected.id, { tier_heights })
            }}
          />
          <small>m</small>
        </label>
        <label>
          Nivel 2 (medio)
          <input
            type="number"
            step="0.05"
            min="0"
            max="2.0"
            value={selected.tier_heights?.[1] ?? 0.73}
            onChange={(event) => {
              const tier_heights = [...(selected.tier_heights || [0.25, 0.73, 1.20])]
              tier_heights[1] = Number(event.target.value)
              updateGondola(selected.id, { tier_heights })
            }}
          />
          <small>m</small>
        </label>
        <label>
          Nivel 3 (alto)
          <input
            type="number"
            step="0.05"
            min="0"
            max="2.5"
            value={selected.tier_heights?.[2] ?? 1.20}
            onChange={(event) => {
              const tier_heights = [...(selected.tier_heights || [0.25, 0.73, 1.20])]
              tier_heights[2] = Number(event.target.value)
              updateGondola(selected.id, { tier_heights })
            }}
          />
          <small>m</small>
        </label>
      </div>

      <span className="field-label">PRODUCTOS POR SEGMENTO</span><div className="product-editor">{rows.map((row, rowIndex) => columns.map((column, columnIndex) => <label key={`${row}-${column}`}><small>{row} · {column}</small><input value={selected.products?.[rowIndex]?.[columnIndex] || ''} placeholder="Producto" onChange={(event) => updateProduct(rowIndex, columnIndex, event.target.value)} /></label>))}</div></> : <div className="editor-empty-detail">Selecciona una góndola para configurar sus segmentos y productos.</div>}
        </aside>
      </div>
    </section>
  )
}

export default PlanogramEditor
