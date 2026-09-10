import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import LiveAlignment from './LiveAlignment'

import {
  ROWS as rows,
  COLUMNS as columns,
  emptyProducts,
} from '../../utils/constants'

import {
  pointInPolygon,
  nearestPointInPolygon,
  drawFloorOutline,
} from '../../utils/floorOutline'

import {
  gondolaCorners,
  inverseHomography,
  projectFloor,
} from '../../utils/homography'

import { hexToRgba } from '../../utils/format'

const GRID_SNAP = 0.25

const ZONE_STATUS = {
  none: {
    label: 'sin zona definida',
    dot: '',
    color: '#718096',
  },

  in: {
    label: 'dentro de zona',
    dot: '✅',
    color: '#16a765',
  },

  partial: {
    label: 'parcialmente fuera de zona',
    dot: '⚠️',
    color: '#e58b14',
  },

  out: {
    label: 'fuera de zona',
    dot: '⚠️',
    color: '#e85b37',
  },
}

function snapToGrid(
  value,
  gridSize = GRID_SNAP
) {
  return (
    Math.round(value / gridSize) *
    gridSize
  )
}

/* =========================================================
   PREVIEW MÓVIL
========================================================= */

function PlanPreview({
  frameCapture,
  configuration,
  selectedId,
  zone,
  onPreviewClick,
}) {
  const ref = useRef(null)

  const floor =
    configuration.floor || {}

  const camera =
    configuration.camera || {}

  const inverse =
    inverseHomography(camera) ||
    null

  useEffect(() => {
    const canvas =
      ref.current

    if (
      !canvas ||
      !frameCapture ||
      !inverse
    ) {
      return
    }

    const W = 340

    const H = Math.round(
      W *
        (
          frameCapture.height /
          frameCapture.width
        )
    )

    canvas.width = W
    canvas.height = H

    const ctx =
      canvas.getContext('2d')

    const image =
      new Image()

    image.onload = () => {
      ctx.clearRect(
        0,
        0,
        W,
        H
      )

      ctx.drawImage(
        image,
        0,
        0,
        W,
        H
      )

      ctx.fillStyle =
        'rgba(5, 24, 47, .16)'

      ctx.fillRect(
        0,
        0,
        W,
        H
      )

      const toPx = (
        x,
        z
      ) => {
        const normalized =
          projectFloor(
            inverse,
            x,
            z
          )

        return normalized
          ? [
              normalized[0] * W,
              normalized[1] * H,
            ]
          : null
      }

      if (
        zone &&
        zone.length > 1
      ) {
        ctx.beginPath()

        ctx.moveTo(
          zone[0][0] * W,
          zone[0][1] * H
        )

        zone
          .slice(1)
          .forEach(
            ([x, y]) =>
              ctx.lineTo(
                x * W,
                y * H
              )
          )

        if (
          zone.length >= 3
        ) {
          ctx.closePath()

          ctx.fillStyle =
            'rgba(255, 91, 18, .14)'

          ctx.fill()
        }

        ctx.strokeStyle =
          'rgba(255, 91, 18, .95)'

        ctx.lineWidth = 2

        ctx.stroke()
      }

      const outline =
        floor.outline

      if (
        outline &&
        outline.length > 1
      ) {
        drawFloorOutline(
          ctx,
          outline,
          toPx,
          'ZONA'
        )
      }

      ;(
        configuration.gondolas ||
        []
      ).forEach(
        (gondola) => {
          const color =
            gondola.color ||
            '#1686e8'

          const pixels =
            gondolaCorners(
              gondola
            )
              .map(
                ([x, z]) =>
                  toPx(
                    x,
                    z
                  )
              )
              .filter(Boolean)

          if (
            pixels.length < 4
          ) {
            return
          }

          ctx.beginPath()

          ctx.moveTo(
            ...pixels[0]
          )

          pixels
            .slice(1)
            .forEach(
              (point) =>
                ctx.lineTo(
                  ...point
                )
            )

          ctx.closePath()

          ctx.fillStyle =
            hexToRgba(
              color,
              0.18
            )

          ctx.fill()

          ctx.strokeStyle =
            selectedId ===
            gondola.id
              ? '#ff641f'
              : color

          ctx.lineWidth =
            selectedId ===
            gondola.id
              ? 3
              : 1.2

          ctx.stroke()
        }
      )
    }

    image.src =
      frameCapture.dataUrl
  }, [
    frameCapture,
    configuration,
    inverse,
    floor.outline,
    selectedId,
    zone,
  ])

  if (!frameCapture) {
    return (
      <div
        className="
          grid
          place-items-center
          rounded-[10px]
          border
          border-dashed
          border-[#c9dcec]
          bg-[#f6faff]
          px-3
          py-4
          text-center
          text-[9px]
          font-semibold
          leading-[1.6]
          text-[#718096]
        "
      >
        Captura un frame en “Calibrar cámara”
        para ver el preview del video.
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={
        onPreviewClick
      }
      className="
        block
        w-full
        cursor-pointer
        overflow-hidden
        rounded-[10px]
        border
        border-[#c9dcec]
        bg-white
        p-1
        text-left
        shadow-sm
        active:opacity-90
      "
      title="Tocar para ver el video en grande"
    >
      <canvas
        ref={ref}
        className="
          block
          h-auto
          w-full
          rounded-[7px]
        "
        style={{
          aspectRatio:
            `${frameCapture.width}/${frameCapture.height}`,
        }}
      />

      <span
        className="
          block
          px-2
          py-1.5
          text-[8px]
          font-black
          uppercase
          tracking-[.12em]
          text-[#1686e8]
        "
      >
        Video en vivo · tocar para ver en grande
      </span>
    </button>
  )
}

/* =========================================================
   EDITOR
========================================================= */

function PlanogramEditor({
  configuration,
  onChange,
  onSave,
  frameCapture,
  zone,
}) {
  const [
    selectedId,
    setSelectedId,
  ] = useState(
    configuration.gondolas[0]?.id ||
      null
  )

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    saveState,
    setSaveState,
  ] = useState('')

  const [
    snapEnabled,
    setSnapEnabled,
  ] = useState(true)

  const [
    floorDrawMode,
    setFloorDrawMode,
  ] = useState(false)

  const [
    addMode,
    setAddMode,
  ] = useState(false)

  const [
    handOutline,
    setHandOutline,
  ] = useState(null)

  const [
    dragInfo,
    setDragInfo,
  ] = useState(null)

  const [
    tab,
    setTab,
  ] = useState('video')

  const canvasRef =
    useRef(null)

  const pointer =
    useRef(null)

  const floor =
    configuration.floor

  const polygon =
    floor.outline?.length >= 3 &&
    floor.outline.every(
      ([x, z]) =>
        Number.isFinite(x) &&
        Number.isFinite(z)
    )
      ? floor.outline
      : null

  const sketchZones =
    useMemo(() => {
      const base =
        configuration.zones || []

      if (!polygon) {
        return base
      }

      const xs =
        polygon.map(
          ([x]) => x
        )

      const zs =
        polygon.map(
          ([, z]) => z
        )

      const minX =
        Math.min(...xs)

      const maxX =
        Math.max(...xs)

      const minZ =
        Math.min(...zs)

      const maxZ =
        Math.max(...zs)

      const zw =
        Math.max(
          0.01,
          maxX - minX
        )

      const zd =
        Math.max(
          0.01,
          maxZ - minZ
        )

      return base.map(
        (zoneItem) => ({
          ...zoneItem,

          polygon:
            (
              zoneItem.polygon ||
              []
            ).map(
              ([x, z]) => [
                Math.round(
                  (
                    minX +
                    (
                      x /
                      floor.width
                    ) *
                      zw
                  ) *
                    100
                ) / 100,

                Math.round(
                  (
                    minZ +
                    (
                      z /
                      floor.depth
                    ) *
                      zd
                  ) *
                    100
                ) / 100,
              ]
            ),
        })
      )
    }, [
      polygon,
      configuration.zones,
      floor.width,
      floor.depth,
    ])

  const selected =
    configuration.gondolas.find(
      (item) =>
        item.id ===
        selectedId
    )

  const view =
    useMemo(() => {
      const xs =
        polygon
          ? polygon.map(
              ([x]) => x
            )
          : []

      const zs =
        polygon
          ? polygon.map(
              ([, z]) => z
            )
          : []

      const allXs =
        xs.length
          ? xs.concat(
              0,
              floor.width
            )
          : [
              0,
              floor.width,
            ]

      const allZs =
        zs.length
          ? zs.concat(
              0,
              floor.depth
            )
          : [
              0,
              floor.depth,
            ]

      let minX =
        Math.min(
          ...allXs
        ) - 0.6

      let maxX =
        Math.max(
          ...allXs
        ) + 0.6

      let minZ =
        Math.min(
          ...allZs
        ) - 0.6

      let maxZ =
        Math.max(
          ...allZs
        ) + 0.6

      const vw =
        maxX - minX

      const vd =
        maxZ - minZ

      const floorRatio =
        Math.max(
          0.01,
          floor.width
        ) /
        Math.max(
          0.01,
          floor.depth
        )

      if (
        vw / vd <
        floorRatio
      ) {
        const newVw =
          vd *
          floorRatio

        const cx =
          (
            minX +
            maxX
          ) / 2

        minX =
          cx -
          newVw / 2

        maxX =
          cx +
          newVw / 2
      } else {
        const newVd =
          vw /
          floorRatio

        const cz =
          (
            minZ +
            maxZ
          ) / 2

        minZ =
          cz -
          newVd / 2

        maxZ =
          cz +
          newVd / 2
      }

      return {
        minX,
        maxX,
        minZ,
        maxZ,

        width:
          maxX - minX,

        depth:
          maxZ - minZ,
      }
    }, [
      polygon,
      floor.width,
      floor.depth,
    ])

  const nearestInside = (
    x,
    z,
    w,
    d
  ) => {
    if (!polygon) {
      return {
        x,
        z,
      }
    }

    const nearest =
      nearestPointInPolygon(
        x + w / 2,
        z + d / 2,
        polygon
      )

    return {
      x:
        nearest.x -
        w / 2,

      z:
        nearest.z -
        d / 2,
    }
  }

  const replaceGondolas =
    (gondolas) =>
      onChange({
        ...configuration,
        gondolas,
      })

  const updateGondola =
    (
      id,
      values
    ) =>
      replaceGondolas(
        configuration.gondolas.map(
          (item) =>
            item.id === id
              ? {
                  ...item,
                  ...values,
                }
              : item
        )
      )

  const addGondolaAt =
    (
      x,
      z
    ) => {
      const width =
        Math.min(
          3,
          view.width - 0.5
        )

      const depth =
        0.7

      const placed =
        nearestInside(
          Math.round(
            Math.min(
              view.maxX -
                width,
              Math.max(
                view.minX,
                x
              )
            ) * 100
          ) / 100,

          Math.round(
            Math.min(
              view.maxZ -
                depth,
              Math.max(
                view.minZ,
                z
              )
            ) * 100
          ) / 100,

          width,
          depth
        )

      const item = {
        id:
          `g-${Date.now()}`,

        name:
          `Góndola ${
            configuration
              .gondolas
              .length + 1
          }`,

        x:
          Math.round(
            placed.x * 100
          ) / 100,

        z:
          Math.round(
            placed.z * 100
          ) / 100,

        width,
        depth,
        rotation: 0,

        segments: {
          rows,
          columns,
        },

        products:
          emptyProducts(),
      }

      replaceGondolas([
        ...configuration.gondolas,
        item,
      ])

      setSelectedId(
        item.id
      )

      setAddMode(false)
    }

  const addGondola = () => {
    const width =
      Math.min(
        3,
        view.width - 0.5
      )

    const depth = 0.7

    const stepX =
      width + 0.4

    const stepZ =
      depth + 0.4

    const perRow =
      Math.max(
        1,
        Math.floor(
          (
            view.width -
            0.5
          ) / stepX
        )
      )

    const index =
      configuration
        .gondolas
        .length

    addGondolaAt(
      Math.min(
        Math.max(
          view.minX,
          view.maxX -
            width
        ),

        view.minX +
          0.5 +
          (
            index %
            perRow
          ) *
            stepX
      ),

      Math.min(
        Math.max(
          view.minZ,
          view.maxZ -
            depth
        ),

        view.minZ +
          0.5 +
          Math.floor(
            index /
              perRow
          ) *
            stepZ
      )
    )
  }

  const removeGondola =
    () => {
      replaceGondolas(
        configuration.gondolas.filter(
          (item) =>
            item.id !==
            selectedId
        )
      )

      setSelectedId(
        configuration.gondolas.find(
          (item) =>
            item.id !==
            selectedId
        )?.id || null
      )
    }

  const changeFloor =
    (
      field,
      rawValue
    ) => {
      const value =
        Math.max(
          2,
          Number(
            rawValue
          ) || 2
        )

      const nextFloor = {
        ...floor,
        [field]: value,
      }

      const camera = {
        ...configuration.camera,

        target_meters: [
          [0, 0],
          [
            nextFloor.width,
            0,
          ],
          [
            nextFloor.width,
            nextFloor.depth,
          ],
          [
            0,
            nextFloor.depth,
          ],
        ],
      }

      onChange({
        ...configuration,

        floor:
          nextFloor,

        camera,
      })
    }

  const startPointer =
    (
      event,
      item,
      mode
    ) => {
      event.stopPropagation()

      event.currentTarget.setPointerCapture(
        event.pointerId
      )

      setSelectedId(
        item.id
      )

      pointer.current = {
        mode,

        startX:
          event.clientX,

        startY:
          event.clientY,

        item: {
          ...item,
        },

        valid: {
          x: item.x,
          z: item.z,
        },
      }
    }

  const movePointer =
    (event) => {
      if (
        !pointer.current ||
        !canvasRef.current
      ) {
        return
      }

      const rect =
        canvasRef.current.getBoundingClientRect()

      const original =
        pointer.current.item

      if (
        pointer.current.mode ===
        'rotate'
      ) {
        const centerPx = [
          rect.left +
            (
              original.x +
              original.width /
                2 -
              view.minX
            ) /
              view.width *
              rect.width,

          rect.top +
            (
              original.z +
              original.depth /
                2 -
              view.minZ
            ) /
              view.depth *
              rect.height,
        ]

        const angle =
          Math.atan2(
            event.clientY -
              centerPx[1],

            event.clientX -
              centerPx[0]
          ) *
            180 /
            Math.PI +
          90

        updateGondola(
          original.id,
          {
            rotation:
              Math.round(
                (
                  (
                    angle %
                    360
                  ) +
                  360
                ) %
                  360
              ),
          }
        )

        return
      }

      const dx =
        (
          event.clientX -
          pointer.current
            .startX
        ) /
        rect.width *
        view.width

      const dz =
        (
          event.clientY -
          pointer.current
            .startY
        ) /
        rect.height *
        view.depth

      if (
        pointer.current.mode ===
        'move'
      ) {
        let newX =
          original.x +
          dx

        let newZ =
          original.z +
          dz

        if (
          snapEnabled
        ) {
          newX =
            snapToGrid(
              newX
            )

          newZ =
            snapToGrid(
              newZ
            )
        }

        newX =
          Math.round(
            Math.min(
              view.maxX -
                original.width,

              Math.max(
                view.minX,
                newX
              )
            ) * 100
          ) / 100

        newZ =
          Math.round(
            Math.min(
              view.maxZ -
                original.depth,

              Math.max(
                view.minZ,
                newZ
              )
            ) * 100
          ) / 100

        if (
          polygon &&
          !pointInPolygon(
            newX +
              original.width /
                2,

            newZ +
              original.depth /
                2,

            polygon
          )
        ) {
          const nearest =
            nearestPointInPolygon(
              newX +
                original.width /
                  2,

              newZ +
                original.depth /
                  2,

              polygon
            )

          newX =
            nearest.x -
            original.width /
              2

          newZ =
            nearest.z -
            original.depth /
              2
        }

        pointer.current.valid = {
          x: newX,
          z: newZ,
        }

        updateGondola(
          original.id,
          {
            x: newX,
            z: newZ,
          }
        )

        setDragInfo({
          mode: 'move',
          x: newX,
          z: newZ,
          w: original.width,
          d: original.depth,
        })
      } else {
        let newW =
          original.width +
          dx

        let newD =
          original.depth +
          dz

        if (
          snapEnabled
        ) {
          newW =
            snapToGrid(
              newW
            )

          newD =
            snapToGrid(
              newD
            )
        }

        newW =
          Math.round(
            Math.min(
              view.maxX -
                original.x,

              Math.max(
                0.5,
                newW
              )
            ) * 100
          ) / 100

        newD =
          Math.round(
            Math.min(
              view.maxZ -
                original.z,

              Math.max(
                0.4,
                newD
              )
            ) * 100
          ) / 100

        updateGondola(
          original.id,
          {
            width: newW,
            depth: newD,
          }
        )

        setDragInfo({
          mode:
            'resize',

          x:
            original.x,

          z:
            original.z,

          w: newW,
          d: newD,
        })
      }
    }

  const updateProduct =
    (
      row,
      column,
      value
    ) => {
      const products =
        (
          selected
            .products
            ?.length
            ? selected
                .products
            : emptyProducts()
        ).map(
          (items) => [
            ...items,
          ]
        )

      products[row][column] =
        value

      updateGondola(
        selected.id,
        {
          products,
        }
      )
    }

  const commitNumeric =
    (
      field,
      rawValue
    ) => {
      if (
        rawValue === ''
      ) {
        return
      }

      const num =
        Number(
          rawValue
        )

      if (
        !Number.isFinite(
          num
        )
      ) {
        return
      }

      let value =
        Math.round(
          num * 100
        ) / 100

      if (
        field ===
        'rotation'
      ) {
        value =
          (
            (
              value %
              360
            ) +
            360
          ) %
          360

        updateGondola(
          selected.id,
          {
            rotation:
              value,
          }
        )

        return
      }

      if (
        field === 'width'
      ) {
        value =
          Math.min(
            view.maxX -
              selected.x,

            Math.max(
              0.5,
              value
            )
          )
      } else if (
        field === 'depth'
      ) {
        value =
          Math.min(
            view.maxZ -
              selected.z,

            Math.max(
              0.4,
              value
            )
          )
      } else if (
        field === 'x'
      ) {
        value =
          Math.min(
            view.maxX -
              selected.width,

            Math.max(
              view.minX,
              value
            )
          )
      } else if (
        field === 'z'
      ) {
        value =
          Math.min(
            view.maxZ -
              selected.depth,

            Math.max(
              view.minZ,
              value
            )
          )
      }

      updateGondola(
        selected.id,
        {
          [field]:
            Math.round(
              value * 100
            ) / 100,
        }
      )
    }

  const gondolaZoneStatus =
    (item) => {
      if (!polygon) {
        return {
          level: 'none',
        }
      }

      const corners =
        gondolaCorners(item)

      const mids =
        corners.map(
          (
            corner,
            index
          ) => [
            (
              corner[0] +
              corners[
                (
                  index +
                  1
                ) %
                  4
              ][0]
            ) / 2,

            (
              corner[1] +
              corners[
                (
                  index +
                  1
                ) %
                  4
              ][1]
            ) / 2,
          ]
        )

      const center = [
        item.x +
          item.width / 2,

        item.z +
          item.depth / 2,
      ]

      const samples = [
        center,
        ...corners,
        ...mids,
      ].map(
        ([x, z]) => [
          Math.round(
            x * 100
          ) / 100,

          Math.round(
            z * 100
          ) / 100,
        ]
      )

      const inside =
        samples.filter(
          ([x, z]) =>
            pointInPolygon(
              x,
              z,
              polygon
            )
        ).length

      const fraction =
        inside /
        samples.length

      if (
        !pointInPolygon(
          center[0],
          center[1],
          polygon
        )
      ) {
        return {
          level: 'out',
          fraction,
        }
      }

      if (
        fraction >= 0.95
      ) {
        return {
          level: 'in',
          fraction,
        }
      }

      return {
        level:
          'partial',

        fraction,
      }
    }

  const selectedStatus =
    selected
      ? gondolaZoneStatus(
          selected
        )
      : null

  const commitOutline =
    (pointsMeters) => {
      setHandOutline(
        pointsMeters
      )

      setFloorDrawMode(
        false
      )
    }

  const clearOutline =
    () => {
      setHandOutline(
        null
      )
    }

  const save =
    async () => {
      setSaving(true)
      setSaveState('')

      try {
        await onSave(
          configuration
        )

        setSaveState(
          'Plano guardado'
        )
      } catch (error) {
        setSaveState(
          error.message ||
            'No se pudo guardar el plano'
        )
      } finally {
        setSaving(false)
      }
    }

  /* =========================================================
     CONTENIDO
  ========================================================= */

  return (
    <section
      className="
        m-0
        w-full
        min-w-0
        overflow-hidden
        bg-white
        text-[#102033]
      "
    >
      {/* =====================================================
          GRID PRINCIPAL ESCRITORIO
      ===================================================== */}

      <div
        className="
          grid
          grid-cols-1
          gap-3
          bg-white
          p-3
          xl:grid-cols-[minmax(0,56fr)_minmax(0,44fr)]
          xl:items-start
        "
      >
        {/* =================================================
            COLUMNA IZQUIERDA
        ================================================= */}

        <div
          className="
            min-w-0
          "
        >
          {/* =========================
              VIDEO
          ========================== */}

          <div
            className={
              tab === 'video'
                ? 'block'
                : 'hidden xl:block'
            }
          >
            <div
              className="
                rounded-[10px]
                border
                border-[#dce8f2]
                bg-white
                p-2.5
              "
            >
              <h3
                className="
                  mb-2
                  text-[10px]
                  font-black
                  text-[#102033]
                "
              >
                Frame del video
              </h3>

              <div
                className="
                  overflow-hidden
                  rounded-[8px]
                  border
                  border-[#dce8f2]
                  bg-[#f8fbff]
                "
              >
                <LiveAlignment
                  frameCapture={
                    frameCapture
                  }
                  configuration={
                    configuration
                  }
                  drawMode={
                    floorDrawMode &&
                    Boolean(
                      frameCapture
                    )
                  }
                  onDrawCommit={
                    commitOutline
                  }
                  onDrawCancel={() =>
                    setFloorDrawMode(
                      false
                    )
                  }
                  interactive
                  onMoveGondola={(
                    id,
                    values
                  ) =>
                    updateGondola(
                      id,
                      values
                    )
                  }
                  selectedId={
                    selectedId
                  }
                  onSelect={
                    setSelectedId
                  }
                  addMode={
                    addMode
                  }
                  onAddAt={(
                    x,
                    z
                  ) =>
                    addGondolaAt(
                      x,
                      z
                    )
                  }
                  zone={zone}
                  handOutline={
                    handOutline
                  }
                />
              </div>

              <p
                className="
                  mt-2
                  text-[8px]
                  font-semibold
                  leading-[13px]
                  text-[#718096]
                "
              >
                Calibra las góndolas arrastrándolas
                sobre el video proyectado o coloca una
                nueva haciendo clic en “Añadir góndola”.
                Con “Dibujar el piso” trazas el contorno
                directamente sobre el video.
              </p>

              {/* =========================
                  BOTONES BAJO VIDEO
              ========================== */}

              <div
                className="
                  mt-2
                  grid
                  grid-cols-2
                  gap-2
                  sm:grid-cols-4
                "
              >
                <button
                  type="button"
                  onClick={() =>
                    setSnapEnabled(
                      (value) =>
                        !value
                    )
                  }
                  className={`
                    rounded-[7px]
                    border
                    px-2
                    py-2
                    text-[8px]
                    font-black
                    transition
                    ${
                      snapEnabled
                        ? 'border-[#1686e8] bg-[#eef7ff] text-[#1686e8]'
                        : 'border-[#d5e1ec] bg-white text-[#53657a]'
                    }
                  `}
                >
                  ⊞ Snap
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFloorDrawMode(
                      false
                    )

                    setAddMode(
                      (value) =>
                        !value
                    )
                  }}
                  className={`
                    rounded-[7px]
                    border
                    px-2
                    py-2
                    text-[8px]
                    font-black
                    transition
                    ${
                      addMode
                        ? 'border-[#ff641f] bg-[#fff3eb] text-[#ff641f]'
                        : 'border-[#ff641f] bg-white text-[#ff641f]'
                    }
                  `}
                >
                  ＋ Añadir góndola
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAddMode(
                      false
                    )

                    setFloorDrawMode(
                      (value) =>
                        !value
                    )
                  }}
                  className={`
                    rounded-[7px]
                    border
                    px-2
                    py-2
                    text-[8px]
                    font-black
                    transition
                    ${
                      floorDrawMode
                        ? 'border-[#1686e8] bg-[#eef7ff] text-[#1686e8]'
                        : 'border-[#d5e1ec] bg-white text-[#53657a]'
                    }
                  `}
                >
                  ▱ Dibujar el piso
                </button>

                <button
                  type="button"
                  onClick={save}
                  disabled={
                    saving
                  }
                  className="
                    rounded-[7px]
                    border
                    border-[#ff641f]
                    bg-gradient-to-r
                    from-[#ff5b12]
                    to-[#ff741f]
                    px-2
                    py-2
                    text-[8px]
                    font-black
                    text-white
                    transition
                    disabled:opacity-40
                  "
                >
                  {saving
                    ? 'Guardando…'
                    : 'Guardar plano'}
                </button>
              </div>
            </div>
          </div>

          {/* =========================
              PLANO DEBAJO DEL VIDEO
          ========================== */}

          <div
            className="
              mt-3
              rounded-[10px]
              border
              border-[#dce8f2]
              bg-white
              p-2.5
            "
          >
            <div
              className="
                mb-2
                flex
                items-center
                justify-between
              "
            >
              <h3
                className="
                  text-[10px]
                  font-black
                  text-[#102033]
                "
              >
                Plano de la sede
              </h3>

              <span
                className="
                  text-[7px]
                  font-bold
                  text-[#718096]
                "
              >
                Arrastra y ajusta
              </span>
            </div>

            <div
              ref={
                canvasRef
              }
              className="
                relative
                mx-auto
                w-full
                overflow-hidden
                rounded-[8px]
                border
                border-[#d6e5f1]
                bg-white
                touch-none
                select-none
              "
              style={{
                aspectRatio:
                  `${floor.width}/${floor.depth}`,
              }}
              onPointerDown={(
                event
              ) => {
                if (
                  !addMode
                ) {
                  return
                }

                const rect =
                  canvasRef.current.getBoundingClientRect()

                addGondolaAt(
                  view.minX +
                    (
                      event.clientX -
                      rect.left
                    ) /
                      rect.width *
                      view.width,

                  view.minZ +
                    (
                      event.clientY -
                      rect.top
                    ) /
                      rect.height *
                      view.depth
                )
              }}
              onPointerMove={
                movePointer
              }
              onPointerUp={() => {
                pointer.current =
                  null

                setDragInfo(
                  null
                )
              }}
              onPointerCancel={() => {
                pointer.current =
                  null

                setDragInfo(
                  null
                )
              }}
            >
              <svg
                className="
                  pointer-events-none
                  absolute
                  inset-0
                  h-full
                  w-full
                "
                viewBox={`${view.minX} ${view.minZ} ${view.width} ${view.depth}`}
                preserveAspectRatio="none"
              >
                <rect
                  x={view.minX}
                  y={view.minZ}
                  width={view.width}
                  height={view.depth}
                  fill="#ffffff"
                />

                {(() => {
                  const target =
                    view.width /
                    14

                  const step =
                    target > 5
                      ? 5
                      : target > 2
                        ? 2
                        : target > 1
                          ? 1
                          : target > 0.5
                            ? 0.5
                            : 0.25

                  const lines =
                    []

                  for (
                    let x =
                      Math.ceil(
                        view.minX /
                          step
                      ) *
                      step;
                    x <=
                    view.maxX +
                      1e-6;
                    x += step
                  ) {
                    lines.push(
                      <line
                        key={`v${x}`}
                        x1={x}
                        y1={view.minZ}
                        x2={x}
                        y2={view.maxZ}
                        stroke="rgba(22,134,232,.10)"
                        strokeWidth="0.05"
                      />
                    )
                  }

                  for (
                    let z =
                      Math.ceil(
                        view.minZ /
                          step
                      ) *
                      step;
                    z <=
                    view.maxZ +
                      1e-6;
                    z += step
                  ) {
                    lines.push(
                      <line
                        key={`h${z}`}
                        x1={view.minX}
                        y1={z}
                        x2={view.maxX}
                        y2={z}
                        stroke="rgba(22,134,232,.10)"
                        strokeWidth="0.05"
                      />
                    )
                  }

                  return lines
                })()}

                {polygon && (
                  <g>
                    <polygon
                      points={polygon
                        .map(
                          ([x, z]) =>
                            `${x},${z}`
                        )
                        .join(' ')}
                      fill="rgba(22,134,232,.08)"
                      stroke="#1686e8"
                      strokeWidth={Math.max(
                        0.05,
                        view.width /
                          150
                      )}
                      strokeDasharray="0.26 0.14"
                      strokeLinejoin="round"
                    />

                    <text
                      x={
                        polygon[0][0]
                      }
                      y={
                        polygon[0][1] -
                        0.5
                      }
                      fill="#1686e8"
                      fontSize={Math.max(
                        0.32,
                        view.width /
                          42
                      )}
                      fontFamily="ui-monospace, monospace"
                      fontWeight="bold"
                    >
                      ZONA
                    </text>
                  </g>
                )}

                {handOutline?.length >=
                  3 && (
                  <g>
                    <polygon
                      points={handOutline
                        .map(
                          ([x, z]) =>
                            `${x},${z}`
                        )
                        .join(' ')}
                      fill="none"
                      stroke="#8abbe7"
                      strokeWidth="0.05"
                      strokeDasharray="0.14 0.1"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {sketchZones.map(
                  (
                    zoneItem
                  ) => {
                    const points =
                      (
                        zoneItem.polygon ||
                        []
                      )
                        .map(
                          ([x, z]) =>
                            `${x},${z}`
                        )
                        .join(' ')

                    if (
                      (
                        zoneItem.polygon ||
                        []
                      ).length <
                      3
                    ) {
                      return null
                    }

                    return (
                      <polygon
                        key={
                          zoneItem.id
                        }
                        points={
                          points
                        }
                        fill="rgba(22,134,232,.025)"
                        stroke="rgba(92,145,194,.55)"
                        strokeWidth={Math.max(
                          0.045,
                          view.width /
                            210
                        )}
                        strokeDasharray="0.22 0.12"
                        strokeLinejoin="round"
                      />
                    )
                  }
                )}
              </svg>

              {configuration.gondolas.map(
                (item) => {
                  const isSelected =
                    selectedId ===
                    item.id

                  const zoneLevel =
                    gondolaZoneStatus(
                      item
                    ).level

                  const outOfZone =
                    zoneLevel ===
                      'out' ||
                    zoneLevel ===
                      'partial'

                  return (
                    <div
                      key={
                        item.id
                      }
                      className={`
                        absolute
                        grid
                        min-h-[20px]
                        min-w-[25px]
                        touch-none
                        place-items-center
                        rounded-[4px]
                        border
                        text-[#102033]

                        ${
                          isSelected
                            ? 'z-[2] border-[#ff641f] bg-[#fff1e9]'
                            : outOfZone
                              ? 'border-[#ff876a] bg-[#fff6f1]'
                              : 'border-[#72afe3] bg-[#eaf5ff]'
                        }
                      `}
                      style={{
                        left:
                          `${(
                            (
                              item.x -
                              view.minX
                            ) /
                            view.width
                          ) *
                          100}%`,

                        top:
                          `${(
                            (
                              item.z -
                              view.minZ
                            ) /
                            view.depth
                          ) *
                          100}%`,

                        width:
                          `${(
                            item.width /
                            view.width
                          ) *
                          100}%`,

                        height:
                          `${(
                            item.depth /
                            view.depth
                          ) *
                          100}%`,

                        transform:
                          `rotate(${item.rotation || 0}deg)`,
                      }}
                      onPointerDown={(
                        event
                      ) =>
                        startPointer(
                          event,
                          item,
                          'move'
                        )
                      }
                    >
                      <span
                        className="
                          pointer-events-none
                          text-[7px]
                          font-black
                        "
                      >
                        {item.name}
                      </span>

                      <i
                        className="
                          absolute
                          -top-[20px]
                          left-1/2
                          h-3
                          w-3
                          -translate-x-1/2
                          cursor-grab
                          rounded-full
                          border-2
                          border-[#ff641f]
                          bg-white
                        "
                        onPointerDown={(
                          event
                        ) =>
                          startPointer(
                            event,
                            item,
                            'rotate'
                          )
                        }
                      />

                      <i
                        className="
                          absolute
                          -bottom-px
                          -right-px
                          h-4
                          w-4
                          cursor-nwse-resize
                          bg-[linear-gradient(135deg,transparent_45%,#ff641f_46%_55%,transparent_56%)]
                        "
                        onPointerDown={(
                          event
                        ) =>
                          startPointer(
                            event,
                            item,
                            'resize'
                          )
                        }
                      />
                    </div>
                  )
                }
              )}
            </div>
          </div>
        </div>

        {/* =================================================
            COLUMNA DERECHA
        ================================================= */}

        <div
          className="
            min-w-0
          "
        >
          {/* =========================
              DIMENSIONES
          ========================== */}

          <div
            className="
              rounded-[10px]
              border
              border-[#dce8f2]
              bg-white
              p-3
            "
          >
            <h3
              className="
                mb-2
                text-[9px]
                font-black
                text-[#102033]
              "
            >
              Dimensiones del área de trabajo
            </h3>

            <div
              className="
                grid
                grid-cols-2
                gap-2
              "
            >
              <label
                className="
                  relative
                  grid
                  gap-1
                  text-[7px]
                  font-bold
                  uppercase
                  text-[#61758c]
                "
              >
                Ancho

                <input
                  className="
                    w-full
                    rounded-[6px]
                    border
                    border-[#cdddeb]
                    bg-white
                    p-2
                    pr-7
                    text-[8px]
                    text-[#102033]
                    outline-none
                  "
                  type="number"
                  min="2"
                  step="0.5"
                  value={
                    floor.width
                  }
                  onChange={(
                    event
                  ) =>
                    changeFloor(
                      'width',
                      event.target
                        .value
                    )
                  }
                />

                <small
                  className="
                    absolute
                    bottom-[8px]
                    right-2
                    text-[#1686e8]
                  "
                >
                  m
                </small>
              </label>

              <label
                className="
                  relative
                  grid
                  gap-1
                  text-[7px]
                  font-bold
                  uppercase
                  text-[#61758c]
                "
              >
                Fondo

                <input
                  className="
                    w-full
                    rounded-[6px]
                    border
                    border-[#cdddeb]
                    bg-white
                    p-2
                    pr-7
                    text-[8px]
                    text-[#102033]
                    outline-none
                  "
                  type="number"
                  min="2"
                  step="0.5"
                  value={
                    floor.depth
                  }
                  onChange={(
                    event
                  ) =>
                    changeFloor(
                      'depth',
                      event.target
                        .value
                    )
                  }
                />

                <small
                  className="
                    absolute
                    bottom-[8px]
                    right-2
                    text-[#1686e8]
                  "
                >
                  m
                </small>
              </label>
            </div>
          </div>

          {/* =========================
              GÓNDOLA
          ========================== */}

          <aside
            className="
              mt-3
              rounded-[10px]
              border
              border-[#dce8f2]
              bg-[#f9fcff]
              p-3
            "
          >
            {selected ? (
              <>
                <div
                  className="
                    mb-3
                    flex
                    items-center
                    justify-between
                    gap-2
                  "
                >
                  <div>
                    <span
                      className="
                        text-[7px]
                        font-black
                        uppercase
                        tracking-[.12em]
                        text-[#1686e8]
                      "
                    >
                      Configuración
                    </span>

                    <h3
                      className="
                        mt-1
                        text-[11px]
                        font-black
                        text-[#102033]
                      "
                    >
                      Góndola seleccionada
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={
                      removeGondola
                    }
                    className="
                      rounded-[6px]
                      border
                      border-[#ffb79a]
                      bg-[#fff5ef]
                      px-2.5
                      py-1.5
                      text-[7px]
                      font-black
                      text-[#e44d22]
                    "
                  >
                    Eliminar
                  </button>
                </div>

                <label
                  className="
                    grid
                    gap-1
                    text-[7px]
                    font-bold
                    uppercase
                    text-[#61758c]
                  "
                >
                  Nombre

                  <input
                    className="
                      w-full
                      rounded-[6px]
                      border
                      border-[#cdddeb]
                      bg-white
                      p-2
                      text-[8px]
                      font-semibold
                      normal-case
                      text-[#102033]
                      outline-none
                    "
                    value={
                      selected.name
                    }
                    onChange={(
                      event
                    ) =>
                      updateGondola(
                        selected.id,
                        {
                          name:
                            event.target
                              .value,
                        }
                      )
                    }
                  />
                </label>

                <div
                  className="
                    mt-2
                    grid
                    grid-cols-2
                    gap-2
                  "
                >
                  <NumericInput
                    label="X (m)"
                    value={
                      selected.x
                    }
                    step="0.01"
                    onChange={(
                      value
                    ) =>
                      commitNumeric(
                        'x',
                        value
                      )
                    }
                  />

                  <NumericInput
                    label="Y (m)"
                    value={
                      selected.z
                    }
                    step="0.01"
                    onChange={(
                      value
                    ) =>
                      commitNumeric(
                        'z',
                        value
                      )
                    }
                  />

                  <NumericInput
                    label="Ancho (m)"
                    value={
                      selected.width
                    }
                    min="0.5"
                    step="0.1"
                    onChange={(
                      value
                    ) =>
                      commitNumeric(
                        'width',
                        value
                      )
                    }
                  />

                  <NumericInput
                    label="Fondo (m)"
                    value={
                      selected.depth
                    }
                    min="0.4"
                    step="0.1"
                    onChange={(
                      value
                    ) =>
                      commitNumeric(
                        'depth',
                        value
                      )
                    }
                  />

                  <NumericInput
                    label="Rotación (°)"
                    value={
                      selected.rotation
                    }
                    min="0"
                    max="360"
                    step="1"
                    onChange={(
                      value
                    ) =>
                      commitNumeric(
                        'rotation',
                        value
                      )
                    }
                  />
                </div>

                <div
                  className="
                    mt-2
                    rounded-[6px]
                    border
                    border-[#d9e7f2]
                    bg-white
                    px-2
                    py-1.5
                  "
                >
                  <span
                    className="
                      text-[7px]
                      font-black
                    "
                    style={{
                      color:
                        ZONE_STATUS[
                          selectedStatus
                            .level
                        ].color,
                    }}
                  >
                    {selected.width.toFixed(
                      2
                    )}
                    ×
                    {selected.depth.toFixed(
                      2
                    )}
                    m ·{' '}
                    {
                      ZONE_STATUS[
                        selectedStatus
                          .level
                      ].label
                    }{' '}
                    {
                      ZONE_STATUS[
                        selectedStatus
                          .level
                      ].dot
                    }
                  </span>
                </div>

                {/* =========================
                    PRODUCTOS
                ========================== */}

                <div
                  className="
                    mt-3
                  "
                >
                  <span
                    className="
                      block
                      text-[7px]
                      font-black
                      uppercase
                      tracking-[.12em]
                      text-[#1686e8]
                    "
                  >
                    Productos por segmento
                  </span>

                  <div
                    className="
                      mt-2
                      grid
                      grid-cols-3
                      gap-1.5
                    "
                  >
                    {rows.map(
                      (
                        row,
                        rowIndex
                      ) =>
                        columns.map(
                          (
                            column,
                            columnIndex
                          ) => (
                            <label
                              key={`${row}-${column}`}
                              className="
                                grid
                                gap-1
                                rounded-[6px]
                                border
                                border-[#dce8f2]
                                bg-white
                                p-1.5
                                text-[6px]
                                font-bold
                                uppercase
                                text-[#61758c]
                              "
                            >
                              <small
                                className="
                                  h-[13px]
                                  text-[5px]
                                  leading-[1.2]
                                  text-[#718096]
                                "
                              >
                                {row} · {column}
                              </small>

                              <input
                                className="
                                  w-full
                                  rounded-[4px]
                                  border
                                  border-[#d5e2ed]
                                  bg-[#f9fcff]
                                  px-1.5
                                  py-1.5
                                  text-[7px]
                                  normal-case
                                  text-[#102033]
                                  outline-none
                                "
                                value={
                                  selected
                                    .products?.[
                                    rowIndex
                                  ]?.[
                                    columnIndex
                                  ] ||
                                  ''
                                }
                                placeholder="Producto"
                                onChange={(
                                  event
                                ) =>
                                  updateProduct(
                                    rowIndex,
                                    columnIndex,
                                    event.target
                                      .value
                                  )
                                }
                              />
                            </label>
                          )
                        )
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div
                className="
                  grid
                  min-h-[220px]
                  place-items-center
                  rounded-[8px]
                  border
                  border-dashed
                  border-[#c9dcec]
                  bg-white
                  px-4
                  text-center
                  text-[9px]
                  font-semibold
                  text-[#718096]
                "
              >
                Selecciona una góndola para configurar
                sus segmentos y productos.
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ESTADOS */}

      {addMode && (
        <div
          className="
            mx-3
            mb-3
            rounded-[8px]
            border
            border-[#ffd7c5]
            bg-[#fff5ef]
            px-3
            py-2
            text-[8px]
            font-semibold
            text-[#c54b20]
          "
        >
          Modo añadir: haz clic en el video o
          en el plano para colocar una góndola.
        </div>
      )}

      {saveState && (
        <div
          className="
            mx-3
            mb-3
            rounded-[8px]
            border
            border-[#c6ecd8]
            bg-[#effbf5]
            px-3
            py-2
            text-[8px]
            font-black
            text-[#16834f]
          "
        >
          {saveState}
        </div>
      )}

      {(
        handOutline?.length >=
          3 ||
        floor.outline?.length >=
          3
      ) && (
        <div
          className="
            mx-3
            mb-3
            flex
            items-center
            gap-3
            rounded-[8px]
            border
            border-[#cae4fa]
            bg-[#eef7ff]
            px-3
            py-2
            text-[7px]
            font-semibold
            text-[#61758c]
          "
        >
          <b
            className="
              text-[#1686e8]
            "
          >
            {handOutline?.length >=
            3
              ? `Contorno del piso trazado (${handOutline.length} puntos)`
              : 'Zona del plano guardada'}
          </b>

          <span
            className="
              flex-1
            "
          >
            {handOutline?.length >=
            3
              ? 'Solo referencia visual.'
              : 'Define la forma del mapa; el movimiento de las góndolas queda dentro de la zona.'}
          </span>

          {handOutline?.length >=
            3 && (
            <button
              type="button"
              onClick={
                clearOutline
              }
              className="
                rounded-[6px]
                border
                border-[#9cc7eb]
                bg-white
                px-2
                py-1.5
                text-[7px]
                font-black
                text-[#1686e8]
              "
            >
              Borrar contorno
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/* =========================================================
   INPUT NUMÉRICO
========================================================= */

function NumericInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}) {
  return (
    <label
      className="
        grid
        gap-1
        text-[6px]
        font-bold
        uppercase
        text-[#61758c]
      "
    >
      {label}

      <input
        className="
          w-full
          rounded-[6px]
          border
          border-[#cdddeb]
          bg-white
          p-2
          text-[8px]
          font-semibold
          normal-case
          text-[#102033]
          outline-none
        "
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
      />
    </label>
  )
}

export default PlanogramEditor