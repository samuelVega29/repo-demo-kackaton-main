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
  none: { label: 'sin zona definida', dot: '', color: '#8aa39a' },
  in: { label: 'dentro de zona', dot: '✅', color: '#d4ff70' },
  partial: { label: 'parcialmente fuera de zona', dot: '⚠️', color: '#ffb454' },
  out: { label: 'fuera de zona', dot: '⚠️', color: '#ff6b3d' },
}

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

  return (
    <section
      className="
        m-0
        w-full
        min-w-0
        overflow-hidden
        rounded-[16px]
        border
        border-[#dce8f2]
        bg-white
        p-0
        text-[#102033]
      "
    >
      {/* =====================================================
          CABECERA
      ===================================================== */}

      <div
        className="
          grid
          min-h-0
          grid-cols-[1fr_auto]
          items-start
          gap-[30px]
          border-b
          border-[#e2ebf3]
          bg-white
          p-[18px]
          max-[980px]:grid-cols-[1fr]
          max-[760px]:flex
          max-[760px]:flex-col
          max-[760px]:items-stretch
          max-[760px]:gap-[18px]
        "
      >
        <div>
          <span
            className="
              text-[9px]
              font-black
              uppercase
              tracking-[.14em]
              text-[#1686e8]
            "
          >
            Configuración física de la sede
          </span>

          <h2
            className="
              mb-[5px]
              mt-[6px]
              text-[25px]
              font-black
              tracking-[-.04em]
              text-[#102033]
            "
          >
            Dibuja tu planograma
          </h2>

          <p
            className="
              m-0
              text-[9px]
              font-semibold
              leading-4
              text-[#718096]
            "
          >
            Añade, arrastra y cambia el tamaño
            de cada góndola. Esta geometría
            se reutiliza en futuros videos.
          </p>
        </div>

        {/* DIMENSIONES */}

        <div
          className="
            grid
            grid-cols-2
            gap-3
          "
        >
          <label
            className="
              relative
              grid
              gap-[5px]
              text-[8px]
              font-bold
              uppercase
              text-[#61758c]
            "
          >
            Ancho

            <input
              className="
                min-w-0
                w-full
                rounded-[7px]
                border
                border-[#cdddeb]
                bg-white
                p-[10px]
                pr-[28px]
                text-[#102033]
                outline-none
                transition
                focus:border-[#1686e8]
                focus:ring-2
                focus:ring-[#1686e8]/10
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
                bottom-[11px]
                right-2
                font-black
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
              gap-[5px]
              text-[8px]
              font-bold
              uppercase
              text-[#61758c]
            "
          >
            Fondo

            <input
              className="
                min-w-0
                w-full
                rounded-[7px]
                border
                border-[#cdddeb]
                bg-white
                p-[10px]
                pr-[28px]
                text-[#102033]
                outline-none
                transition
                focus:border-[#1686e8]
                focus:ring-2
                focus:ring-[#1686e8]/10
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
                bottom-[11px]
                right-2
                font-black
                text-[#1686e8]
              "
            >
              m
            </small>
          </label>
        </div>

        {/* BOTONES */}

        <div
          className="
            col-span-full
            flex
            flex-wrap
            justify-start
            gap-[8px]
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
            title="Snap a cuadrícula de 0.25m"
            className={`
              cursor-pointer
              rounded-[8px]
              border
              px-[14px]
              py-[10px]
              text-[9px]
              font-black
              whitespace-nowrap
              transition
              max-[760px]:flex-1
              ${
                snapEnabled
                  ? 'border-[#1686e8] bg-[#eef7ff] text-[#1686e8]'
                  : 'border-[#d5e1ec] bg-white text-[#53657a] hover:border-[#1686e8] hover:text-[#1686e8]'
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
            title="Haz clic sobre el plano o el video para colocarla"
            className={`
              cursor-pointer
              rounded-[8px]
              border
              px-[14px]
              py-[10px]
              text-[9px]
              font-black
              whitespace-nowrap
              transition
              max-[760px]:flex-1
              ${
                addMode
                  ? 'border-[#ff641f] bg-[#fff3eb] text-[#ff641f]'
                  : 'border-[#ff641f] bg-white text-[#ff641f] hover:bg-[#fff5ef]'
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
            title="Traza el contorno del piso a mano"
            className={`
              cursor-pointer
              rounded-[8px]
              border
              px-[14px]
              py-[10px]
              text-[9px]
              font-black
              whitespace-nowrap
              transition
              max-[760px]:flex-1
              ${
                floorDrawMode
                  ? 'border-[#1686e8] bg-[#eef7ff] text-[#1686e8]'
                  : 'border-[#d5e1ec] bg-white text-[#53657a] hover:border-[#1686e8] hover:text-[#1686e8]'
              }
            `}
          >
            ▱ Dibujar el piso
          </button>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="
              cursor-pointer
              rounded-[8px]
              border
              border-[#ff641f]
              bg-gradient-to-r
              from-[#ff5b12]
              to-[#ff741f]
              px-[16px]
              py-[10px]
              text-[9px]
              font-black
              whitespace-nowrap
              text-white
              shadow-[0_8px_18px_-12px_rgba(255,91,18,.8)]
              transition
              hover:-translate-y-0.5
              disabled:cursor-not-allowed
              disabled:opacity-40
              max-[760px]:flex-1
            "
          >
            {saving
              ? 'Guardando…'
              : 'Guardar plano'}
          </button>
        </div>
      </div>

      {/* ESTADOS */}

      {addMode && (
        <div
          className="
            mx-4
            mb-3
            mt-3
            rounded-[9px]
            border
            border-[#ffd7c5]
            bg-[#fff5ef]
            px-3
            py-3
            text-[9px]
            font-semibold
            text-[#c54b20]
          "
        >
          Modo añadir: haz clic en el video o
          en el plano para colocar una góndola.
          Pulsa el botón nuevamente para salir.
        </div>
      )}

      {floorDrawMode &&
        !frameCapture && (
          <div
            className="
              mx-4
              mb-3
              mt-3
              rounded-[9px]
              border
              border-[#ffe2a8]
              bg-[#fff9e9]
              px-3
              py-3
              text-[9px]
              font-semibold
              text-[#a46600]
            "
          >
            Captura un frame para poder trazar
            el contorno sobre el video.
          </div>
        )}

      {saveState && (
        <div
          className="
            mx-4
            mb-3
            mt-3
            rounded-[8px]
            border
            border-[#c6ecd8]
            bg-[#effbf5]
            px-3
            py-2
            text-[9px]
            font-black
            text-[#16834f]
          "
        >
          {saveState}
        </div>
      )}

      {/* TABS MOBILE */}

      <div
        className="
          mx-4
          mb-4
          flex
          items-center
          gap-[7px]
          xl:hidden
        "
      >
        <button
          type="button"
          onClick={() =>
            setTab('video')
          }
          className={`
            cursor-pointer
            rounded-[8px]
            border
            px-[16px]
            py-[9px]
            text-[9px]
            font-black
            uppercase
            tracking-[.08em]
            ${
              tab === 'video'
                ? 'border-[#1686e8] bg-[#1686e8] text-white'
                : 'border-[#d5e1ec] bg-white text-[#53657a]'
            }
          `}
        >
          Video
        </button>

        <button
          type="button"
          onClick={() =>
            setTab('plano')
          }
          className={`
            cursor-pointer
            rounded-[8px]
            border
            px-[16px]
            py-[9px]
            text-[9px]
            font-black
            uppercase
            tracking-[.08em]
            ${
              tab === 'plano'
                ? 'border-[#1686e8] bg-[#1686e8] text-white'
                : 'border-[#d5e1ec] bg-white text-[#53657a]'
            }
          `}
        >
          Plano
        </button>
      </div>

      {/* =====================================================
          CONTENIDO PRINCIPAL
      ===================================================== */}

      <div
        className="
          grid
          min-h-0
          grid-cols-1
          gap-4
          bg-white
          p-4
          xl:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]
          xl:items-start
        "
      >
        {/* VIDEO */}

        <div
          className={
            tab === 'video'
              ? 'block'
              : 'hidden xl:block'
          }
        >
          <div
            className="
              flex
              w-full
              flex-col
              gap-2
            "
          >
            <span
              className="
                text-[8px]
                font-black
                uppercase
                tracking-[.08em]
                text-[#1686e8]
              "
            >
              Sobre el frame · plano en vivo —
              arrastra y coloca góndolas sobre el video
            </span>

            <div
              className="
                overflow-hidden
                rounded-[12px]
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
                m-0
                text-[9px]
                font-semibold
                leading-[1.6]
                text-[#718096]
              "
            >
              Calibra las góndolas arrastrándolas
              sobre el video proyectado o coloca
              una nueva haciendo clic en “Añadir
              góndola”. Con “Dibujar el piso”
              trazas el contorno directamente sobre
              el video.
            </p>
          </div>
        </div>

        {/* PLANO + FORMULARIO */}

        <div
          className={
            tab === 'plano'
              ? 'block'
              : 'hidden xl:block'
          }
        >
          <div
            className="
              sticky
              top-2
              z-20
              mb-3
              xl:hidden
            "
          >
            <PlanPreview
              frameCapture={
                frameCapture
              }
              configuration={
                configuration
              }
              selectedId={
                selectedId
              }
              zone={zone}
              onPreviewClick={() =>
                setTab(
                  'video'
                )
              }
            />
          </div>

          <div
            className="
              grid
              min-h-0
              grid-cols-1
              gap-4
            "
          >
            {/* PLANO */}

            <div
              className="
                rounded-[14px]
                border
                border-[#dce8f2]
                bg-[#f9fcff]
                p-3
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
                    text-[11px]
                    font-black
                    text-[#102033]
                  "
                >
                  Plano de la sede
                </h3>

                <span
                  className="
                    text-[8px]
                    font-bold
                    text-[#718096]
                  "
                >
                  Arrastra y ajusta
                </span>
              </div>

              <div
                ref={canvasRef}
                className={`
                  relative
                  mx-auto
                  h-auto
                  w-full
                  max-w-full
                  overflow-hidden
                  rounded-[10px]
                  border
                  border-[#d6e5f1]
                  bg-white
                  touch-none
                  select-none
                `}
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
                {/* GRID */}

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
                    x={
                      view.minX
                    }
                    y={
                      view.minZ
                    }
                    width={
                      view.width
                    }
                    height={
                      view.depth
                    }
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
                          y1={
                            view.minZ
                          }
                          x2={x}
                          y2={
                            view.maxZ
                          }
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
                          x1={
                            view.minX
                          }
                          y1={z}
                          x2={
                            view.maxX
                          }
                          y2={z}
                          stroke="rgba(22,134,232,.10)"
                          strokeWidth="0.05"
                        />
                      )
                    }

                    return lines
                  })()}

                  {snapEnabled &&
                    (() => {
                      const lines =
                        []

                      for (
                        let x =
                          Math.ceil(
                            view.minX /
                              GRID_SNAP
                          ) *
                          GRID_SNAP;
                        x <=
                        view.maxX +
                          1e-6;
                        x +=
                        GRID_SNAP
                      ) {
                        lines.push(
                          <line
                            key={`s${x}`}
                            x1={x}
                            y1={
                              view.minZ
                            }
                            x2={x}
                            y2={
                              view.maxZ
                            }
                            stroke="rgba(22,134,232,.06)"
                            strokeWidth="0.04"
                          />
                        )
                      }

                      for (
                        let z =
                          Math.ceil(
                            view.minZ /
                              GRID_SNAP
                          ) *
                          GRID_SNAP;
                        z <=
                        view.maxZ +
                          1e-6;
                        z +=
                        GRID_SNAP
                      ) {
                        lines.push(
                          <line
                            key={`s${z}`}
                            x1={
                              view.minX
                            }
                            y1={z}
                            x2={
                              view.maxX
                            }
                            y2={z}
                            stroke="rgba(22,134,232,.06)"
                            strokeWidth="0.04"
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
                            ([
                              x,
                              z,
                            ]) =>
                              `${x},${z}`
                          )
                          .join(
                            ' '
                          )}
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
                            ([
                              x,
                              z,
                            ]) =>
                              `${x},${z}`
                          )
                          .join(
                            ' '
                          )}
                        fill="none"
                        stroke="#8abbe7"
                        strokeWidth="0.05"
                        strokeDasharray="0.14 0.1"
                        strokeLinejoin="round"
                      />

                      <text
                        x={
                          handOutline[0][0]
                        }
                        y={
                          handOutline[0][1] +
                          0.8
                        }
                        fill="#5f89ad"
                        fontSize={Math.max(
                          0.28,
                          view.width /
                            48
                        )}
                        fontFamily="ui-monospace, monospace"
                      >
                        PISO
                      </text>
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
                            ([
                              x,
                              z,
                            ]) =>
                              `${x},${z}`
                          )
                          .join(
                            ' '
                          )

                      if (
                        (
                          zoneItem.polygon ||
                          []
                        ).length <
                        3
                      ) {
                        return null
                      }

                      const first =
                        zoneItem.polygon[0]

                      return (
                        <g
                          key={
                            zoneItem.id
                          }
                        >
                          <polygon
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

                          <text
                            x={
                              first[0]
                            }
                            y={
                              first[1] +
                              1
                            }
                            fill="#557b9d"
                            fontSize={Math.max(
                              0.34,
                              view.width /
                                40
                            )}
                            fontFamily="ui-monospace, monospace"
                            fontWeight="bold"
                          >
                            {
                              zoneItem.name
                            }
                          </text>
                        </g>
                      )
                    }
                  )}
                </svg>

                {/* GÓNDOLAS */}

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
                          p-0
                          text-[#102033]
                          shadow-[0_4px_15px_rgba(13,60,105,.16)]
                          transition-shadow
                          duration-150
                          hover:z-[2]
                          hover:border-[#ff641f]
                          ${
                            isSelected
                              ? 'z-[2] border-[#ff641f] bg-[#fff1e9] shadow-[0_4px_22px_rgba(255,100,31,.25)]'
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
                            max-w-[92%]
                            overflow-hidden
                            text-ellipsis
                            whitespace-nowrap
                            text-[8px]
                            font-black
                            text-[#102033]
                          "
                        >
                          {item.name}
                        </span>

                        <span
                          className="
                            pointer-events-none
                            absolute
                            -bottom-[20px]
                            left-1/2
                            -translate-x-1/2
                            whitespace-nowrap
                            rounded-[4px]
                            border
                            border-[#d9e6f1]
                            bg-white
                            px-1.5
                            py-[2px]
                            text-[7px]
                            font-bold
                            text-[#61758c]
                            shadow-sm
                          "
                        >
                          {item.width.toFixed(
                            1
                          )}
                          ×
                          {item.depth.toFixed(
                            1
                          )}
                          m
                        </span>

                        {/* ROTAR */}

                        <i
                          className="
                            absolute
                            -top-[24px]
                            left-1/2
                            h-3
                            w-3
                            -translate-x-1/2
                            cursor-grab
                            touch-none
                            rounded-full
                            border-2
                            border-[#ff641f]
                            bg-white
                            after:absolute
                            after:left-1/2
                            after:top-full
                            after:h-[13px]
                            after:w-px
                            after:-translate-x-1/2
                            after:bg-[#ff641f]
                            after:content-['']
                            active:cursor-grabbing
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
                          title="Rotar"
                        />

                        {/* RESIZE */}

                        <i
                          className="
                            absolute
                            -bottom-px
                            -right-px
                            h-4
                            w-4
                            cursor-nwse-resize
                            touch-none
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

                {!configuration
                  .gondolas
                  .length && (
                  <button
                    type="button"
                    onClick={
                      addGondola
                    }
                    className="
                      absolute
                      inset-[28%]
                      grid
                      cursor-pointer
                      place-items-center
                      rounded-[10px]
                      border-2
                      border-dashed
                      border-[#ff9a68]
                      bg-[#fff6f1]/95
                      px-3
                      text-center
                      text-[10px]
                      font-black
                      text-[#ff5b12]
                      transition
                      hover:bg-[#fff0e8]
                    "
                  >
                    ＋ Dibuja tu primera góndola
                  </button>
                )}
              </div>
            </div>

            {/* =================================================
                GÓNDOLA SELECCIONADA
            ================================================= */}

            <aside
              className="
                min-w-0
                rounded-[14px]
                border
                border-[#dce8f2]
                bg-[#f9fcff]
                p-[18px]
              "
            >
              {selected ? (
                <>
                  <div
                    className="
                      mb-4
                      flex
                      items-center
                      justify-between
                      gap-[10px]
                    "
                  >
                    <div>
                      <span
                        className="
                          text-[8px]
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
                          text-[13px]
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
                        cursor-pointer
                        rounded-[7px]
                        border
                        border-[#ffb79a]
                        bg-[#fff5ef]
                        px-[11px]
                        py-2
                        text-[8px]
                        font-black
                        whitespace-nowrap
                        text-[#e44d22]
                        transition
                        hover:bg-[#ffebe2]
                      "
                    >
                      Eliminar
                    </button>
                  </div>

                  {/* NOMBRE */}

                  <label
                    className="
                      relative
                      grid
                      gap-[5px]
                      text-[8px]
                      font-bold
                      uppercase
                      text-[#61758c]
                    "
                  >
                    Nombre

                    <input
                      className="
                        min-w-0
                        w-full
                        rounded-[7px]
                        border
                        border-[#cdddeb]
                        bg-white
                        p-[9px]
                        text-[9px]
                        font-semibold
                        normal-case
                        text-[#102033]
                        outline-none
                        focus:border-[#1686e8]
                        focus:ring-2
                        focus:ring-[#1686e8]/10
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

                  {/* NUMÉRICOS */}

                  <div
                    className="
                      mt-[12px]
                      grid
                      grid-cols-2
                      gap-[8px]
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

                  {/* ESTADO */}

                  <div
                    className="
                      mt-3
                      rounded-[8px]
                      border
                      border-[#d9e7f2]
                      bg-white
                      px-3
                      py-2
                    "
                  >
                    <span
                      className="
                        block
                        text-[9px]
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

                  {/* PRODUCTOS */}

                  <div
                    className="
                      mt-5
                    "
                  >
                    <span
                      className="
                        block
                        text-[8px]
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
                        mt-[10px]
                        grid
                        grid-cols-3
                        gap-[6px]
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
                                  relative
                                  grid
                                  gap-[5px]
                                  rounded-[7px]
                                  border
                                  border-[#dce8f2]
                                  bg-white
                                  p-[6px]
                                  text-[7px]
                                  font-bold
                                  uppercase
                                  text-[#61758c]
                                "
                              >
                                <small
                                  className="
                                    h-[17px]
                                    text-[6px]
                                    font-bold
                                    leading-[1.25]
                                    text-[#718096]
                                  "
                                >
                                  {row} · {column}
                                </small>

                                <input
                                  className="
                                    min-w-0
                                    w-full
                                    rounded-[5px]
                                    border
                                    border-[#d5e2ed]
                                    bg-[#f9fcff]
                                    px-[6px]
                                    py-[7px]
                                    text-[8px]
                                    font-semibold
                                    normal-case
                                    text-[#102033]
                                    outline-none
                                    transition
                                    focus:border-[#1686e8]
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
                    rounded-[10px]
                    border
                    border-dashed
                    border-[#c9dcec]
                    bg-white
                    px-5
                    text-center
                    text-[10px]
                    font-semibold
                    leading-[1.7]
                    text-[#718096]
                  "
                >
                  Selecciona una góndola para
                  configurar sus segmentos y productos.
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>

      {/* =====================================================
          INFORMACIÓN DE ZONA
      ===================================================== */}

      {(
        handOutline?.length >=
          3 ||
        floor.outline?.length >=
          3
      ) && (
        <div
          className="
            mx-4
            mb-4
            mt-1
            flex
            items-center
            gap-3
            rounded-[9px]
            border
            border-[#cae4fa]
            bg-[#eef7ff]
            px-3
            py-3
            text-[8px]
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
              ? 'Solo referencia visual, no se guarda. Al cerrar o salir de la sede desaparece.'
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
                cursor-pointer
                rounded-[6px]
                border
                border-[#9cc7eb]
                bg-white
                px-[10px]
                py-2
                text-[8px]
                font-black
                text-[#1686e8]
                hover:border-[#1686e8]
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
   INPUT NUMÉRICO REUTILIZABLE
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
        relative
        grid
        gap-[5px]
        text-[7px]
        font-bold
        uppercase
        text-[#61758c]
      "
    >
      {label}

      <input
        className="
          min-w-0
          w-full
          rounded-[7px]
          border
          border-[#cdddeb]
          bg-white
          p-[9px]
          text-[9px]
          font-semibold
          normal-case
          text-[#102033]
          outline-none
          transition
          focus:border-[#1686e8]
          focus:ring-2
          focus:ring-[#1686e8]/10
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