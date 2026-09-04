import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { forwardHomography, gondolaCorners, inverseHomography, projectFloor } from '../../lib/homography'

const rows = ['Superior', 'Media', 'Inferior']
const columns = ['Izquierda', 'Centro', 'Derecha']
const emptyProducts = () => Array.from({ length: 3 }, () => ['', '', ''])

let drawId = 0

const GRID_SNAP = 0.25

// Blue on purpose — every other outline in this app (selected gondola, candidates, the acid
// accent color) lives in the green/lime family, and a floor outline in that same family reads
// as "another gondola" instead of a background reference. Keep this the one blue thing.
const OUTLINE_COLOR = '#5b9dff'

function snapToGrid(value, gridSize = GRID_SNAP) {
  return Math.round(value / gridSize) * gridSize
}

// Draws the site's hand-traced floor outline (an arbitrary polygon, not necessarily the
// width×depth rectangle) as a dashed reference line — shared by every canvas overlay so the
// real walls are always visible while placing gondolas or checking alignment.
function drawFloorOutline(ctx, outline, toPx) {
  if (!outline || outline.length < 3) return
  const pixels = outline.map(([x, z]) => toPx(x, z)).filter(Boolean)
  if (pixels.length < 3) return
  ctx.beginPath()
  ctx.moveTo(...pixels[0])
  pixels.slice(1).forEach((point) => ctx.lineTo(...point))
  ctx.closePath()
  ctx.strokeStyle = OUTLINE_COLOR
  ctx.lineWidth = 2
  ctx.setLineDash([9, 7])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(6, 14, 12, .78)'
  ctx.fillRect(pixels[0][0], pixels[0][1] - 18, 38, 16)
  ctx.fillStyle = OUTLINE_COLOR
  ctx.font = '10px ui-monospace, monospace'
  ctx.fillText('PISO', pixels[0][0] + 5, pixels[0][1] - 6)
}

// Draw a dimension label with a leader line at the edge of a gondola
function drawDimensionLabel(ctx, x1, y1, x2, y2, text, color) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const padding = 4
  ctx.save()
  ctx.font = '9px ui-monospace, monospace'
  const tw = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(6, 14, 12, .85)'
  ctx.fillRect(mx - tw / 2 - padding, my - 7 - padding, tw + padding * 2, 14 + padding * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.strokeRect(mx - tw / 2 - padding, my - 7 - padding, tw + padding * 2, 14 + padding * 2)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, mx, my)
  ctx.restore()
}

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
      drawFloorOutline(ctx, configuration.floor?.outline, toPx)
      ;(configuration.gondolas || []).forEach((gondola) => {
        const corners = gondolaCorners(gondola)
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
  }, [frameCapture, width, height, marquee, configuration.gondolas, configuration.floor?.outline, inverse])

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

// Traces the real perimeter of the store (walls, columns, alcoves — not necessarily a
// rectangle) point by point over the calibrated video frame. Each click is projected straight
// to floor meters, so the closed polygon becomes an accurate reference for how far apart things
// really are — used to sanity-check gondola placement everywhere else in the app.
function DrawFloorOutline({ frameCapture, configuration, onCommit, onCancel }) {
  const canvasRef = useRef(null)
  const forward = forwardHomography(configuration.camera)
  const inverse = inverseHomography(configuration.camera)
  const [points, setPoints] = useState([])
  const [cursor, setCursor] = useState(null)
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
      drawFloorOutline(ctx, configuration.floor?.outline, toPx)
      const tracePixels = points.map(([x, z]) => toPx(x, z)).filter(Boolean)
      if (tracePixels.length) {
        ctx.beginPath()
        ctx.moveTo(...tracePixels[0])
        tracePixels.slice(1).forEach((point) => ctx.lineTo(...point))
        if (cursor) {
          const cursorPx = toPx(cursor[0], cursor[1])
          if (cursorPx) ctx.lineTo(...cursorPx)
        }
        ctx.strokeStyle = OUTLINE_COLOR
        ctx.lineWidth = 3
        ctx.stroke()
        tracePixels.forEach((point, index) => {
          ctx.beginPath()
          ctx.arc(point[0], point[1], 5, 0, Math.PI * 2)
          ctx.fillStyle = index === 0 ? '#ff6a3d' : OUTLINE_COLOR
          ctx.fill()
        })
      }
    }
    image.src = frameCapture.dataUrl
  }, [frameCapture, width, height, points, cursor, inverse, configuration.floor?.outline])

  const toFloorPoint = (event) => {
    if (!forward || !canvasRef.current) return null
    const rect = canvasRef.current.getBoundingClientRect()
    return projectFloor(forward, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height)
  }

  const addPoint = (event) => {
    const point = toFloorPoint(event)
    if (!point) return
    setPoints((current) => [...current, [Math.round(point[0] * 100) / 100, Math.round(point[1] * 100) / 100]])
  }
  const undo = () => setPoints((current) => current.slice(0, -1))
  const finish = () => { if (points.length >= 3) onCommit(points) }

  const edges = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]))
  const xs = points.map(([x]) => x)
  const zs = points.map(([, z]) => z)
  const bbox = points.length ? { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) } : null

  return (
    <div className="draw-video">
      <canvas
        ref={canvasRef}
        onClick={addPoint}
        onMouseMove={(event) => setCursor(toFloorPoint(event))}
        onDoubleClick={finish}
      />
      {!forward && <div className="draw-hint">Calibra la cámara (4 puntos) para habilitar el trazo y su proyección en metros.</div>}
      <p>Hacé clic en cada esquina real del piso (paredes, columnas, límites) siguiendo el contorno. Doble clic o "Cerrar contorno" para terminar — no hace falta que sea un rectángulo.</p>
      <div className="editor-actions">
        <button onClick={undo} disabled={!points.length}>← Deshacer punto</button>
        <button onClick={finish} disabled={points.length < 3}>✓ Cerrar contorno</button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
      {bbox && (
        <div className="outline-measurements">
          Caja del contorno: <b>{bbox.w.toFixed(2)} × {bbox.d.toFixed(2)} m</b>
          {edges.length > 0 && <span> · Tramos: {edges.map((edge) => `${edge.toFixed(2)}m`).join(' · ')}</span>}
        </div>
      )}
    </div>
  )
}

