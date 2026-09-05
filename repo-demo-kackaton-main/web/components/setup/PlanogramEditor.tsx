'use client'

import { useRef, useState } from 'react'
import LiveAlignment from './LiveAlignment'
import { ROWS as rows, COLUMNS as columns, emptyProducts } from '@/lib/constants'

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
  const updateGondola = (id, values) =>
    replaceGondolas(
      configuration.gondolas.map((item) => (item.id === id ? { ...item, ...values } : item)),
    )
  const addGondola = () => {
    const id = `g-${Date.now()}`
    const width = Math.min(3, floor.width - 0.5)
    const depth = 0.7
    const stepX = width + 0.4
    const stepZ = depth + 0.4
    const perRow = Math.max(1, Math.floor((floor.width - 0.5) / stepX))
    const index = configuration.gondolas.length
    const x =
      Math.round(
        Math.min(Math.max(0, floor.width - width), 0.5 + (index % perRow) * stepX) * 100,
      ) / 100
    const z =
      Math.round(
        Math.min(Math.max(0, floor.depth - depth), 0.5 + Math.floor(index / perRow) * stepZ) * 100,
      ) / 100
    const item = {
      id,
      name: `Góndola ${configuration.gondolas.length + 1}`,
      x,
      z,
      width,
      depth,
      rotation: 0,
      segments: { rows, columns },
      products: emptyProducts(),
    }
    replaceGondolas([...configuration.gondolas, item])
    setSelectedId(id)
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
      target_meters: [
        [0, 0],
        [nextFloor.width, 0],
        [nextFloor.width, nextFloor.depth],
        [0, nextFloor.depth],
      ],
    }
    onChange({ ...configuration, floor: nextFloor, camera })
  }
  const startPointer = (event, item, mode) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedId(item.id)
    pointer.current = { mode, startX: event.clientX, startY: event.clientY, item: { ...item } }
  }
  const movePointer = (event) => {
    if (!pointer.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const original = pointer.current.item
    if (pointer.current.mode === 'rotate') {
      const centerPx = [
        rect.left + ((original.x + original.width / 2) / floor.width) * rect.width,
        rect.top + ((original.z + original.depth / 2) / floor.depth) * rect.height,
      ]
      const angle =
        (Math.atan2(event.clientY - centerPx[1], event.clientX - centerPx[0]) * 180) / Math.PI + 90
      updateGondola(original.id, { rotation: Math.round(((angle % 360) + 360) % 360) })
      return
    }
    const dx = ((event.clientX - pointer.current.startX) / rect.width) * floor.width
    const dz = ((event.clientY - pointer.current.startY) / rect.height) * floor.depth
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
    const products = (selected.products?.length ? selected.products : emptyProducts()).map(
      (items) => [...items],
    )
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
    setSaving(true)
    setSaveState('')
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
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">CONFIGURACIÓN FÍSICA DE LA SEDE</span>
          <h2 className="mt-1 text-base font-semibold">Dibuja tu planograma</h2>
          <p className="m-0 text-xs leading-5 text-muted">
            Añade, arrastra y cambia el tamaño de cada góndola. Esta geometría se reutiliza en
            futuros videos.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Ancho
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="2"
                step="0.5"
                value={floor.width}
                onChange={(event) => changeFloor('width', event.target.value)}
                className="w-20 rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm text-ink outline-none focus:border-acid"
              />
              <small className="text-muted">m</small>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Fondo
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="2"
                step="0.5"
                value={floor.depth}
                onChange={(event) => changeFloor('depth', event.target.value)}
                className="w-20 rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm text-ink outline-none focus:border-acid"
              />
              <small className="text-muted">m</small>
            </div>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSnapEnabled((value) => !value)}
            title="Snap a cuadrícula de 0.25m"
            className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
              snapEnabled
                ? 'border-acid text-acid'
                : 'border-line text-muted hover:border-muted hover:text-ink'
            }`}
          >
            ⊞ Snap
          </button>
          <button
            onClick={addGondola}
            className="border border-line px-3 py-1.5 font-mono text-xs text-mint transition-colors hover:border-mint hover:text-mint"
          >
            ＋ Añadir góndola
          </button>
          <button
            onClick={() => setFloorDrawMode((value) => !value)}
            title="Traza el contorno del piso a mano (no se guarda)"
            className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
              floorDrawMode
                ? 'border-ember text-ember'
                : 'border-line text-muted hover:border-muted hover:text-ink'
            }`}
          >
            ▱ Dibujar el piso
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="border border-acid px-3 py-1.5 font-mono text-xs text-acid transition-colors hover:bg-acid hover:text-base disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar plano'}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Sobre el frame · proyección del plano en metros</span>
        <LiveAlignment
          frameCapture={frameCapture}
          configuration={configuration}
          drawMode={floorDrawMode && Boolean(frameCapture)}
          onDrawCommit={commitOutline}
          onDrawCancel={() => setFloorDrawMode(false)}
        />
        <p className="m-0 text-xs leading-5 text-muted">
          Vista en vivo del planograma sobre el frame capturado. Las góndolas se editan en el plano
          de abajo. Con «▱ Dibujar el piso» trazás el contorno directo sobre este video.
        </p>
      </div>
      {floorDrawMode && !frameCapture && (
        <div className="rounded-lg border border-ember/40 bg-ember/10 px-4 py-2 text-xs text-ember">
          Captura un frame en el paso 03 para poder trazar el contorno sobre el video.
        </div>
      )}
      {saveState && (
        <div className="rounded-lg border border-mint/40 bg-mint/10 px-4 py-2 text-xs text-mint">
          {saveState}
        </div>
      )}
      {floor.outline?.length >= 3 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-400/40 bg-blue-400/10 px-4 py-2 text-xs text-blue-200">
          <b>Contorno del piso trazado ({floor.outline.length} puntos)</b>
          <span className="text-muted">
            solo referencia visual, no se guarda — al cerrar o salir de la sede desaparece.
          </span>
          <button
            className="ml-auto border border-line px-3 py-1 text-xs transition-colors hover:border-muted"
            onClick={clearOutline}
          >
            Borrar contorno
          </button>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-[1fr_320px]">
        <div
          className={`relative overflow-hidden rounded-2xl border border-line bg-panel2 ${
            pointer.current ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          ref={canvasRef}
          style={{ aspectRatio: `${floor.width}/${floor.depth}` }}
          onPointerMove={movePointer}
          onPointerUp={() => {
            pointer.current = null
            setDragInfo(null)
          }}
          onPointerCancel={() => {
            pointer.current = null
            setDragInfo(null)
          }}
        >
          {snapEnabled && (
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`0 0 ${floor.width} ${floor.depth}`}
              preserveAspectRatio="none"
            >
              {Array.from(
                { length: Math.floor(floor.width / GRID_SNAP) + 1 },
                (_, i) => i * GRID_SNAP,
              ).map((x) => (
                <line
                  key={`v${x}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={floor.depth}
                  stroke="rgba(97,222,192,.06)"
                  strokeWidth="0.05"
                />
              ))}
              {Array.from(
                { length: Math.floor(floor.depth / GRID_SNAP) + 1 },
                (_, i) => i * GRID_SNAP,
              ).map((z) => (
                <line
                  key={`h${z}`}
                  x1={0}
                  y1={z}
                  x2={floor.width}
                  y2={z}
                  stroke="rgba(97,222,192,.06)"
                  strokeWidth="0.05"
                />
              ))}
            </svg>
          )}
          {configuration.zones?.map((zone) => {
            const xs = zone.polygon.map(([x]) => x)
            const zs = zone.polygon.map(([, z]) => z)
            return (
              <div
                className="pointer-events-none absolute border border-dashed border-mint/50 p-1.5"
                key={zone.id}
                style={{
                  left: `${(Math.min(...xs) / floor.width) * 100}%`,
                  top: `${(Math.min(...zs) / floor.depth) * 100}%`,
                  width: `${((Math.max(...xs) - Math.min(...xs)) / floor.width) * 100}%`,
                  height: `${((Math.max(...zs) - Math.min(...zs)) / floor.depth) * 100}%`,
                }}
              >
                <span className="font-mono text-[10px] text-mint">{zone.name}</span>
              </div>
            )
          })}
          {floor.outline?.length >= 3 && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${floor.width} ${floor.depth}`}
              preserveAspectRatio="none"
            >
              <polygon
                points={floor.outline.map(([x, z]) => `${x},${z}`).join(' ')}
                fill="rgba(91,157,255,.12)"
                stroke="#5b9dff"
                strokeWidth="0.07"
                strokeDasharray="0.18 0.1"
                strokeLinejoin="round"
              />
              <text x={floor.outline[0][0]} y={floor.outline[0][1]} fill="#5b9dff" fontSize="0.3">
                PISO
              </text>
            </svg>
          )}
          {configuration.gondolas.map((item) => {
            const isSelected = selectedId === item.id
            const isDragging = dragInfo && pointer.current?.item?.id === item.id
            return (
              <div
                className={`absolute flex flex-col items-center justify-center gap-1 border-2 ${
                  isSelected ? 'z-10 border-acid bg-acid/10' : 'border-mint/60 bg-panel'
                } ${isDragging ? 'z-20 opacity-90' : ''}`}
                key={item.id}
                style={{
                  left: `${(item.x / floor.width) * 100}%`,
                  top: `${(item.z / floor.depth) * 100}%`,
                  width: `${(item.width / floor.width) * 100}%`,
                  height: `${(item.depth / floor.depth) * 100}%`,
                  transform: `rotate(${item.rotation || 0}deg)`,
                }}
                onPointerDown={(event) => startPointer(event, item, 'move')}
              >
                <span className="max-w-full truncate px-1.5 text-center font-mono text-[10px] text-ink">
                  {item.name}
                </span>
                <span className="font-mono text-[9px] text-muted">
                  {item.width.toFixed(1)}×{item.depth.toFixed(1)}m
                </span>
                <i
                  className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-acid bg-base"
                  onPointerDown={(event) => startPointer(event, item, 'rotate')}
                  title="Rotar"
                />
                <i
                  className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize border-b-2 border-r-2 border-acid"
                  onPointerDown={(event) => startPointer(event, item, 'resize')}
                />
              </div>
            )
          })}
          {!configuration.gondolas.length && (
            <button
              onClick={addGondola}
              className="absolute inset-0 m-auto h-fit w-fit border border-dashed border-mint/50 px-5 py-2.5 text-sm text-mint transition-colors hover:border-mint hover:bg-mint/10"
            >
              ＋ Dibuja tu primera góndola
            </button>
          )}
        </div>
        <aside className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <span className="eyebrow">GÓNDOLA SELECCIONADA</span>
                <button
                  onClick={removeGondola}
                  className="border border-ember/50 px-2 py-1 text-xs text-ember transition-colors hover:bg-ember/10"
                >
                  Eliminar
                </button>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Nombre
                <input
                  value={selected.name}
                  onChange={(event) => updateGondola(selected.id, { name: event.target.value })}
                  className="rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm text-ink outline-none focus:border-acid"
                />
              </label>

              <span className="eyebrow">ALTURA Y NIVELES</span>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Altura total
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      max="3.0"
                      value={selected.height ?? 1.45}
                      onChange={(event) =>
                        updateGondola(selected.id, { height: Number(event.target.value) })
                      }
                      className="w-full rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm text-ink outline-none focus:border-acid"
                    />
                    <small>m</small>
                  </div>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Nivel 1 (bajo)
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1.5"
                      value={selected.tier_heights?.[0] ?? 0.25}
                      onChange={(event) => {
                        const tier_heights = [...(selected.tier_heights || [0.25, 0.73, 1.2])]
                        tier_heights[0] = Number(event.target.value)
                        updateGondola(selected.id, { tier_heights })
                      }}
                      className="w-full rounded-md border border-line bg-panel2 px-1.5 py-1 text-sm text-ink outline-none focus:border-acid"
                    />
                    <small>m</small>
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Nivel 2 (medio)
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="2.0"
                      value={selected.tier_heights?.[1] ?? 0.73}
                      onChange={(event) => {
                        const tier_heights = [...(selected.tier_heights || [0.25, 0.73, 1.2])]
                        tier_heights[1] = Number(event.target.value)
                        updateGondola(selected.id, { tier_heights })
                      }}
                      className="w-full rounded-md border border-line bg-panel2 px-1.5 py-1 text-sm text-ink outline-none focus:border-acid"
                    />
                    <small>m</small>
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Nivel 3 (alto)
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="2.5"
                      value={selected.tier_heights?.[2] ?? 1.2}
                      onChange={(event) => {
                        const tier_heights = [...(selected.tier_heights || [0.25, 0.73, 1.2])]
                        tier_heights[2] = Number(event.target.value)
                        updateGondola(selected.id, { tier_heights })
                      }}
                      className="w-full rounded-md border border-line bg-panel2 px-1.5 py-1 text-sm text-ink outline-none focus:border-acid"
                    />
                    <small>m</small>
                  </div>
                </label>
              </div>

              <span className="eyebrow">PRODUCTOS POR SEGMENTO</span>
              <div className="grid grid-cols-3 gap-3">
                {rows.map((row, rowIndex) =>
                  columns.map((column, columnIndex) => (
                    <label
                      key={`${row}-${column}`}
                      className="flex flex-col gap-1 text-[10px] text-muted"
                    >
                      <small className="font-mono">
                        {row} · {column}
                      </small>
                      <input
                        value={selected.products?.[rowIndex]?.[columnIndex] || ''}
                        placeholder="Producto"
                        onChange={(event) =>
                          updateProduct(rowIndex, columnIndex, event.target.value)
                        }
                        className="rounded-md border border-line bg-panel2 px-1.5 py-1 text-xs text-ink outline-none focus:border-acid"
                      />
                    </label>
                  )),
                )}
              </div>
            </>
          ) : (
            <div className="px-2 py-10 text-center text-sm text-muted">
              Selecciona una góndola para configurar sus segmentos y productos.
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export default PlanogramEditor