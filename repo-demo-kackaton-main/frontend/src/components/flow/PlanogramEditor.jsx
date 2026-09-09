import { useEffect, useMemo, useRef, useState } from 'react'
import LiveAlignment from './LiveAlignment'
import { ROWS as rows, COLUMNS as columns, emptyProducts } from '../../utils/constants'
import { pointInPolygon, nearestPointInPolygon, drawFloorOutline } from '../../utils/floorOutline'
import { gondolaCorners, inverseHomography, projectFloor } from '../../utils/homography'
import { hexToRgba } from '../../utils/format'

const GRID_SNAP = 0.25

const ZONE_STATUS = {
  none: { label: 'sin zona definida', dot: '', color: '#8aa39a' },
  in: { label: 'dentro de zona', dot: '✅', color: '#d4ff70' },
  partial: { label: 'parcialmente fuera de zona', dot: '⚠️', color: '#ffb454' },
  out: { label: 'fuera de zona', dot: '⚠️', color: '#ff6b3d' },
}

function snapToGrid(value, gridSize = GRID_SNAP) {
  return Math.round(value / gridSize) * gridSize
}

// Mini-preview live del video para mobile/tablet: dibuja el frame con las góndolas
// proyectadas a baja resolución, así redibujar en cada drag es barato y el usuario ve
// el resultado en tiempo real mientras edita el plano.
function PlanPreview({ frameCapture, configuration, selectedId, zone, onPreviewClick }) {
  const ref = useRef(null)
  const floor = configuration.floor || {}
  const camera = configuration.camera || {}
  const inverse = inverseHomography(camera) || null

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !frameCapture || !inverse) return
    const W = 340
    const H = Math.round(W * (frameCapture.height / frameCapture.width))
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(image, 0, 0, W, H)
      ctx.fillStyle = 'rgba(4, 10, 8, .3)'
      ctx.fillRect(0, 0, W, H)
      const toPx = (x, z) => {
        const normalized = projectFloor(inverse, x, z)
        return normalized ? [normalized[0] * W, normalized[1] * H] : null
      }
      if (zone && zone.length > 1) {
        ctx.beginPath()
        ctx.moveTo(zone[0][0] * W, zone[0][1] * H)
        zone.slice(1).forEach(([x, y]) => ctx.lineTo(x * W, y * H))
        if (zone.length >= 3) {
          ctx.closePath()
          ctx.fillStyle = 'rgba(255, 91, 18, .14)'
          ctx.fill()
        }
        ctx.strokeStyle = 'rgba(255, 91, 18, .95)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      const outline = floor.outline
      if (outline && outline.length > 1) drawFloorOutline(ctx, outline, toPx, 'ZONA')
      ;(configuration.gondolas || []).forEach((gondola) => {
        const color = gondola.color || '#61dec0'
        const pixels = gondolaCorners(gondola).map(([x, z]) => toPx(x, z)).filter(Boolean)
        if (pixels.length < 4) return
        ctx.beginPath()
        ctx.moveTo(...pixels[0])
        pixels.slice(1).forEach((point) => ctx.lineTo(...point))
        ctx.closePath()
        ctx.fillStyle = hexToRgba(color, .18)
        ctx.fill()
        ctx.strokeStyle = selectedId === gondola.id ? '#ff876a' : color
        ctx.lineWidth = selectedId === gondola.id ? 3 : 1.2
        ctx.stroke()
      })
    }
    image.src = frameCapture.dataUrl
  }, [frameCapture, configuration, inverse, floor.outline, selectedId, zone])

  if (!frameCapture) {
    return <div className="grid place-items-center border border-dashed border-[#49675c] bg-[rgba(9,21,18,.8)] px-3 py-4 text-center text-[9px] leading-[1.6] text-[#b9d7f1]">Captura un frame en “Calibrar cámara” para ver el preview del video.</div>
  }

  return (
    <button
      type="button"
      onClick={onPreviewClick}
      className="block w-full cursor-pointer border border-[#2f80ff]/35 bg-[#08120f] p-1 text-left active:opacity-90"
      title="Tocar para ver el video en grande"
    >
      <canvas ref={ref} className="block h-auto w-full" style={{ aspectRatio: `${frameCapture.width}/${frameCapture.height}` }} />
      <span className="block px-2 py-1 text-[9px] font-semibold font-[ui-monospace,monospace] uppercase tracking-[.12em] text-[#ff9a3d]">Video en vivo · tocar para ver en grande</span>
    </button>
  )
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
  const [tab, setTab] = useState('video')
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
    let minX = Math.min(...allXs) - 0.6
    let maxX = Math.max(...allXs) + 0.6
    let minZ = Math.min(...allZs) - 0.6
    let maxZ = Math.max(...allZs) + 0.6
    // Fuerza la proporción real de la sede (anchoSede/fondoSede): expande el eje
    // sobrante para que ventana de dibujo y contenedor compartan el mismo aspect y
    // las góndolas no se deformen (1m en X = 1m en Z).
    const vw = maxX - minX
    const vd = maxZ - minZ
    const floorRatio = Math.max(0.01, floor.width) / Math.max(0.01, floor.depth)
    if (vw / vd < floorRatio) {
      const newVw = vd * floorRatio
      const cx = (minX + maxX) / 2
      minX = cx - newVw / 2
      maxX = cx + newVw / 2
    } else {
      const newVd = vw / floorRatio
      const cz = (minZ + maxZ) / 2
      minZ = cz - newVd / 2
      maxZ = cz + newVd / 2
    }
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
  // Inputs numéricos de la góndola seleccionada. `rotation` se maneja en grados en todo
  // el stack (drag, CSS y backend), SIN conversión a radianes aquí; la conversión deg→rad
  // solo ocurre al proyectar (`gondolaCorners`). No se aplica snap al escribir a mano.
  const commitNumeric = (field, rawValue) => {
    if (rawValue === '') return
    const num = Number(rawValue)
    if (!Number.isFinite(num)) return
    let value = Math.round(num * 100) / 100
    if (field === 'rotation') {
      value = ((value % 360) + 360) % 360
      updateGondola(selected.id, { rotation: value })
      return
    }
    if (field === 'width') {
      value = Math.min(view.maxX - selected.x, Math.max(0.5, value))
    } else if (field === 'depth') {
      value = Math.min(view.maxZ - selected.z, Math.max(0.4, value))
    } else if (field === 'x') {
      value = Math.min(view.maxX - selected.width, Math.max(view.minX, value))
    } else if (field === 'z') {
      value = Math.min(view.maxZ - selected.depth, Math.max(view.minZ, value))
    }
    updateGondola(selected.id, { [field]: Math.round(value * 100) / 100 })
  }
  // Estado de la góndola respecto a la zona: muestrea centro + 4 esquinas + 4 puntos
  // medios del footprint rotado. Umbral de tolerancia para no marcar ⚠️ por un borde
  // que apenas asoma; si el centro está fuera sí es "fuera de zona".
  const gondolaZoneStatus = (item) => {
    if (!polygon) return { level: 'none' }
    const corners = gondolaCorners(item)
    const mids = corners.map((corner, index) => [
      (corner[0] + corners[(index + 1) % 4][0]) / 2,
      (corner[1] + corners[(index + 1) % 4][1]) / 2,
    ])
    const center = [item.x + item.width / 2, item.z + item.depth / 2]
    const samples = [center, ...corners, ...mids].map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100])
    const inside = samples.filter(([x, z]) => pointInPolygon(x, z, polygon)).length
    const fraction = inside / samples.length
    if (!pointInPolygon(center[0], center[1], polygon)) return { level: 'out', fraction }
    if (fraction >= 0.95) return { level: 'in', fraction }
    return { level: 'partial', fraction }
  }
  const selectedStatus = selected ? gondolaZoneStatus(selected) : null

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
    <section className="m-0 w-full min-w-0 overflow-hidden rounded-xl border border-[#2f80ff]/35 bg-[radial-gradient(circle_at_88%_8%,rgba(255,107,29,.18),transparent_28%),radial-gradient(circle_at_16%_86%,rgba(34,147,255,.20),transparent_30%),linear-gradient(135deg,#071323,#0b2138_58%,#06111f)] p-0 shadow-[0_24px_70px_rgba(7,19,35,.28)]">
      <div className="grid min-h-0 grid-cols-[1fr_auto] items-start gap-[30px] border-b border-white/10 p-[18px] px-[22px] max-[980px]:grid-cols-[1fr] max-[760px]:flex max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:gap-[18px] max-[760px]:p-[18px]">
        <div><span className="inline-flex rounded-full border border-[#ff7a1a]/35 bg-[#ff6b1a]/15 px-3 py-1 text-[10px] font-extrabold font-[ui-monospace,monospace] tracking-[.12em] text-[#ff9a3d]">CONFIGURACION FISICA DE LA SEDE</span><h2 className="mt-[10px] mb-[6px] text-[30px] tracking-[-.04em] text-white">Dibuja tu planograma</h2><p className="m-0 max-w-[520px] text-[11px] leading-[1.6] text-[#b9d7f1]">Anade, arrastra y cambia el tamano de cada gondola. Esta geometria se reutiliza en futuros videos.</p></div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[.06] p-2"><label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">Ancho<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#071323] p-[10px] pr-[24px] text-white outline-none focus:border-[#ff7a1a] max-[760px]:w-full" type="number" min="2" step="0.5" value={floor.width} onChange={(event) => changeFloor('width', event.target.value)} /><small className="absolute right-2 bottom-[11px] text-[#6bd5ff]">m</small></label><label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">Fondo<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#071323] p-[10px] pr-[24px] text-white outline-none focus:border-[#ff7a1a] max-[760px]:w-full" type="number" min="2" step="0.5" value={floor.depth} onChange={(event) => changeFloor('depth', event.target.value)} /><small className="absolute right-2 bottom-[11px] text-[#6bd5ff]">m</small></label></div>
        <div className="col-span-full flex flex-wrap justify-start gap-[7px]">
          <button className={`cursor-pointer rounded-lg border border-[#2f80ff]/35 bg-white/[.06] p-[11px] px-[14px] text-[9px] font-bold whitespace-nowrap text-[#d9ecff] shadow-[0_10px_24px_rgba(0,0,0,.12)] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] ${snapEnabled ? 'border-[#6bd5ff] bg-[#1683ff] text-white shadow-[0_12px_24px_rgba(22,131,255,.28)]' : 'hover:border-[#6bd5ff] hover:text-white'}`} onClick={() => setSnapEnabled((value) => !value)} title="Snap a cuadricula de 0.25m">Snap</button>
          <button className={`cursor-pointer rounded-lg border border-[#2f80ff]/35 bg-white/[.06] p-[11px] px-[14px] text-[9px] font-bold whitespace-nowrap text-[#d9ecff] shadow-[0_10px_24px_rgba(0,0,0,.12)] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] ${addMode ? 'border-[#ffb36d] bg-[#ff5b12] text-white shadow-[0_14px_28px_rgba(255,91,18,.32)]' : 'hover:border-[#ff9a3d] hover:text-[#ffb36d]'}`} onClick={() => { setFloorDrawMode(false); setAddMode((value) => !value) }} title="Haz clic sobre el plano o el video para colocarla">+ Anadir gondola</button>
          <button className={`cursor-pointer rounded-lg border border-[#2f80ff]/35 bg-white/[.06] p-[11px] px-[14px] text-[9px] font-bold whitespace-nowrap text-[#d9ecff] shadow-[0_10px_24px_rgba(0,0,0,.12)] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] ${floorDrawMode ? 'border-[#6bd5ff] bg-[rgba(47,128,255,.24)] text-white' : 'hover:border-[#6bd5ff] hover:text-[#6bd5ff]'}`} onClick={() => { setAddMode(false); setFloorDrawMode((value) => !value) }} title="Traza el contorno del piso a mano">Dibujar piso</button>
          <button className="cursor-pointer rounded-lg border border-[#ffb36d] bg-[#ff5b12] p-[11px] px-[15px] text-[9px] font-extrabold whitespace-nowrap text-white shadow-[0_14px_30px_rgba(255,91,18,.28)] max-[760px]:flex-1 max-[760px]:p-[12px] max-[760px]:px-[7px] disabled:cursor-not-allowed disabled:opacity-40" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar plano'}</button>
        </div>
      </div>
      {addMode && <div className="mx-[18px] mb-3 rounded-lg border border-[#ff9a3d]/35 bg-[#ff6b1a]/15 p-3 px-[12px] text-[10px] font-bold text-[#ffb36d]">Modo añadir: hacé clic en el video o en el plano para colocar una góndola. Pulsa el botón de nuevo para salir.</div>}
      {floorDrawMode && !frameCapture && <div className="mx-[18px] mb-3 rounded-lg border border-[#6bd5ff]/35 bg-[#1683ff]/15 p-3 px-[12px] text-[10px] font-bold text-[#b9d7f1]">Captura un frame en el paso 03 para poder trazar el contorno sobre el video.</div>}
      {saveState && <div className="mx-[18px] mt-3 mb-3 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-3 text-[10px] font-bold text-emerald-200">{saveState}</div>}

      <div className="mx-[18px] mb-4 mt-4 flex items-center gap-[7px] rounded-xl border border-white/10 bg-white/[.06] p-1 xl:hidden">
        <button type="button" onClick={() => setTab('video')} className={`cursor-pointer border px-[16px] py-[9px] text-[9px] font-semibold font-[ui-monospace,monospace] uppercase tracking-[.12em] ${tab === 'video' ? 'border-[#ff9a3d] bg-[#ff5b12] text-white' : 'border-[#2f80ff]/30 bg-[#071323] text-[#b9d7f1]'}`}>Video</button>
        <button type="button" onClick={() => setTab('plano')} className={`cursor-pointer border px-[16px] py-[9px] text-[9px] font-semibold font-[ui-monospace,monospace] uppercase tracking-[.12em] ${tab === 'plano' ? 'border-[#ff9a3d] bg-[#ff5b12] text-white' : 'border-[#2f80ff]/30 bg-[#071323] text-[#b9d7f1]'}`}>Plano</button>
      </div>

      <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] xl:items-stretch xl:gap-[24px] xl:px-[18px] xl:pt-4 xl:pb-4">
        <div className={tab === 'video' ? 'block' : 'hidden xl:block'}>
          <div className="mb-5 flex w-full flex-col gap-2 xl:mb-0 xl:min-h-0 xl:justify-center">
            <span className="text-[9px] font-semibold font-[ui-monospace,monospace] uppercase tracking-[.08em] text-[#ff9a3d]">Sobre el frame · plano en vivo — arrastrá y colocá góndolas sobre el video</span>
            <LiveAlignment frameCapture={frameCapture} configuration={configuration} drawMode={floorDrawMode && Boolean(frameCapture)} onDrawCommit={commitOutline} onDrawCancel={() => setFloorDrawMode(false)} interactive onMoveGondola={(id, values) => updateGondola(id, values)} selectedId={selectedId} onSelect={setSelectedId} addMode={addMode} onAddAt={(x, z) => addGondolaAt(x, z)} zone={zone} handOutline={handOutline} />
            <p className="m-0 text-[10px] leading-[1.6] text-[#b9d7f1]">Calibrá las góndolas arrastrándolas sobre el video proyectado o colocá una nueva haciendo clic en «＋ Añadir góndola». Con «▱ Dibujar el piso» trazás el contorno directo sobre este video (no se guarda).</p>
          </div>
        </div>
        <div className={tab === 'plano' ? 'block' : 'hidden xl:block'}>
          <div className="sticky top-2 z-20 mb-3 xl:hidden">
            <PlanPreview frameCapture={frameCapture} configuration={configuration} selectedId={selectedId} zone={zone} onPreviewClick={() => setTab('video')} />
          </div>
          <div className="grid min-h-0 grid-cols-1">
            <div
              className={`relative h-auto w-[calc(100%-20px)] max-w-full overflow-hidden self-center touch-none select-none max-[760px]:my-3 max-[760px]:mx-auto max-[760px]:w-[calc(100%-24px)]${polygon ? '' : ' border border-[#2f80ff]/35'}`}
              ref={canvasRef}
              style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
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
                <rect x={view.minX} y={view.minZ} width={view.width} height={view.depth} fill="#071323" />
                {(() => {
                  const target = view.width / 14
                  const step = target > 5 ? 5 : target > 2 ? 2 : target > 1 ? 1 : target > 0.5 ? 0.5 : 0.25
                  const lines = []
                  for (let x = Math.ceil(view.minX / step) * step; x <= view.maxX + 1e-6; x += step) {
                    lines.push(<line key={`v${x}`} x1={x} y1={view.minZ} x2={x} y2={view.maxZ} stroke="rgba(107,213,255,.10)" strokeWidth="0.05" />)
                  }
                  for (let z = Math.ceil(view.minZ / step) * step; z <= view.maxZ + 1e-6; z += step) {
                    lines.push(<line key={`h${z}`} x1={view.minX} y1={z} x2={view.maxX} y2={z} stroke="rgba(107,213,255,.10)" strokeWidth="0.05" />)
                  }
                  return lines
                })()}
                {snapEnabled && (() => {
                  const lines = []
                  for (let x = Math.ceil(view.minX / GRID_SNAP) * GRID_SNAP; x <= view.maxX + 1e-6; x += GRID_SNAP) {
                    lines.push(<line key={`s${x}`} x1={x} y1={view.minZ} x2={x} y2={view.maxZ} stroke="rgba(255,154,61,.10)" strokeWidth="0.04" />)
                  }
                  for (let z = Math.ceil(view.minZ / GRID_SNAP) * GRID_SNAP; z <= view.maxZ + 1e-6; z += GRID_SNAP) {
                    lines.push(<line key={`s${z}`} x1={view.minX} y1={z} x2={view.maxX} y2={z} stroke="rgba(255,154,61,.10)" strokeWidth="0.04" />)
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
                const zoneLevel = gondolaZoneStatus(item).level
                const outOfZone = zoneLevel === 'out' || zoneLevel === 'partial'
                return (
                  <div
                    className={`absolute grid min-w-[25px] min-h-[20px] touch-none place-items-center border bg-[#0d3150] p-0 text-white shadow-[0_4px_15px_rgba(0,0,0,.25)] transition-shadow duration-150 hover:z-[2] hover:border-[#ff9a3d] hover:bg-[#123f67] hover:shadow-[0_4px_20px_rgba(255,91,18,.18)] ${isSelected ? 'z-[2] border-[#ff9a3d] bg-[#163f5f] shadow-[0_4px_22px_rgba(255,91,18,.35)]' : outOfZone ? 'border-[#ff876a]' : 'border-[#2f80ff]/55'}`}
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
                    <span className="pointer-events-none absolute bottom-[-18px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-[#2f80ff]/25 bg-[#071323]/90 px-1 py-[1px] text-[8px] font-medium font-[ui-monospace,monospace] text-[#b9d7f1]">{item.width.toFixed(1)}×{item.depth.toFixed(1)}m</span>
                    <i className="after:absolute after:top-full after:left-1/2 after:h-[13px] after:w-px after:-translate-x-1/2 after:bg-[#ff9a3d] after:content-[''] absolute right-auto bottom-auto top-[-24px] left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab touch-none rounded-full border border-[#ff9a3d] bg-[#071323] active:cursor-grabbing" onPointerDown={(event) => startPointer(event, item, 'rotate')} title="Rotar" />
                    <i className="absolute -right-px -bottom-px h-4 w-4 touch-none bg-[linear-gradient(135deg,transparent_45%,#ff9a3d_46%_55%,transparent_56%)] cursor-nwse-resize" onPointerDown={(event) => startPointer(event, item, 'resize')} />
                  </div>
                )
              })}
              {!configuration.gondolas.length && <button className="absolute inset-[35%] grid cursor-pointer place-items-center border rounded-xl border-dashed border-[#ff9a3d]/60 bg-[#071323]/85 text-[10px] font-bold text-[#ffb36d]" onClick={addGondola}>＋ Dibuja tu primera góndola</button>}
            </div>
            <aside className="min-w-0 border-t border-[#2f80ff]/25 bg-[#071323]/80 p-[25px] max-[760px]:p-[20px] max-[760px]:px-[14px] max-[760px]:py-[20px]">
              {selected ? <><div className="mb-5 flex items-center justify-between gap-[10px]"><span className="text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#ff9a3d]">GÓNDOLA SELECCIONADA</span><button className="cursor-pointer rounded-lg border border-[#ff9a3d]/40 bg-[#ff5b12]/10 p-2 px-[10px] text-[9px] font-bold whitespace-nowrap text-[#ffb36d] hover:border-[#ff9a3d] hover:bg-[#ff5b12] hover:text-white" onClick={removeGondola}>Eliminar</button></div><label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">Nombre<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[10px] text-white outline-none" value={selected.name} onChange={(event) => updateGondola(selected.id, { name: event.target.value })} /></label>
              <div className="mt-[14px] grid grid-cols-2 gap-[7px]">
                <label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">X (m)<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[9px] text-white outline-none" type="number" step="0.01" value={selected.x} onChange={(event) => commitNumeric('x', event.target.value)} /></label>
                <label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">Y (m)<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[9px] text-white outline-none" type="number" step="0.01" value={selected.z} onChange={(event) => commitNumeric('z', event.target.value)} /></label>
                <label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">Ancho (m)<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[9px] text-white outline-none" type="number" min="0.5" step="0.1" value={selected.width} onChange={(event) => commitNumeric('width', event.target.value)} /></label>
                <label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">Fondo (m)<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[9px] text-white outline-none" type="number" min="0.4" step="0.1" value={selected.depth} onChange={(event) => commitNumeric('depth', event.target.value)} /></label>
                <label className="relative grid gap-[5px] uppercase text-[8px] font-bold text-[#8fb3d9]">Rotación (°)<input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[9px] text-white outline-none" type="number" min="0" max="360" step="1" value={selected.rotation} onChange={(event) => commitNumeric('rotation', event.target.value)} /></label>
              </div>
              <span className="mt-3 mb-4 block text-[10px] font-semibold font-[ui-monospace,monospace]" style={{ color: ZONE_STATUS[selectedStatus.level].color }}>{selected.width.toFixed(2)}×{selected.depth.toFixed(2)}m · {ZONE_STATUS[selectedStatus.level].label} {ZONE_STATUS[selectedStatus.level].dot}</span>
              <span className="mb-3 block text-[10px] font-semibold font-[ui-monospace,monospace] tracking-[.17em] text-[#ff9a3d]">PRODUCTOS POR SEGMENTO</span><div className="mt-[10px] grid max-w-[520px] grid-cols-3 gap-[5px]">{rows.map((row, rowIndex) => columns.map((column, columnIndex) => <label className="relative grid max-[760px]:p-[5px] gap-[5px] rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[7px] uppercase text-[8px] font-bold text-[#8fb3d9]" key={`${row}-${column}`}><small className="h-[18px] text-[6px] leading-[1.35] text-[#8fb3d9]">{row} · {column}</small><input className="min-w-0 w-full rounded-lg border border-[#2f80ff]/25 bg-[#0b2138] p-[7px] px-[5px] text-[8px] normal-case text-white outline-none max-[760px]:text-[7px]" value={selected.products?.[rowIndex]?.[columnIndex] || ''} placeholder="Producto" onChange={(event) => updateProduct(rowIndex, columnIndex, event.target.value)} /></label>))}</div></> : <div className="grid h-full place-items-center text-center text-[11px] leading-[1.7] text-[#b9d7f1]">Selecciona una góndola para configurar sus segmentos y productos.</div>}
            </aside>
          </div>
        </div>
      </div>

      {(handOutline?.length >= 3 || floor.outline?.length >= 3) && <div className="mx-[18px] mb-3 mt-3 flex items-center gap-3 rounded-xl border border-[#2f80ff]/35 bg-[#1683ff]/12 p-3 px-[12px] text-[9px] text-[#b9d7f1]"><b className="text-[#6bd5ff]">{handOutline?.length >= 3 ? `Contorno del piso trazado (${handOutline.length} puntos)` : 'Zona del plano guardada'}</b><span className="flex-1">{handOutline?.length >= 3 ? 'solo referencia visual, no se guarda — al cerrar o salir de la sede desaparece.' : 'define la forma del mapa; el movimiento de las góndolas queda dentro de la zona.'}</span>{handOutline?.length >= 3 && <button className="cursor-pointer border border-[rgba(91,157,255,.4)] bg-transparent p-2 px-[10px] text-[9px] text-[#b9d7f1] hover:border-[#5b9dff] hover:text-[#6bd5ff]" onClick={clearOutline}>Borrar contorno</button>}</div>}
    </section>
  )
}

export default PlanogramEditor