const PlanogramEditor = forwardRef(function PlanogramEditor({ configuration, onChange, onSave, frameCapture, onSuggest }, ref) {
  const [selectedId, setSelectedId] = useState(configuration.gondolas[0]?.id || null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [detecting, setDetecting] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [floorDrawMode, setFloorDrawMode] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [snapEnabled, setSnapEnabled] = useState(true)
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
  // Turns pending draw/detect candidates into real gondolas and returns the merged
  // configuration synchronously, so callers don't have to wait on React state to
  // catch up before saving/analyzing (that race is what silently dropped candidates).
  const acceptSuggestions = (pending = suggestions) => {
    if (!pending.length) return configuration
    const timestamp = Date.now()
    const items = pending.map((candidate, index) => ({
      id: `d-${timestamp}-${index}`,
      name: `Góndola detectada ${index + 1}`,
      x: candidate.x, z: candidate.z,
      width: candidate.width, depth: candidate.depth, rotation: 0,
      segments: { rows, columns }, products: emptyProducts(),
    }))
    const gondolas = [...configuration.gondolas, ...items]
    replaceGondolas(gondolas)
    setSuggestions([])
    setSelectedId(items[0]?.id || null)
    return { ...configuration, gondolas }
  }

  useImperativeHandle(ref, () => ({
    // Called by the parent right before saving/analyzing so anything the user drew
    // or detected but never clicked "Aceptar todas" on still makes it into the plan.
    flushPendingCandidates: () => acceptSuggestions(),
  }), [suggestions, configuration])

  const save = async () => {
    setSaving(true); setSaveState('')
    try {
      const hadPending = suggestions.length > 0
      const payload = acceptSuggestions()
      await onSave(payload)
      setSaveState(hadPending ? 'Plano guardado (se agregaron las góndolas pendientes)' : 'Plano guardado')
    } catch (error) {
      setSaveState(error.message || 'No se pudo guardar el plano')
    } finally {
      setSaving(false)
    }
  }

  const detect = async () => {
    if (!frameCapture) { setSuggestError('Primero captura un frame en "Calibrar cámara"'); return }
    if (!onSuggest) { setSuggestError('Detección no disponible'); return }
    setDetecting(true); setSuggestError('')
    try {
      const candidates = await onSuggest(frameCapture)
      setSuggestions(candidates || [])
    } catch (requestError) { setSuggestError(requestError.message) } finally { setDetecting(false) }
  }

  const addDrawnCandidate = (candidate) => {
    // Cada rectángulo trazado se convierte al instante en una góndola real (sin pasos
    // intermedios de "aceptar candidatos"): así dibujar es directo y lo que ves queda
    // guardado en el plano desde el primer momento.
    const id = `d-${Date.now()}-${drawId++}`
    const item = {
      id, name: `Góndola ${configuration.gondolas.length + 1}`,
      x: candidate.x, z: candidate.z,
      width: candidate.width, depth: candidate.depth, rotation: 0,
      segments: { rows, columns }, products: emptyProducts(),
    }
    const next = [...configuration.gondolas, item]
    replaceGondolas(next)
    setSelectedId(id)
  }
  const commitOutline = (outline) => { onChange({ ...configuration, floor: { ...floor, outline } }); setFloorDrawMode(false) }
  const clearOutline = () => onChange({ ...configuration, floor: { ...floor, outline: undefined } })

  return (
    <section className="planogram-editor">
      <div className="editor-toolbar">
        <div><span className="eyebrow">CONFIGURACIÓN FÍSICA DE LA SEDE</span><h2>Dibuja tu planograma</h2><p>Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en futuros videos.</p></div>
        <div className="floor-fields"><label>Ancho<input type="number" min="2" step="0.5" value={floor.width} onChange={(event) => changeFloor('width', event.target.value)} /><small>m</small></label><label>Fondo<input type="number" min="2" step="0.5" value={floor.depth} onChange={(event) => changeFloor('depth', event.target.value)} /><small>m</small></label></div>
        <div className="editor-actions">
          <button onClick={detect} disabled={detecting}>{detecting ? 'Detectando…' : '◎ Detectar góndolas'}</button>
          <button className={drawMode ? 'active' : ''} onClick={() => { setDrawMode((value) => !value); setFloorDrawMode(false) }}>✎ Dibujar en el frame</button>
          <button className={floorDrawMode ? 'active' : ''} onClick={() => { setFloorDrawMode((value) => !value); setDrawMode(false) }}>▱ Dibujar el piso</button>
          <button className={snapEnabled ? 'active' : ''} onClick={() => setSnapEnabled((value) => !value)} title="Snap a cuadrícula de 0.25m">⊞ Snap</button>
          <button onClick={addGondola}>＋ Añadir góndola</button>
          <button className="save-layout" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plano'}</button>
        </div>
      </div>
      {floor.outline?.length >= 3 && <div className="suggest-error ok">Contorno del piso trazado ({floor.outline.length} puntos) — se usa como referencia visual, no reemplaza ancho/fondo.<button className="dismiss" onClick={clearOutline}>Borrar contorno</button></div>}
      {floorDrawMode && (frameCapture
        ? <DrawFloorOutline frameCapture={frameCapture} configuration={configuration} onCommit={commitOutline} onCancel={() => setFloorDrawMode(false)} />
        : <div className="suggest-error">Captura primero un frame en "Calibrar cámara" para poder dibujar el piso.</div>)}
      {drawMode && (frameCapture
        ? <DrawOnVideo frameCapture={frameCapture} configuration={configuration} onCandidate={addDrawnCandidate} />
        : <div className="suggest-error">Captura primero un frame en "Calibrar cámara" para poder dibujar sobre él.</div>)}
      {suggestError && <div className="suggest-error">{suggestError}</div>}
      {saveState && <div className="suggest-error ok">{saveState}</div>}
      {suggestions.length > 0 && <div className="suggest-bar">Encontré <b>{suggestions.length}</b>góndola{suggestions.length === 1 ? '' : 's'} candidata{suggestions.length === 1 ? '' : 's'} en el frame. Revisa los contornos punteados y decídete.<button onClick={() => acceptSuggestions()}>＋ Aceptar todas</button><button className="dismiss" onClick={() => setSuggestions([])}>Descartar</button></div>}
      <div className="editor-content">
        <div
          className="floor-editor"
          ref={canvasRef}
          style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
          onPointerMove={movePointer}
          onPointerUp={() => { pointer.current = null; setDragInfo(null) }}
          onPointerCancel={() => { pointer.current = null; setDragInfo(null) }}
        >
          {floor.outline?.length >= 3 && (
            <svg className="floor-outline-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon
                points={floor.outline.map(([x, z]) => `${x / floor.width * 100},${z / floor.depth * 100}`).join(' ')}
                fill="rgba(91,157,255,.06)" stroke="#5b9dff" strokeWidth="0.5" strokeDasharray="1.6,1.3"
              />
            </svg>
          )}
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
          {suggestions.map((candidate, index) => <div className="editor-suggestion" key={`${candidate.x}-${candidate.z}-${index}`} style={{ left: `${candidate.x / floor.width * 100}%`, top: `${candidate.z / floor.depth * 100}%`, width: `${candidate.width / floor.width * 100}%`, height: `${candidate.depth / floor.depth * 100}%` }}><span>D{index + 1} · {Math.round(candidate.confidence * 100)}%</span></div>)}
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
          {!configuration.gondolas.length && !suggestions.length && <button className="empty-floor" onClick={addGondola}>＋ Dibuja tu primera góndola</button>}
        </div>
        <aside className="editor-detail">
          {selected ? <><div className="editor-detail-heading"><span className="eyebrow">GÓNDOLA SELECCIONADA</span><button onClick={removeGondola}>Eliminar</button></div><label>Nombre<input value={selected.name} onChange={(event) => updateGondola(selected.id, { name: event.target.value })} /></label><div className="geometry-fields"><label>X<input type="number" step="0.1" value={selected.x} onChange={(event) => updateGondola(selected.id, { x: Number(event.target.value) })} /></label><label>Z<input type="number" step="0.1" value={selected.z} onChange={(event) => updateGondola(selected.id, { z: Number(event.target.value) })} /></label><label>Ancho<input type="number" step="0.1" value={selected.width} onChange={(event) => updateGondola(selected.id, { width: Number(event.target.value) })} /></label><label>Fondo<input type="number" step="0.1" value={selected.depth} onChange={(event) => updateGondola(selected.id, { depth: Number(event.target.value) })} /></label><label>Rotación °<input type="number" step="1" value={selected.rotation || 0} onChange={(event) => updateGondola(selected.id, { rotation: ((Number(event.target.value) % 360) + 360) % 360 })} /></label></div>

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
})

export default PlanogramEditor
