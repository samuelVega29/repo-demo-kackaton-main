import { useRef, useState } from 'react'
import LiveAlignment from './LiveAlignment'
import { ROWS as rows, COLUMNS as columns, emptyProducts } from '../../utils/constants'

const GRID_SNAP = 0.25

const TIERS = [
  ['Nivel 1 (bajo)', 0, 1.5, 0.25],
  ['Nivel 2 (medio)', 0, 2.0, 0.73],
  ['Nivel 3 (alto)', 0, 2.5, 1.20],
]

const DEFAULT_TIER_HEIGHTS = TIERS.map(([, , , fallback]) => fallback)

function snapToGrid(value, gridSize = GRID_SNAP) {
  return Math.round(value / gridSize) * gridSize
}

function PlanogramEditor({ configuration, onChange, onSave, frameCapture }) {
  const [selectedId, setSelectedId] = useState(configuration.gondolas[0]?.id || null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [floorDrawMode, setFloorDrawMode] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [dragInfo, setDragInfo] = useState(null)
  const canvasRef = useRef(null)
  const pointer = useRef(null)
  const floor = configuration.floor
  const selected = configuration.gondolas.find((item) => item.id === selectedId)

  const replaceGondolas = (gondolas) => onChange({ ...configuration, gondolas })
  const updateGondola = (id, values) => replaceGondolas(configuration.gondolas.map((item) => item.id === id ? { ...item, ...values } : item))
  const addGondolaAt = (x, z) => {
    const width = Math.min(3, floor.width - 0.5)
    const depth = 0.7
    const item = {
      id: `g-${Date.now()}`,
      name: `Góndola ${configuration.gondolas.length + 1}`,
      x: Math.round(Math.min(floor.width - width, Math.max(0, x)) * 100) / 100,
      z: Math.round(Math.min(floor.depth - depth, Math.max(0, z)) * 100) / 100,
      width, depth, rotation: 0,
      segments: { rows, columns }, products: emptyProducts(),
    }
    replaceGondolas([...configuration.gondolas, item]); setSelectedId(item.id); setAddMode(false)
  }
  const addGondola = () => {
    const width = Math.min(3, floor.width - 0.5)
    const depth = 0.7
    // Cascada en fila para que cada góndola nueva no nazca exactamente encima de la
    // anterior — antes todas arrancaban en el mismo (0.5, 0.5) y quedaban apiladas
    // hasta que alguien las arrastraba a mano.
    const stepX = width + 0.4
    const stepZ = depth + 0.4
    const perRow = Math.max(1, Math.floor((floor.width - 0.5) / stepX))
    const index = configuration.gondolas.length
    addGondolaAt(
      Math.min(Math.max(0, floor.width - width), 0.5 + (index % perRow) * stepX),
      Math.min(Math.max(0, floor.depth - depth), 0.5 + Math.floor(index / perRow) * stepZ),
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
    <section className="m-0 border-0 p-0">
      <div className="grid min-h-0 grid-cols-[1fr_auto] items-start gap-[30px] border-b border-[rgba(206,236,221,.14)] p-[16px] px-[18px] max-[980px]:grid-cols-[1fr] max-[760px]:flex max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:gap-[18px] max-[760px]:p-[21px] max-[760px]:px-[18px]">
        <div><span className="text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">CONFIGURACIÓN FÍSICA DE LA SEDE</span><h2 className="mt-[7px] mb-[5px] text-[29px] tracking-[-.04em]">Dibuja tu planograma</h2><p className="m-0 text-[10px] text-[#70857d]">Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en futuros videos.</p></div>
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
        <LiveAlignment frameCapture={frameCapture} configuration={configuration} drawMode={floorDrawMode && Boolean(frameCapture)} onDrawCommit={commitOutline} onDrawCancel={() => setFloorDrawMode(false)} interactive onMoveGondola={(id, values) => updateGondola(id, values)} selectedId={selectedId} onSelect={setSelectedId} addMode={addMode} onAddAt={(x, z) => addGondolaAt(x, z)} />
        <p className="m-0 text-[10px] leading-[1.6] text-[#789087]">Calibrá las góndolas arrastrándolas sobre el video proyectado o colocá una nueva haciendo clic en «＋ Añadir góndola». Con «▱ Dibujar el piso» trazás el contorno directo sobre este video (no se guarda).</p>
      </div>
      {floorDrawMode && !frameCapture && <div className="mb-3 border border-[rgba(255,196,84,.4)] bg-[rgba(255,196,84,.07)] p-3 px-[12px] text-[10px] text-[#ffc454]">Captura un frame en el paso 03 para poder trazar el contorno sobre el video.</div>}
      {addMode && <div className="mb-3 border border-[rgba(212,255,112,.4)] bg-[rgba(212,255,112,.07)] p-3 px-[12px] text-[10px] text-[#d4ff70]">Modo añadir: hacé clic en el video (arriba) o en el plano (abajo) para colocar una góndola. Pulsa el botón de nuevo para salir.</div>}
      {saveState && <div className="mt-3 text-[10px] text-[#d4ff70]">{saveState}</div>}
      {floor.outline?.length >= 3 && <div className="mb-3 mt-3 flex items-center gap-3 border border-[rgba(91,157,255,.35)] bg-[rgba(91,157,255,.07)] p-3 px-[12px] text-[9px] text-[#9db8d4]"><b className="text-[#5b9dff]">Contorno del piso trazado ({floor.outline.length} puntos)</b><span className="flex-1">solo referencia visual, no se guarda — al cerrar o salir de la sede desaparece.</span><button className="cursor-pointer border border-[rgba(91,157,255,.4)] bg-transparent p-2 px-[10px] text-[9px] text-[#9db8d4] hover:border-[#5b9dff] hover:text-[#5b9dff]" onClick={clearOutline}>Borrar contorno</button></div>}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_280px] max-[980px]:grid-cols-[minmax(0,1fr)]">
        <div
          className="relative my-[18px] h-auto w-[calc(100%-20px)] min-h-[460px] max-h-none overflow-hidden border border-[#315148] bg-[repeating-linear-gradient(0deg,transparent_0_31px,rgba(111,177,150,.07)_32px),repeating-linear-gradient(90deg,transparent_0_31px,rgba(111,177,150,.07)_32px),#091512] self-center touch-none select-none max-[760px]:my-3 max-[760px]:mx-auto max-[760px]:w-[calc(100%-24px)]"
          ref={canvasRef}
          style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
          onPointerDown={(event) => {
            if (!addMode) return
            const rect = canvasRef.current.getBoundingClientRect()
            addGondolaAt((event.clientX - rect.left) / rect.width * floor.width, (event.clientY - rect.top) / rect.height * floor.depth)
          }}
          onPointerMove={movePointer}
          onPointerUp={() => { pointer.current = null; setDragInfo(null) }}
          onPointerCancel={() => { pointer.current = null; setDragInfo(null) }}
        >
          {/* Grid overlay for snap reference */}
          {snapEnabled && (
            <svg className="pointer-events-none absolute inset-0 z-[1] h-full w-full" viewBox={`0 0 ${floor.width} ${floor.depth}`} preserveAspectRatio="none">
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
            return <div className="pointer-events-none absolute border border-dashed border-[rgba(97,222,192,.22)] bg-[rgba(97,222,192,.03)]" key={zone.id} style={{ left: `${Math.min(...xs) / floor.width * 100}%`, top: `${Math.min(...zs) / floor.depth * 100}%`, width: `${(Math.max(...xs) - Math.min(...xs)) / floor.width * 100}%`, height: `${(Math.max(...zs) - Math.min(...zs)) / floor.depth * 100}%` }}><span className="absolute top-[5px] left-[6px] whitespace-nowrap rounded-[3px] bg-[rgba(6,15,13,.72)] px-[5px] py-[2px] text-[8px] font-semibold font-[ui-monospace,monospace] uppercase tracking-[.03em] text-[rgba(160,205,187,.8)]">{zone.name}</span></div>
          })}
          {floor.outline?.length >= 3 && (
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${floor.width} ${floor.depth}`} preserveAspectRatio="none">
              <polygon points={floor.outline.map(([x, z]) => `${x},${z}`).join(' ')} fill="rgba(91,157,255,.12)" stroke="#5b9dff" strokeWidth="0.07" strokeDasharray="0.18 0.1" strokeLinejoin="round" />
              <text x={floor.outline[0][0]} y={floor.outline[0][1]} fill="#5b9dff" fontSize="0.25">PISO</text>
            </svg>
          )}
          {configuration.gondolas.map((item) => {
            const isSelected = selectedId === item.id
            const isDragging = dragInfo && pointer.current?.item?.id === item.id
            return (
              <div
                className={`absolute grid min-w-[25px] min-h-[20px] touch-none place-items-center border border-[#5c8878] bg-[#264c41] p-0 text-[#dcebe5] shadow-[0_4px_15px_rgba(0,0,0,.25)] transition-shadow duration-150 hover:z-[2] hover:border-[#d4ff70] hover:bg-[#355e50] hover:shadow-[0_4px_20px_rgba(212,255,112,.15)] ${isSelected ? 'z-[2] border-[#d4ff70] bg-[#355e50] shadow-[0_4px_20px_rgba(212,255,112,.15)]' : ''}`}
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
                <span className="pointer-events-none max-w-[90%] overflow-hidden text-ellipsis whitespace-nowrap text-[8px] font-semibold font-[ui-monospace,monospace]">{item.name}</span>
                <span className="pointer-events-none absolute bottom-[-16px] left-1/2 -translate-x-1/2 whitespace-nowrap border border-[rgba(97,222,192,.12)] bg-[rgba(9,21,18,.85)] px-1 py-[1px] text-[7px] font-medium font-[ui-monospace,monospace] text-[#7a9b8e]">{item.width.toFixed(1)}×{item.depth.toFixed(1)}m</span>
                <i className="after:absolute after:top-full after:left-1/2 after:h-[13px] after:w-px after:-translate-x-1/2 after:bg-[#d4ff70] after:content-[''] absolute right-auto bottom-auto top-[-24px] left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab touch-none rounded-full border border-[#d4ff70] bg-[#142a23] active:cursor-grabbing" onPointerDown={(event) => startPointer(event, item, 'rotate')} title="Rotar" />
                <i className="absolute -right-px -bottom-px h-4 w-4 touch-none bg-[linear-gradient(135deg,transparent_45%,#d4ff70_46%_55%,transparent_56%)] cursor-nwse-resize" onPointerDown={(event) => startPointer(event, item, 'resize')} />
              </div>
            )
          })}
          {!configuration.gondolas.length && <button className="absolute inset-[35%] grid cursor-pointer place-items-center border border-dashed border-[#49675c] bg-[rgba(9,21,18,.8)] text-[10px] text-[#d4ff70]" onClick={addGondola}>＋ Dibuja tu primera góndola</button>}
        </div>
        <aside className="min-w-0 border-l border-[rgba(206,236,221,.14)] bg-[#0a1512] p-[25px] max-[980px]:border-l-0 max-[980px]:border-t max-[980px]:border-t-[rgba(206,236,221,.14)] max-[760px]:p-[20px] max-[760px]:px-[14px] max-[760px]:py-[20px]">
          {selected ? <><div className="mb-5 flex items-center justify-between gap-[10px]"><span className="text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">GÓNDOLA SELECCIONADA</span><button className="cursor-pointer border border-[rgba(255,107,61,.3)] bg-transparent p-2 px-[10px] text-[9px] whitespace-nowrap text-[#ff876a] hover:border-[#ff6b3d] hover:text-[#ff6b3d]" onClick={removeGondola}>Eliminar</button></div><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">Nombre<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-[10px] text-[#eaf3ee] outline-none" value={selected.name} onChange={(event) => updateGondola(selected.id, { name: event.target.value })} /></label><div className="my-[13px] mb-[24px] grid grid-cols-3 gap-2 max-[760px]:gap-1"><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">X<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-2 px-[5px] text-[#eaf3ee] outline-none max-[760px]:text-[7px]" type="number" step="0.1" value={selected.x} onChange={(event) => updateGondola(selected.id, { x: Number(event.target.value) })} /></label><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">Z<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-2 px-[5px] text-[#eaf3ee] outline-none max-[760px]:text-[7px]" type="number" step="0.1" value={selected.z} onChange={(event) => updateGondola(selected.id, { z: Number(event.target.value) })} /></label><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">Ancho<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-2 px-[5px] text-[#eaf3ee] outline-none max-[760px]:text-[7px]" type="number" step="0.1" value={selected.width} onChange={(event) => updateGondola(selected.id, { width: Number(event.target.value) })} /></label><label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">Fondo<input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-2 px-[5px] text-[#eaf3ee] outline-none max-[760px]:text-[7px]" type="number" step="0.1" value={selected.depth} onChange={(event) => updateGondola(selected.id, { depth: Number(event.target.value) })} /></label></div>

      {/* Altura y niveles del estante */}
      <span className="mb-3 block text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">ALTURA Y NIVELES</span>
      <div className="my-[13px] mb-[24px] grid grid-cols-3 gap-2 max-[760px]:gap-1">
        <label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]">
          Altura total
          <input
            className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-2 px-[5px] text-[#eaf3ee] outline-none max-[760px]:text-[7px]"
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
      <div className="my-0 mb-[24px] grid grid-cols-3 gap-2">
        {TIERS.map(([label, min, max, fallback], index) => (
          <label className="relative grid gap-[5px] uppercase text-[8px] text-[#71877e]" key={label}>
            {label}
            <input
              className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] py-2 px-[6px] pr-[22px] text-[#eaf3ee] outline-none"
              type="number"
              step="0.05"
              min={min}
              max={max}
              value={selected.tier_heights?.[index] ?? fallback}
              onChange={(event) => {
                const tier_heights = [...(selected.tier_heights || DEFAULT_TIER_HEIGHTS)]
                tier_heights[index] = Number(event.target.value)
                updateGondola(selected.id, { tier_heights })
              }}
            />
            <small className="absolute right-2 bottom-[11px] text-[8px] text-[#61dec0]">m</small>
          </label>
        ))}
      </div>

      <span className="mb-3 block text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#61dec0]">PRODUCTOS POR SEGMENTO</span><div className="mt-[10px] grid grid-cols-3 gap-[5px]">{rows.map((row, rowIndex) => columns.map((column, columnIndex) => <label className="relative grid max-[760px]:p-[5px] gap-[5px] border border-[rgba(206,236,221,.14)] bg-[#0d1a16] p-[7px] uppercase text-[8px] text-[#71877e]" key={`${row}-${column}`}><small className="h-[18px] text-[6px] leading-[1.35] text-[#60766d]">{row} · {column}</small><input className="min-w-0 w-full border border-[rgba(206,236,221,.14)] bg-[#101e1a] p-[7px] px-[5px] text-[8px] normal-case text-[#eaf3ee] outline-none max-[760px]:text-[7px]" value={selected.products?.[rowIndex]?.[columnIndex] || ''} placeholder="Producto" onChange={(event) => updateProduct(rowIndex, columnIndex, event.target.value)} /></label>))}</div></> : <div className="grid h-full place-items-center text-center text-[11px] leading-[1.7] text-[#6c8179]">Selecciona una góndola para configurar sus segmentos y productos.</div>}
        </aside>
      </div>
    </section>
  )
}

export default PlanogramEditor