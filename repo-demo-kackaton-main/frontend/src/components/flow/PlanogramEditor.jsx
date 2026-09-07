import { useMemo, useRef, useState } from 'react'
import LiveAlignment from './LiveAlignment'
import { ROWS as rows, COLUMNS as columns, emptyProducts } from '../../utils/constants'
import { pointInPolygon, nearestPointInPolygon } from '../../utils/floorOutline'

const GRID_SNAP = 0.25

function snapToGrid(value, gridSize = GRID_SNAP) {
  return Math.round(value / gridSize) * gridSize
}

function PlanogramEditor({ configuration, onChange, onSave, frameCapture, zone }) {
  const [selectedId, setSelectedId] = useState(configuration.gondolas[0]?.id || null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [floorDrawMode, setFloorDrawMode] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [handOutline, setHandOutline] = useState(null)
  const [dragInfo, setDragInfo] = useState(null)
  const canvasRef = useRef(null)
  const pointer = useRef(null)
  const floor = configuration.floor
  const polygon = floor.outline?.length >= 3 && floor.outline.every(([x, z]) => Number.isFinite(x) && Number.isFinite(z)) ? floor.outline : null
  // El bosquejo de pasillos/acceso se dibuja grande sobre el mapa (la ZONA) para dar
  // perspectiva: se transforma del espacio físico del piso al área que ocupa la zona.
  const sketchZones = useMemo(() => {
    const base = configuration.zones || []
    if (!polygon) return base
    const xs = polygon.map(([x]) => x)
    const zs = polygon.map(([, z]) => z)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minZ = Math.min(...zs), maxZ = Math.max(...zs)
    const zw = Math.max(0.01, maxX - minX)
    const zd = Math.max(0.01, maxZ - minZ)
    return base.map((zone) => ({
      ...zone,
      polygon: (zone.polygon || []).map(([x, z]) => [
        Math.round((minX + (x / floor.width) * zw) * 100) / 100,
        Math.round((minZ + (z / floor.depth) * zd) * 100) / 100,
      ]),
    }))
  }, [polygon, configuration.zones, floor.width, floor.depth])
  const selected = configuration.gondolas.find((item) => item.id === selectedId)

  const view = useMemo(() => {
    const xs = polygon ? polygon.map(([x]) => x) : []
    const zs = polygon ? polygon.map(([, z]) => z) : []
    const allXs = xs.length ? xs.concat(0, floor.width) : [0, floor.width]
    const allZs = zs.length ? zs.concat(0, floor.depth) : [0, floor.depth]
    const minX = Math.min(...allXs) - 0.6
    const maxX = Math.max(...allXs) + 0.6
    const minZ = Math.min(...allZs) - 0.6
    const maxZ = Math.max(...allZs) + 0.6
    return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ }
  }, [polygon, floor.width, floor.depth])

  const nearestInside = (x, z, w, d) => {
    if (!polygon) return { x, z }
    const nearest = nearestPointInPolygon(x + w / 2, z + d / 2, polygon)
    return { x: nearest.x - w / 2, z: nearest.z - d / 2 }
  }

  const replaceGondolas = (gondolas) => onChange({ ...configuration, gondolas })
  const updateGondola = (id, values) => replaceGondolas(configuration.gondolas.map((item) => item.id === id ? { ...item, ...values } : item))
  const addGondolaAt = (x, z) => {
    const width = Math.min(3, view.width - 0.5)
    const depth = 0.7
    const placed = nearestInside(
      Math.round(Math.min(view.maxX - width, Math.max(view.minX, x)) * 100) / 100,
      Math.round(Math.min(view.maxZ - depth, Math.max(view.minZ, z)) * 100) / 100,
      width, depth,
    )
    const item = {
      id: `g-${Date.now()}`,
      name: `Góndola ${configuration.gondolas.length + 1}`,
      x: Math.round(placed.x * 100) / 100,
      z: Math.round(placed.z * 100) / 100,
      width, depth, rotation: 0,
      segments: { rows, columns }, products: emptyProducts(),
    }
    replaceGondolas([...configuration.gondolas, item]); setSelectedId(item.id); setAddMode(false)
  }
  const addGondola = () => {
    const width = Math.min(3, view.width - 0.5)
    const depth = 0.7
    // Cascada en fila para que cada góndola nueva no nazca exactamente encima de la
    // anterior — antes todas arrancaban en el mismo (0.5, 0.5) y quedaban apiladas
    // hasta que alguien las arrastraba a mano.
    const stepX = width + 0.4
    const stepZ = depth + 0.4
    const perRow = Math.max(1, Math.floor((view.width - 0.5) / stepX))
    const index = configuration.gondolas.length
    addGondolaAt(
      Math.min(Math.max(view.minX, view.maxX - width), view.minX + 0.5 + (index % perRow) * stepX),
      Math.min(Math.max(view.minZ, view.maxZ - depth), view.minZ + 0.5 + Math.floor(index / perRow) * stepZ),
    )
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
    pointer.current = { mode, startX: event.clientX, startY: event.clientY, item: { ...item }, valid: { x: item.x, z: item.z } }
  }
  const movePointer = (event) => {
    if (!pointer.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const original = pointer.current.item
    if (pointer.current.mode === 'rotate') {
      // Angle from the gondola's own center to the pointer. The container's aspect-ratio
      // matches the view window's width/depth ratio, so pixel-space angles equal meter ones.
      const centerPx = [
        rect.left + (original.x + original.width / 2 - view.minX) / view.width * rect.width,
        rect.top + (original.z + original.depth / 2 - view.minZ) / view.depth * rect.height,
      ]
      const angle = Math.atan2(event.clientY - centerPx[1], event.clientX - centerPx[0]) * 180 / Math.PI + 90
      updateGondola(original.id, { rotation: Math.round(((angle % 360) + 360) % 360) })
      return
    }
    const dx = (event.clientX - pointer.current.startX) / rect.width * view.width
    const dz = (event.clientY - pointer.current.startY) / rect.height * view.depth
    if (pointer.current.mode === 'move') {
      let newX = original.x + dx
      let newZ = original.z + dz
      if (snapEnabled) {
        newX = snapToGrid(newX)
        newZ = snapToGrid(newZ)
      }
      newX = Math.round(Math.min(view.maxX - original.width, Math.max(view.minX, newX)) * 100) / 100
      newZ = Math.round(Math.min(view.maxZ - original.depth, Math.max(view.minZ, newZ)) * 100) / 100
      if (polygon && !pointInPolygon(newX + original.width / 2, newZ + original.depth / 2, polygon)) {
        const nearest = nearestPointInPolygon(newX + original.width / 2, newZ + original.depth / 2, polygon)
        newX = nearest.x - original.width / 2
        newZ = nearest.z - original.depth / 2
      }
      pointer.current.valid = { x: newX, z: newZ }
      updateGondola(original.id, { x: newX, z: newZ })
      setDragInfo({ mode: 'move', x: newX, z: newZ, w: original.width, d: original.depth })
    } else {
      let newW = original.width + dx
      let newD = original.depth + dz
      if (snapEnabled) {
        newW = snapToGrid(newW)
        newD = snapToGrid(newD)
      }
      newW = Math.round(Math.min(view.maxX - original.x, Math.max(0.5, newW)) * 100) / 100
      newD = Math.round(Math.min(view.maxZ - original.z, Math.max(0.4, newD)) * 100) / 100
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
    setHandOutline(pointsMeters)
    setFloorDrawMode(false)
  }
  const clearOutline = () => {
    setHandOutline(null)
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
    <section className="m-0 w-full min-w-0 overflow-hidden rounded-[10px] border border-[#315148] bg-[#08110e] p-0">
      <div className="grid min-h-0 grid-cols-[1fr_auto] items-start gap-[30px] border-b border-[rgba(206,236,221,.14)] p-[16px] px-[18px] max-[980px]:grid-cols-[1fr] max-[760px]:flex max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:gap-[18px] max-[760px]:p-[21px] max-[760px]:px-[18px]">
        <div><span className="text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">CONFIGURACIÓN FÍSICA DE LA SEDE</span><h2 className="mt-[7px] mb-[5px] text-[29px] tracking-[-.04em] text-[#eaf3ee]">Dibuja tu planograma</h2><p className="m-0 text-[10px] text-[#8aa39a]">Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en futuros videos.</p></div>
        <div className="grid grid-cols-2 gap-2"><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">Ancho<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-[10px] pr-[24px] text-[#eaf3ee] outline-none max-[760px]:w-full" type="number" min="2" step="0.5" value={floor.width} onChange={(event) => changeFloor('width', event.target.value)} /><small className="absolute right-2 bottom-[11px] text-[#61dec0]">m</small></label><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">Fondo<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-[10px] pr-[24px] text-[#eaf3ee] outline-none max-[760px]:w-full" type="number" min="2" step="0.5" value={floor.depth} onChange={(event) => changeFloor('depth', event.target.value)} /><small className="absolute right-2 bottom-[11px] text-[#61dec0]">m</small></label></div>
        <div className="col-span-full flex flex-wrap justify-start gap-[7px]">
          <button className={`cursor-pointer border border-[#3e5b51] bg-transparent p-[11px] px-[13px] text-[9px] whitespace-nowrap text-[#b4c7bf] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] ${snapEnabled ? 'border-[#d4ff70] bg-[#d4ff70] text-[#07100e]' : ''}`} onClick={() => setSnapEnabled((value) => !value)} title="Snap a cuadrícula de 0.25m">⊞ Snap</button>
          <button className={`cursor-pointer border border-[#3e5b51] bg-transparent p-[11px] px-[13px] text-[9px] whitespace-nowrap text-[#b4c7bf] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] ${addMode ? 'border-[#d4ff70] bg-[#d4ff70] text-[#07100e]' : 'hover:border-[#d4ff70] hover:text-[#d4ff70]'}`} onClick={() => { setFloorDrawMode(false); setAddMode((value) => !value) }} title="Hacé clic sobre el plano o el video para colocarla">＋ Añadir góndola</button>
          <button className={`cursor-pointer border border-[#3e5b51] bg-transparent p-[11px] px-[13px] text-[9px] whitespace-nowrap text-[#b4c7bf] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] ${floorDrawMode ? 'border-[#5b9dff] bg-[rgba(91,157,255,.12)] text-[#5b9dff]' : 'hover:border-[#5b9dff] hover:text-[#5b9dff]'}`} onClick={() => { setAddMode(false); setFloorDrawMode((value) => !value) }} title="Traza el contorno del piso a mano (no se guarda)">▱ Dibujar el piso</button>
          <button className="cursor-pointer border border-[#3e5b51] bg-transparent p-[11px] px-[13px] text-[9px] whitespace-nowrap text-[#b4c7bf] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] border-[#d4ff70] text-[#d4ff70] disabled:opacity-40 disabled:cursor-not-allowed" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plano'}</button>
        </div>
      </div>
      <div className="mb-5 flex w-full flex-col gap-2">
        <span className="text-[9px] font-semibold font-[ui-monospace,monospace] uppercase tracking-[.08em] text-[#d4ff70]">Sobre el frame · plano en vivo — arrastrá y colocá góndolas sobre el video</span>
        <LiveAlignment frameCapture={frameCapture} configuration={configuration} drawMode={floorDrawMode && Boolean(frameCapture)} onDrawCommit={commitOutline} onDrawCancel={() => setFloorDrawMode(false)} interactive onMoveGondola={(id, values) => updateGondola(id, values)} selectedId={selectedId} onSelect={setSelectedId} addMode={addMode} onAddAt={(x, z) => addGondolaAt(x, z)} zone={zone} handOutline={handOutline} />
        <p className="m-0 text-[10px] leading-[1.6] text-[#789087]">Calibrá las góndolas arrastrándolas sobre el video proyectado o colocá una nueva haciendo clic en «＋ Añadir góndola». Con «▱ Dibujar el piso» trazás el contorno directo sobre este video (no se guarda).</p>
      </div>
      {floorDrawMode && !frameCapture && <div className="mb-3 border border-[rgba(255,196,84,.4)] bg-[rgba(255,196,84,.07)] p-3 px-[12px] text-[10px] text-[#ffc454]">Captura un frame en el paso 03 para poder trazar el contorno sobre el video.</div>}
      {addMode && <div className="mb-3 border border-[rgba(212,255,112,.4)] bg-[rgba(212,255,112,.07)] p-3 px-[12px] text-[10px] text-[#d4ff70]">Modo añadir: hacé clic en el video (arriba) o en el plano (abajo) para colocar una góndola. Pulsa el botón de nuevo para salir.</div>}
      {saveState && <div className="mt-3 text-[10px] text-[#d4ff70]">{saveState}</div>}
      {(handOutline?.length >= 3 || floor.outline?.length >= 3) && <div className="mb-3 mt-3 flex items-center gap-3 border border-[rgba(91,157,255,.35)] bg-[rgba(91,157,255,.07)] p-3 px-[12px] text-[9px] text-[#9db8d4]"><b className="text-[#5b9dff]">{handOutline?.length >= 3 ? `Contorno del piso trazado (${handOutline.length} puntos)` : 'Zona del plano guardada'}</b><span className="flex-1">{handOutline?.length >= 3 ? 'solo referencia visual, no se guarda — al cerrar o salir de la sede desaparece.' : 'define la forma del mapa; el movimiento de las góndolas queda dentro de la zona.'}</span>{handOutline?.length >= 3 && <button className="cursor-pointer border border-[rgba(91,157,255,.4)] bg-transparent p-2 px-[10px] text-[9px] text-[#9db8d4] hover:border-[#5b9dff] hover:text-[#5b9dff]" onClick={clearOutline}>Borrar contorno</button>}</div>}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_280px] max-[980px]:grid-cols-[minmax(0,1fr)]">
        <div
          className={`relative my-[18px] h-auto w-[calc(100%-20px)] overflow-hidden self-center touch-none select-none max-[760px]:my-3 max-[760px]:mx-auto max-[760px]:w-[calc(100%-24px)]${polygon ? ' min-h-[480px]' : ' max-h-none min-h-[460px] border border-[#315148]'}`}
          ref={canvasRef}
          style={{ aspectRatio: `${view.width}/${view.depth}` }}
          onPointerDown={(event) => {
            if (!addMode) return
            const rect = canvasRef.current.getBoundingClientRect()
            addGondolaAt(view.minX + (event.clientX - rect.left) / rect.width * view.width, view.minZ + (event.clientY - rect.top) / rect.height * view.depth)
          }}
          onPointerMove={movePointer}
          onPointerUp={() => { pointer.current = null; setDragInfo(null) }}
          onPointerCancel={() => { pointer.current = null; setDragInfo(null) }}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`${view.minX} ${view.minZ} ${view.width} ${view.depth}`} preserveAspectRatio="none">
            <rect x={view.minX} y={view.minZ} width={view.width} height={view.depth} fill="#0a1512" />
            {(() => {
              const target = view.width / 14
              const step = target > 5 ? 5 : target > 2 ? 2 : target > 1 ? 1 : target > 0.5 ? 0.5 : 0.25
              const lines = []
              for (let x = Math.ceil(view.minX / step) * step; x <= view.maxX + 1e-6; x += step) {
                lines.push(<line key={`v${x}`} x1={x} y1={view.minZ} x2={x} y2={view.maxZ} stroke="rgba(111,177,150,.08)" strokeWidth="0.05" />)
              }
              for (let z = Math.ceil(view.minZ / step) * step; z <= view.maxZ + 1e-6; z += step) {
                lines.push(<line key={`h${z}`} x1={view.minX} y1={z} x2={view.maxX} y2={z} stroke="rgba(111,177,150,.08)" strokeWidth="0.05" />)
              }
              return lines
            })()}
            {snapEnabled && (() => {
              const lines = []
              for (let x = Math.ceil(view.minX / GRID_SNAP) * GRID_SNAP; x <= view.maxX + 1e-6; x += GRID_SNAP) {
                lines.push(<line key={`s${x}`} x1={x} y1={view.minZ} x2={x} y2={view.maxZ} stroke="rgba(97,222,192,.06)" strokeWidth="0.04" />)
              }
              for (let z = Math.ceil(view.minZ / GRID_SNAP) * GRID_SNAP; z <= view.maxZ + 1e-6; z += GRID_SNAP) {
                lines.push(<line key={`s${z}`} x1={view.minX} y1={z} x2={view.maxX} y2={z} stroke="rgba(97,222,192,.06)" strokeWidth="0.04" />)
              }
              return lines
            })()}
            {polygon && (
              <g>
                <polygon points={polygon.map(([x, z]) => `${x},${z}`).join(' ')} fill="rgba(91,157,255,.08)" stroke="#5b9dff" strokeWidth={Math.max(0.05, view.width / 150)} strokeDasharray="0.26 0.14" strokeLinejoin="round" />
                <text x={polygon[0][0]} y={polygon[0][1] - 0.5} fill="#5b9dff" fontSize={Math.max(0.32, view.width / 42)} fontFamily="ui-monospace, monospace" fontWeight="bold">ZONA</text>
              </g>
            )}
            {handOutline?.length >= 3 && (
              <g>
                <polygon points={handOutline.map(([x, z]) => `${x},${z}`).join(' ')} fill="none" stroke="rgba(196,225,255,.85)" strokeWidth="0.05" strokeDasharray="0.14 0.1" strokeLinejoin="round" />
                <text x={handOutline[0][0]} y={handOutline[0][1] + 0.8} fill="rgba(196,225,255,.85)" fontSize={Math.max(0.28, view.width / 48)} fontFamily="ui-monospace, monospace">PISO</text>
              </g>
            )}
            {sketchZones.map((zone) => {
              const points = (zone.polygon || []).map(([x, z]) => `${x},${z}`).join(' ')
              if ((zone.polygon || []).length < 3) return null
              const first = zone.polygon[0]
              return (
                <g key={zone.id}>
                  <polygon points={points} fill="rgba(97,222,192,.04)" stroke="rgba(160,213,197,.6)" strokeWidth={Math.max(0.045, view.width / 210)} strokeDasharray="0.22 0.12" strokeLinejoin="round" />
                  <text x={first[0]} y={first[1] + 1} fill="rgba(205,235,227,.95)" fontSize={Math.max(0.34, view.width / 40)} fontFamily="ui-monospace, monospace" fontWeight="bold">{zone.name}</text>
                </g>
              )
            })}
          </svg>
          {configuration.gondolas.map((item) => {
            const isSelected = selectedId === item.id
            const isDragging = dragInfo && pointer.current?.item?.id === item.id
            return (
              <div
                className={`absolute grid min-w-[25px] min-h-[20px] touch-none place-items-center border border-[#5c8878] bg-[#264c41] p-0 text-[#dcebe5] shadow-[0_4px_15px_rgba(0,0,0,.25)] transition-shadow duration-150 hover:z-[2] hover:border-[#d4ff70] hover:bg-[#355e50] hover:shadow-[0_4px_20px_rgba(212,255,112,.15)] ${isSelected ? 'z-[2] border-[#d4ff70] bg-[#355e50] shadow-[0_4px_20px_rgba(212,255,112,.15)]' : ''}`}
                key={item.id}
                style={{
                  left: `${(item.x - view.minX) / view.width * 100}%`,
                  top: `${(item.z - view.minZ) / view.depth * 100}%`,
                  width: `${item.width / view.width * 100}%`,
                  height: `${item.depth / view.depth * 100}%`,
                  transform: `rotate(${item.rotation || 0}deg)`,
                }}
                onPointerDown={(event) => startPointer(event, item, 'move')}
              >
                <span className="pointer-events-none max-w-[92%] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-semibold font-[ui-monospace,monospace]">{item.name}</span>
                <span className="pointer-events-none absolute bottom-[-18px] left-1/2 -translate-x-1/2 whitespace-nowrap border border-[rgba(97,222,192,.12)] bg-[rgba(9,21,18,.85)] px-1 py-[1px] text-[8px] font-medium font-[ui-monospace,monospace] text-[#7a9b8e]">{item.width.toFixed(1)}×{item.depth.toFixed(1)}m</span>
                <i className="after:absolute after:top-full after:left-1/2 after:h-[13px] after:w-px after:-translate-x-1/2 after:bg-[#d4ff70] after:content-[''] absolute right-auto bottom-auto top-[-24px] left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab touch-none rounded-full border border-[#d4ff70] bg-[#142a23] active:cursor-grabbing" onPointerDown={(event) => startPointer(event, item, 'rotate')} title="Rotar" />
                <i className="absolute -right-px -bottom-px h-4 w-4 touch-none bg-[linear-gradient(135deg,transparent_45%,#d4ff70_46%_55%,transparent_56%)] cursor-nwse-resize" onPointerDown={(event) => startPointer(event, item, 'resize')} />
              </div>
            )
          })}
          {!configuration.gondolas.length && <button className="absolute inset-[35%] grid cursor-pointer place-items-center border border-dashed border-[#49675c] bg-[rgba(9,21,18,.8)] text-[10px] text-[#d4ff70]" onClick={addGondola}>＋ Dibuja tu primera góndola</button>}
        </div>
        <aside className="min-w-0 border-l border-[rgba(206,236,221,.14)] bg-[#0a1512] p-[25px] max-[980px]:border-l-0 max-[980px]:border-t max-[980px]:border-t-[rgba(206,236,221,.14)] max-[760px]:p-[20px] max-[760px]:px-[14px] max-[760px]:py-[20px]">
          {selected ? <><div className="mb-5 flex items-center justify-between gap-[10px]"><span className="text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">GÓNDOLA SELECCIONADA</span><button className="cursor-pointer border border-[rgba(255,107,61,.3)] bg-transparent p-2 px-[10px] text-[9px] whitespace-nowrap text-[#ff876a] hover:border-[#ff6b3d] hover:text-[#ff6b3d]" onClick={removeGondola}>Eliminar</button></div><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">Nombre<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-[10px] text-[#eaf3ee] outline-none" value={selected.name} onChange={(event) => updateGondola(selected.id, { name: event.target.value })} /></label>
      <span className="mb-3 block text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">PRODUCTOS POR SEGMENTO</span><div className="mt-[10px] grid grid-cols-3 gap-[5px]">{rows.map((row, rowIndex) => columns.map((column, columnIndex) => <label className="relative grid max-[760px]:p-[5px] gap-[5px] border border-[rgba(206,236,221,.14)] bg-[#0d1a16] p-[7px] uppercase text-[8px] text-[#71877e]" key={`${row}-${column}`}><small className="h-[18px] text-[6px] leading-[1.35] text-[#60766d]">{row} · {column}</small><input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-[7px] px-[5px] text-[8px] normal-case text-[#eaf3ee] outline-none max-[760px]:text-[7px]" value={selected.products?.[rowIndex]?.[columnIndex] || ''} placeholder="Producto" onChange={(event) => updateProduct(rowIndex, columnIndex, event.target.value)} /></label>))}</div></> : <div className="grid h-full place-items-center text-center text-[11px] leading-[1.7] text-[#6c8179]">Selecciona una góndola para configurar sus segmentos y productos.</div>}
        </aside>
      </div>
    </section>
  )
}

export default PlanogramEditor