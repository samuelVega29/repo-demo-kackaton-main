import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Crosshair,
  FileVideo,
  Info,
  Play,
  Save,
  ScanLine,
  Sparkles,
  Store,
  X,
} from 'lucide-react'

import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Link,
  Navigate,
  useParams,
} from 'react-router-dom'

import AnalysisStepper from '../components/flow/AnalysisStepper'
import PlanogramEditor from '../components/flow/PlanogramEditor'

import { useApp } from '../context/AppProvider'

import analisisRobot from '../assets/images/analisis_robot2.png'

import {
  forwardHomography,
  projectFloor,
} from '../utils/homography'

import { api } from '../services/client'

/* =========================================================
   CONFIGURACIÓN DE CONFIANZA IA
========================================================= */

const CONFIDENCE_CONFIG = {
  alta: {
    color: '#177345',
    score: 100,
  },

  media: {
    color: '#b26500',
    score: 60,
  },

  baja: {
    color: '#b43b1d',
    score: 25,
  },
}

/* =========================================================
   PANEL RESULTADO IA
========================================================= */

function ConfidencePanel({
  result,
}) {
  if (
    !result?.gondolas?.length
  ) {
    return null
  }

  const gondolas =
    result.gondolas

  const scores =
    gondolas.map(
      (gondola) =>
        CONFIDENCE_CONFIG[
          gondola.confianza
        ]?.score ?? 60
    )

  const globalScore =
    Math.round(
      scores.reduce(
        (
          accumulator,
          current
        ) =>
          accumulator +
          current,
        0
      ) /
        scores.length
    )

  return (
    <div
      className="
        mt-3
        rounded-[10px]
        border
        border-[#cfe2f3]
        bg-[#f4f9ff]
        px-3
        py-2.5
      "
    >
      <div
        className="
          flex
          items-center
          gap-2
        "
      >
        <Sparkles
          size={13}
          className="text-[#ff641f]"
        />

        <span
          className="
            text-[8px]
            font-black
            uppercase
            tracking-[.08em]
            text-[#1686e8]
          "
        >
          Sugerencia de IA aplicada
        </span>
      </div>

      <div
        className="
          mt-2
          flex
          flex-wrap
          items-center
          gap-2
        "
      >
        <b
          className="
            text-[10px]
            font-black
            text-[#102033]
          "
        >
          IA detectó {gondolas.length} góndolas
        </b>

        <span
          className="
            text-[8px]
            font-semibold
            text-[#61758c]
          "
        >
          Acierto global {globalScore}%
        </span>
      </div>

      <div
        className="
          mt-2
          flex
          flex-wrap
          gap-1.5
        "
      >
        {gondolas.map(
          (
            gondola,
            index
          ) => (
            <span
              key={`${gondola.name}-${index}`}
              className="
                inline-flex
                items-center
                gap-1.5
                rounded-full
                border
                border-[#d8e5f0]
                bg-white
                px-2.5
                py-1
                text-[8px]
                font-black
                text-[#102033]
              "
            >
              <span
                className="
                  h-1.5
                  w-1.5
                  rounded-full
                "
                style={{
                  background:
                    CONFIDENCE_CONFIG[
                      gondola.confianza
                    ]?.color ||
                    '#ff5b12',
                }}
              />

              {gondola.name}
            </span>
          )
        )}
      </div>
    </div>
  )
}

/* =========================================================
   PÁGINA
========================================================= */

export default function AnalysisAreaPage() {
  const {
    file,
    preview,
    analyze,
    job,
    analysisArea,
    setAnalysisArea,
    site,
    frameCapture,
    updateConfiguration,
    saveConfiguration,
    onFrameCapture,
  } = useApp()

  const {
    siteId,
  } = useParams()

  const videoRef =
    useRef(null)

  /* =========================================================
     ZONA GUARDADA
  ========================================================= */

  const savedAnalysisArea =
    site?.configuration
      ?.analysis_area ||
    []

  const hasSavedAnalysisArea =
    Array.isArray(
      savedAnalysisArea
    ) &&
    savedAnalysisArea.length >= 4

  /* =========================================================
     ESTADOS
  ========================================================= */

  const [
    tab,
    setTab,
  ] = useState('area')

  const [
    mode,
    setMode,
  ] = useState(
    analysisArea?.length >= 4
      ? 'zone'
      : hasSavedAnalysisArea
        ? 'zone'
        : 'all'
  )

  const [
    points,
    setPoints,
  ] = useState(
    analysisArea?.length >= 4
      ? analysisArea
      : hasSavedAnalysisArea
        ? savedAnalysisArea
        : []
  )

  const [
    zoneSaved,
    setZoneSaved,
  ] = useState(
    hasSavedAnalysisArea
  )

  /* =========================================================
     ESTADO IA
  ========================================================= */

  const [
    layoutSuggesting,
    setLayoutSuggesting,
  ] = useState(false)

  /* =========================================================
     ESTADO CAPTURA FRAME

     IMPORTANTE:
     Es independiente del estado de IA.
  ========================================================= */

  const [
    frameCapturing,
    setFrameCapturing,
  ] = useState(false)

  const [
    layoutMessage,
    setLayoutMessage,
  ] = useState('')

  const [
    layoutResult,
    setLayoutResult,
  ] = useState(null)

  /* =========================================================
     ESTADOS DERIVADOS
  ========================================================= */

  const running =
    job &&
    ![
      'completed',
      'failed',
      'cancelled',
    ].includes(
      job.status
    )

  const gondolas =
    site?.configuration
      ?.gondolas ||
    []

  const hasGondolas =
    gondolas.length >
    0

  const areaReady =
    mode === 'all' ||
    points.length >= 4

  const configReady =
    hasGondolas &&
    areaReady

  const canAnalyze =
    !running &&
    configReady

  const pointPercentage =
    points.length >= 3
      ? Math.min(
          100,
          Math.max(
            1,
            Math.round(
              estimatePolygonArea(
                points
              ) * 100
            )
          )
        )
      : 0

  /* =========================================================
     SINCRONIZAR ÁREA
  ========================================================= */

  useEffect(() => {
    setAnalysisArea(
      mode === 'zone'
        ? points
        : null
    )
  }, [
    mode,
    points,
    setAnalysisArea,
  ])

  /* =========================================================
     RECUPERAR ZONA GUARDADA
  ========================================================= */

  useEffect(() => {
    setTab(
      'area'
    )

    const storedArea =
      site?.configuration
        ?.analysis_area

    if (
      Array.isArray(
        storedArea
      ) &&
      storedArea.length >= 4
    ) {
      setPoints(
        storedArea
      )

      setMode(
        'zone'
      )

      setZoneSaved(
        true
      )

      setAnalysisArea(
        storedArea
      )

      return
    }

    if (
      Array.isArray(
        analysisArea
      ) &&
      analysisArea.length >= 4
    ) {
      setPoints(
        analysisArea
      )

      setMode(
        'zone'
      )

      setZoneSaved(
        true
      )

      return
    }

    setPoints(
      []
    )

    setMode(
      'all'
    )

    setZoneSaved(
      false
    )
  }, [
    preview,
    site?.id,
  ])

  /* =========================================================
     PROTEGER RUTA
  ========================================================= */

  if (
    !file ||
    !preview
  ) {
    return (
      <Navigate
        to={`/sedes/${siteId}/analisis/nuevo`}
        replace
      />
    )
  }

  /* =========================================================
     AGREGAR PUNTOS
  ========================================================= */

  const addPoint =
    (event) => {
      if (
        mode !== 'zone'
      ) {
        return
      }

      const rect =
        event.currentTarget
          .getBoundingClientRect()

      const x =
        Math.max(
          0,
          Math.min(
            1,
            (
              event.clientX -
              rect.left
            ) /
              rect.width
          )
        )

      const y =
        Math.max(
          0,
          Math.min(
            1,
            (
              event.clientY -
              rect.top
            ) /
              rect.height
          )
        )

      setPoints(
        (
          current
        ) => [
          ...current,

          [
            Number(
              x.toFixed(
                4
              )
            ),

            Number(
              y.toFixed(
                4
              )
            ),
          ],
        ]
      )

      setZoneSaved(
        false
      )
    }

  /* =========================================================
     ESPERAR VIDEO
  ========================================================= */

  const waitForVideo =
    async (
      video
    ) => {
      if (
        video.readyState >= 2 &&
        video.videoWidth &&
        video.videoHeight
      ) {
        return true
      }

      return new Promise(
        (
          resolve
        ) => {
          let finished =
            false

          const finish =
            (
              result
            ) => {
              if (
                finished
              ) {
                return
              }

              finished =
                true

              clearTimeout(
                timeout
              )

              video.removeEventListener(
                'loadeddata',
                handleReady
              )

              video.removeEventListener(
                'canplay',
                handleReady
              )

              video.removeEventListener(
                'error',
                handleError
              )

              resolve(
                result
              )
            }

          const handleReady =
            () => {
              finish(
                Boolean(
                  video.videoWidth &&
                    video.videoHeight
                )
              )
            }

          const handleError =
            () => {
              finish(
                false
              )
            }

          const timeout =
            setTimeout(
              () => {
                finish(
                  false
                )
              },
              5000
            )

          video.addEventListener(
            'loadeddata',
            handleReady
          )

          video.addEventListener(
            'canplay',
            handleReady
          )

          video.addEventListener(
            'error',
            handleError
          )

          if (
            video.readyState ===
            0
          ) {
            try {
              video.load()
            } catch {
              finish(
                false
              )
            }
          }
        }
      )
    }

  /* =========================================================
     CAPTURAR / RECAPTURAR FRAME

     SOLO HACE ESTO:
     - toma una captura del video
     - actualiza frameCapture

     NO ejecuta IA.
     NO genera góndolas.
     NO modifica las góndolas existentes.
  ========================================================= */

  const captureFrame =
    async ({
      showMessage = true,
    } = {}) => {
      if (
        frameCapturing
      ) {
        return null
      }

      setFrameCapturing(
        true
      )

      try {
        const video =
          videoRef.current

        if (!video) {
          if (
            showMessage
          ) {
            setLayoutMessage(
              'Error: no se pudo acceder al video.'
            )
          }

          return null
        }

        const ready =
          await waitForVideo(
            video
          )

        if (!ready) {
          if (
            showMessage
          ) {
            setLayoutMessage(
              'Error: el video todavía no está listo.'
            )
          }

          return null
        }

        const width =
          video.videoWidth

        const height =
          video.videoHeight

        if (
          !width ||
          !height
        ) {
          if (
            showMessage
          ) {
            setLayoutMessage(
              'Error: no se pudo obtener la resolución del video.'
            )
          }

          return null
        }

        const canvas =
          document.createElement(
            'canvas'
          )

        canvas.width =
          width

        canvas.height =
          height

        const context =
          canvas.getContext(
            '2d'
          )

        if (!context) {
          if (
            showMessage
          ) {
            setLayoutMessage(
              'Error: no se pudo crear la captura.'
            )
          }

          return null
        }

        context.drawImage(
          video,
          0,
          0,
          width,
          height
        )

        const dataUrl =
          canvas.toDataURL(
            'image/jpeg',
            0.85
          )

        const capture = {
          dataUrl,
          width,
          height,
        }

        /*
          IMPORTANTE:

          onFrameCapture actualiza únicamente
          reference_frame dentro de configuration.

          Las góndolas existentes se conservan.
        */

        onFrameCapture(
          dataUrl,
          width,
          height
        )

        if (
          showMessage
        ) {
          setLayoutMessage(
            'Frame recapturado correctamente.'
          )
        }

        return capture
      } catch (
        error
      ) {
        if (
          showMessage
        ) {
          setLayoutMessage(
            `Error al capturar frame: ${error.message}`
          )
        }

        return null
      } finally {
        setFrameCapturing(
          false
        )
      }
    }

  /* =========================================================
     SUGERIR GÓNDOLAS CON IA

     SOLO se ejecuta al presionar el botón:
     "Sugerir góndolas con IA"

     NO captura el frame.
  ========================================================= */

  const suggestLayoutAutomatically =
    async () => {
      if (
        layoutSuggesting
      ) {
        return false
      }

      if (!file) {
        setLayoutMessage(
          'Error: no se encontró un video cargado.'
        )

        return false
      }

      setLayoutSuggesting(
        true
      )

      setLayoutResult(
        null
      )

      setLayoutMessage(
        'Analizando el video y detectando góndolas...'
      )

      try {
        const body =
          new FormData()

        body.append(
          'video',
          file,
          file.name ||
            'video.mp4'
        )

        const result =
          await api(
            `/api/sites/${siteId}/layout-suggestions`,
            {
              method:
                'POST',

              body,
            }
          )

        const rawGondolas =
          Array.isArray(
            result?.gondolas
          )
            ? result.gondolas
            : []

        const coloredGondolas =
          rawGondolas.map(
            (
              gondola,
              index
            ) => ({
              ...gondola,

              name:
                gondola.name ||
                `Góndola ${index + 1}`,

              color:
                CONFIDENCE_CONFIG[
                  gondola.confianza
                ]?.color ??
                '#b26500',
            })
          )

        if (
          coloredGondolas.length ===
          0
        ) {
          setLayoutMessage(
            'No se detectaron góndolas automáticamente. Puedes agregarlas manualmente con “+ Añadir góndola”.'
          )

          return false
        }

        /*
          IMPORTANTE:

          Este botón conserva:
          - reference_frame
          - camera
          - floor
          - analysis_area

          Solamente reemplaza gondolas.
        */

        const nextConfiguration = {
          ...site.configuration,

          gondolas:
            coloredGondolas,
        }

        updateConfiguration(
          nextConfiguration
        )

        try {
          await saveConfiguration(
            nextConfiguration
          )
        } catch (
          saveError
        ) {
          console.warn(
            'No se pudieron guardar automáticamente las góndolas:',
            saveError
          )
        }

        setLayoutResult({
          ...result,

          gondolas:
            coloredGondolas,
        })

        setLayoutMessage(
          `Listo: se detectaron ${coloredGondolas.length} góndola${
            coloredGondolas.length ===
            1
              ? ''
              : 's'
          } automáticamente.`
        )

        return true
      } catch (
        error
      ) {
        setLayoutMessage(
          `Error: ${error.message}`
        )

        return false
      } finally {
        setLayoutSuggesting(
          false
        )
      }
    }

  /* =========================================================
     GUARDAR ZONA
  ========================================================= */

  const saveZone =
    async () => {
      if (
        mode !== 'zone' ||
        points.length < 4
      ) {
        return false
      }

      const forward =
        forwardHomography(
          site.configuration
            .camera
        )

      const meters =
        points
          .map(
            ([
              nx,
              ny,
            ]) =>
              forward
                ? projectFloor(
                    forward,
                    nx,
                    ny
                  )
                : null
          )
          .filter(
            Boolean
          )
          .filter(
            (point) =>
              Number.isFinite(
                point[0]
              ) &&
              Number.isFinite(
                point[1]
              )
          )
          .map(
            ([
              x,
              z,
            ]) => [
              Math.round(
                x * 100
              ) / 100,

              Math.round(
                z * 100
              ) / 100,
            ]
          )

      if (
        meters.length <
        3
      ) {
        return false
      }

      const normalizedPoints =
        points.map(
          ([
            x,
            y,
          ]) => [
            Number(
              x.toFixed(
                4
              )
            ),

            Number(
              y.toFixed(
                4
              )
            ),
          ]
        )

      const next = {
        ...site.configuration,

        analysis_area:
          normalizedPoints,

        floor: {
          ...site
            .configuration
            .floor,

          outline:
            meters,
        },
      }

      updateConfiguration(
        next
      )

      try {
        await saveConfiguration(
          next
        )

        setPoints(
          normalizedPoints
        )

        setAnalysisArea(
          normalizedPoints
        )

        setZoneSaved(
          true
        )

        return true
      } catch {
        setZoneSaved(
          false
        )

        return false
      }
    }

  /* =========================================================
     LIMPIAR ZONA
  ========================================================= */

  const clearZone =
    async () => {
      const next = {
        ...site.configuration,

        analysis_area: [],

        floor: {
          ...site
            .configuration
            .floor,

          outline: [],
        },
      }

      updateConfiguration(
        next
      )

      setZoneSaved(
        false
      )

      setPoints(
        []
      )

      setAnalysisArea(
        null
      )

      setMode(
        'all'
      )

      try {
        await saveConfiguration(
          next
        )
      } catch {
        setZoneSaved(
          false
        )
      }
    }

  /* =========================================================
     TODA LA CÁMARA
  ========================================================= */

  const selectAllCamera =
    () => {
      setMode(
        'all'
      )
    }

  /* =========================================================
     SELECCIONAR ZONA
  ========================================================= */

  const selectZone =
    () => {
      setMode(
        'zone'
      )

      const storedArea =
        site?.configuration
          ?.analysis_area

      if (
        points.length ===
          0 &&
        Array.isArray(
          storedArea
        ) &&
        storedArea.length >=
          4
      ) {
        setPoints(
          storedArea
        )

        setZoneSaved(
          true
        )
      }
    }

  /* =========================================================
     CONTINUAR A GÓNDOLAS

     Captura el frame inicial,
     pero NO ejecuta IA.
  ========================================================= */

  const continueToGondolas =
    async () => {
      if (
        !areaReady
      ) {
        return
      }

      if (
        mode === 'zone' &&
        !zoneSaved
      ) {
        const saved =
          await saveZone()

        if (!saved) {
          return
        }
      }

      const capture =
        await captureFrame({
          showMessage:
            false,
        })

      if (!capture) {
        return
      }

      setTab(
        'gondolas'
      )

      window.scrollTo({
        top: 0,
        behavior:
          'smooth',
      })
    }

  /* =========================================================
     ANALIZAR
  ========================================================= */

  const start =
    async () => {
      if (
        !canAnalyze
      ) {
        return
      }

      try {
        await saveConfiguration(
          site.configuration
        )
      } catch {
        // Usa la configuración actual.
      }

      analyze(
        mode === 'zone'
          ? points
          : null
      )
    }

  /* =========================================================
     PASO 3
  ========================================================= */

  if (
    tab ===
    'gondolas'
  ) {
    return (
      <main
        className="
          relative
          isolate
          min-h-[calc(100vh-52px)]
          w-full
          overflow-x-hidden
          bg-[linear-gradient(105deg,#064587_0%,#0878c9_22%,#21a0e8_42%,#8fd0f7_62%,#dff2ff_80%,#f5fbff_100%)]
        "
      >
        {/* =================================================
            VIDEO OCULTO PARA RECAPTURAR

            Necesario porque el video del Paso 2
            se desmonta al entrar al Paso 3.

            Este video NO se muestra.
        ================================================= */}

        <video
          ref={
            videoRef
          }
          src={
            preview
          }
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="
            pointer-events-none
            fixed
            -left-[10000px]
            -top-[10000px]
            h-px
            w-px
            opacity-0
          "
          onLoadedMetadata={(
            event
          ) => {
            const video =
              event.currentTarget

            if (
              Number.isFinite(
                video.duration
              ) &&
              video.duration >
                0
            ) {
              video.currentTime =
                Math.min(
                  0.1,
                  video.duration
                )
            }
          }}
        />

        {/* DECORACIÓN */}

        <div
          className="
            pointer-events-none
            absolute
            -left-[510px]
            top-[20px]
            -z-10
            h-[980px]
            w-[980px]
            rounded-full
            border-[100px]
            border-[#0b64b2]/20
          "
        />

        <div
          className="
            pointer-events-none
            absolute
            -left-[160px]
            top-[170px]
            -z-10
            h-[720px]
            w-[720px]
            rounded-full
            bg-[radial-gradient(circle,rgba(5,62,121,.42)_0%,rgba(3,42,84,.23)_50%,transparent_74%)]
          "
        />

        <div
          className="
            pointer-events-none
            absolute
            left-4
            top-[70px]
            hidden
            grid-cols-5
            gap-[7px]
            xl:grid
          "
        >
          {Array.from({
            length: 30,
          }).map(
            (
              _,
              index
            ) => (
              <span
                key={
                  index
                }
                className="
                  h-[3px]
                  w-[3px]
                  rounded-full
                  bg-[#6ec1ff]/45
                "
              />
            )
          )}
        </div>

        <div
          className="
            relative
            z-10
            mx-auto
            w-full
            max-w-[1320px]
            px-4
            pb-8
            pt-3
            sm:px-5
            lg:px-6
          "
        >
          {/* STEPPER */}

          <div
            className="
              mx-auto
              mb-4
              w-full
              max-w-[760px]
            "
          >
            <AnalysisStepper
              currentStep={3}
            />
          </div>

          {/* GRID */}

          <div
            className="
              mx-auto
              grid
              w-full
              max-w-[1180px]
              gap-3
              lg:grid-cols-[minmax(0,1fr)_270px]
              lg:items-stretch
            "
          >
            {/* TARJETA CENTRAL */}

            <section
              className="
                min-w-0
                overflow-hidden
                rounded-[18px]
                border
                border-[#c9dcec]
                bg-white
                shadow-[0_18px_46px_-30px_rgba(4,43,87,.38)]
              "
            >
              {/* HEADER */}

              <div
                className="
                  px-4
                  pb-0
                  pt-4
                  sm:px-5
                "
              >
                <div
                  className="
                    flex
                    flex-col
                    gap-3
                    sm:flex-row
                    sm:items-start
                    sm:justify-between
                  "
                >
                  <div
                    className="
                      min-w-0
                    "
                  >
                    <span
                      className="
                        text-[8px]
                        font-black
                        uppercase
                        tracking-[.08em]
                        text-[#ff641f]
                      "
                    >
                      Paso 3
                    </span>

                    <h1
                      className="
                        mt-1
                        text-[22px]
                        font-black
                        leading-[1.05]
                        tracking-[-0.04em]
                        text-[#102033]
                      "
                    >
                      Ubica las góndolas sobre el frame
                    </h1>

                    <p
                      className="
                        mt-1.5
                        max-w-[620px]
                        text-[8px]
                        font-semibold
                        leading-[14px]
                        text-[#667991]
                      "
                    >
                      Añade, arrastra y ajusta cada góndola.
                      Esta configuración se reutiliza en futuros
                      análisis de la sede.
                    </p>
                  </div>

                  {/* =================================================
                      BOTONES INDEPENDIENTES
                  ================================================= */}

                  <div
                    className="
                      flex
                      w-full
                      shrink-0
                      flex-col
                      gap-1.5
                      sm:w-[180px]
                    "
                  >
                    {/* =========================================
                        BOTÓN IA

                        SOLO genera góndolas.
                    ========================================= */}

                    <button
                      type="button"
                      onClick={
                        suggestLayoutAutomatically
                      }
                      disabled={
                        layoutSuggesting ||
                        frameCapturing
                      }
                      className="
                        inline-flex
                        min-h-[34px]
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-[7px]
                        bg-[#102033]
                        px-3
                        text-[8px]
                        font-black
                        text-white
                        shadow-[0_8px_18px_-12px_rgba(16,32,51,.75)]
                        transition
                        hover:-translate-y-px
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                      "
                    >
                      <Sparkles
                        size={12}
                        className="
                          text-[#ff641f]
                        "
                      />

                      {layoutSuggesting
                        ? 'Detectando góndolas...'
                        : 'Sugerir góndolas con IA'}
                    </button>

                    {/* =========================================
                        BOTÓN RECAPTURAR

                        SOLO cambia el frame.
                    ========================================= */}

                    <button
                      type="button"
                      onClick={() =>
                        captureFrame({
                          showMessage:
                            true,
                        })
                      }
                      disabled={
                        frameCapturing ||
                        layoutSuggesting
                      }
                      className="
                        inline-flex
                        min-h-[34px]
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-[7px]
                        border
                        border-[#ff641f]
                        bg-white
                        px-3
                        text-[8px]
                        font-black
                        text-[#ff641f]
                        transition
                        hover:bg-[#fff5ef]
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                      "
                    >
                      <Camera
                        size={12}
                      />

                      {frameCapturing
                        ? 'Recapturando...'
                        : frameCapture
                          ? 'Recapturar frame'
                          : 'Capturar frame'}
                    </button>
                  </div>
                </div>

                {/* MENSAJE */}

                {layoutMessage && (
                  <p
                    className={`
                      mt-2
                      rounded-[7px]
                      border
                      px-3
                      py-2
                      text-[8px]
                      font-bold

                      ${
                        layoutMessage.includes(
                          'Error'
                        ) ||
                        layoutMessage.includes(
                          'No se detectaron'
                        )
                          ? 'border-[#ffd5c5] bg-[#fff1eb] text-red-600'
                          : 'border-[#c8ecda] bg-[#effbf5] text-[#177345]'
                      }
                    `}
                  >
                    {layoutMessage}
                  </p>
                )}

                {layoutResult && (
                  <ConfidencePanel
                    result={
                      layoutResult
                    }
                  />
                )}

                {/* INFORMACIÓN */}

                <div
                  className="
                    mt-3
                    flex
                    items-center
                    gap-2.5
                    rounded-[8px]
                    border
                    border-[#cae4fa]
                    bg-[#eef7ff]
                    px-3
                    py-2
                  "
                >
                  <Info
                    size={13}
                    className="
                      shrink-0
                      text-[#1686e8]
                    "
                  />

                  <p
                    className="
                      text-[7.5px]
                      font-semibold
                      leading-[13px]
                      text-[#527090]
                    "
                  >
                    Usa “Sugerir góndolas con IA” para generarlas
                    automáticamente. “Recapturar frame” únicamente
                    cambia la imagen de referencia y conserva las
                    góndolas existentes.
                  </p>
                </div>
              </div>

              {/* PLANOGRAMA */}

              <div
                className="
                  mx-4
                  mb-4
                  mt-3
                  overflow-hidden
                  rounded-[12px]
                  border
                  border-[#d8e5ef]
                  bg-white
                "
              >
                <PlanogramEditor
                  configuration={
                    site.configuration
                  }
                  onChange={
                    updateConfiguration
                  }
                  onSave={
                    saveConfiguration
                  }
                  frameCapture={
                    frameCapture
                  }
                  zone={
                    mode === 'zone'
                      ? points
                      : null
                  }
                />
              </div>
            </section>

            {/* PANEL DERECHO */}

            <aside
              className="
                flex
                min-h-[610px]
                flex-col
                rounded-[18px]
                border
                border-[#c9dcec]
                bg-white
                p-4
                shadow-[0_18px_46px_-30px_rgba(4,43,87,.32)]
              "
            >
              <div
                className="
                  mb-2
                  text-[#ff641f]
                "
              >
                <Play
                  size={27}
                  fill="#ff641f"
                  strokeWidth={
                    1.4
                  }
                />
              </div>

              <span
                className="
                  text-[8px]
                  font-black
                  uppercase
                  tracking-[.08em]
                  text-[#ff641f]
                "
              >
                Paso 3
              </span>

              <h2
                className="
                  mt-1
                  text-[17px]
                  font-black
                  tracking-[-0.03em]
                  text-[#102033]
                "
              >
                Configurar góndolas
              </h2>

              <p
                className="
                  mt-2
                  text-[8px]
                  font-semibold
                  leading-[15px]
                  text-[#667991]
                "
              >
                Cuando haya al menos una góndola guardada,
                puedes lanzar el análisis.
              </p>

              <StatusCard
                active
                className="mt-3"
                icon={
                  FileVideo
                }
                title="Video cargado correctamente"
                description={
                  file.name
                }
              />

              <StatusCard
                active={
                  areaReady
                }
                className="mt-1.5"
                icon={
                  Crosshair
                }
                title={
                  mode === 'all'
                    ? 'Toda la cámara seleccionada'
                    : `${points.length}/4 puntos del área`
                }
                description={
                  mode === 'all'
                    ? 'Se analizará el video completo.'
                    : `${pointPercentage}% aproximado del frame`
                }
              />

              <StatusCard
                active={
                  mode === 'all' ||
                  zoneSaved
                }
                className="mt-1.5"
                icon={
                  Save
                }
                title={
                  mode === 'all'
                    ? 'Sin recorte adicional'
                    : zoneSaved
                      ? 'Zona guardada en el plano'
                      : 'Zona pendiente'
                }
                description={
                  mode === 'all'
                    ? 'Área completa disponible.'
                    : zoneSaved
                      ? 'Lista para configurar góndolas.'
                      : 'Guarda la zona antes de continuar.'
                }
              />

              <StatusCard
                active={
                  hasGondolas
                }
                className="mt-1.5"
                icon={
                  Store
                }
                title={
                  hasGondolas
                    ? `${gondolas.length} góndola${
                        gondolas.length ===
                        1
                          ? ''
                          : 's'
                      } guardada${
                        gondolas.length ===
                        1
                          ? ''
                          : 's'
                      }`
                    : 'Góndolas pendientes'
                }
                description={
                  hasGondolas
                    ? 'Puedes añadir más si lo necesitas.'
                    : 'Usa la IA o añade una góndola manualmente.'
                }
              />

              {!hasGondolas && (
                <div
                  className="
                    mt-2
                    rounded-[8px]
                    border
                    border-[#ffdfd0]
                    bg-[#fff4ee]
                    px-3
                    py-2
                    text-[7.5px]
                    font-bold
                    leading-[13px]
                    text-[#b74322]
                  "
                >
                  Todavía no hay góndolas. Usa “Sugerir
                  góndolas con IA” o “+ Añadir góndola”.
                </div>
              )}

              {job?.status ===
                'failed' && (
                <p
                  className="
                    mt-2
                    rounded-[8px]
                    bg-[#fff1eb]
                    px-3
                    py-2
                    text-[8px]
                    font-bold
                    text-[#b43b1d]
                  "
                >
                  {job.message}
                </p>
              )}

              <button
                type="button"
                disabled={
                  !canAnalyze
                }
                onClick={
                  start
                }
                className="
                  mt-3
                  inline-flex
                  min-h-[38px]
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-[8px]
                  bg-gradient-to-r
                  from-[#ff5b12]
                  to-[#ff741f]
                  px-3
                  text-[9px]
                  font-black
                  text-white
                  shadow-[0_10px_20px_-14px_rgba(255,91,18,.85)]
                  transition
                  hover:-translate-y-px
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                {running
                  ? 'Iniciando...'
                  : 'Guardar y analizar'}

                {!running && (
                  <ArrowRight
                    size={13}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTab(
                    'area'
                  )

                  window.scrollTo({
                    top: 0,
                    behavior:
                      'smooth',
                  })
                }}
                className="
                  mt-2
                  inline-flex
                  min-h-[34px]
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-[7px]
                  border
                  border-[#d7e3ee]
                  bg-white
                  px-3
                  text-[8px]
                  font-black
                  text-[#102033]
                  transition
                  hover:border-[#ff641f]
                "
              >
                <ArrowLeft
                  size={12}
                />

                Volver al área
              </button>

              <Link
                to={`/sedes/${siteId}/analisis/nuevo`}
                className="
                  mt-2
                  inline-flex
                  min-h-[34px]
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-[7px]
                  border
                  border-[#d7e3ee]
                  bg-white
                  px-3
                  text-[8px]
                  font-black
                  text-[#102033]
                  no-underline
                  transition
                  hover:border-[#ff641f]
                "
              >
                <ArrowLeft
                  size={12}
                />

                Cambiar video
              </Link>
            </aside>
          </div>
        </div>
      </main>
    )
  }

  /* =========================================================
     PASO 2
  ========================================================= */

  return (
    <main
      className="
        relative
        isolate
        min-h-[calc(100vh-52px)]
        w-full
        overflow-x-hidden
        bg-[linear-gradient(105deg,#02182f_0%,#07549c_18%,#148ada_35%,#8ac8f4_54%,#e7f4ff_76%,#f8fbff_100%)]
      "
    >
      {/* DECORACIÓN IZQUIERDA */}

      <div
        className="
          pointer-events-none
          absolute
          -left-[370px]
          top-[40px]
          -z-10
          h-[820px]
          w-[820px]
          rounded-full
          border-[85px]
          border-[#0d63b3]/20
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -left-[130px]
          top-[170px]
          -z-10
          h-[580px]
          w-[580px]
          rounded-full
          bg-[radial-gradient(circle,rgba(4,63,124,.46)_0%,rgba(4,41,83,.23)_48%,transparent_74%)]
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -right-[300px]
          bottom-[-170px]
          -z-10
          h-[650px]
          w-[650px]
          rounded-full
          border-[60px]
          border-[#78bfff]/10
        "
      />

      <div
        className="
          relative
          z-10
          mx-auto
          w-full
          max-w-[1360px]
          px-4
          pb-8
          pt-3
          sm:px-6
          lg:px-7
        "
      >
        {/* STEPPER */}

        <div
          className="
            mx-auto
            mb-5
            w-full
            max-w-[830px]
            xl:ml-[248px]
            xl:mr-0
          "
        >
          <AnalysisStepper
            currentStep={2}
          />
        </div>

        <div
          className="
            relative
            mx-auto
            w-full
            max-w-[1080px]
            xl:ml-[248px]
            xl:mr-0
          "
        >
          {/* ROBOT */}

          <aside
            className="
              pointer-events-none
              absolute
              -left-[245px]
              top-[5px]
              z-20
              hidden
              h-[610px]
              w-[265px]
              xl:block
            "
          >
            <div
              className="
                absolute
                left-[-4px]
                top-[18px]
                z-30
                -rotate-[3deg]
              "
            >
              <p
                className="
                  text-[22px]
                  font-black
                  italic
                  leading-[1]
                  tracking-[-0.04em]
                  text-white
                "
              >
                Tu video,
                <br />

                <span
                  className="
                    text-[#48adff]
                  "
                >
                  nuestros insights
                </span>
              </p>

              <span
                className="
                  mt-3
                  block
                  h-[4px]
                  w-[130px]
                  -rotate-[5deg]
                  rounded-full
                  bg-[#ff641f]
                "
              />

              <p
                className="
                  mt-5
                  max-w-[190px]
                  text-[12px]
                  font-semibold
                  leading-5
                  text-white/90
                "
              >
                Selecciona el área ideal y obtén análisis
                precisos para tu negocio.
              </p>
            </div>

            <div
              className="
                absolute
                bottom-[60px]
                left-[-50px]
                h-[320px]
                w-[320px]
                rounded-full
                bg-[radial-gradient(circle,rgba(43,153,245,.38)_0%,rgba(11,86,164,.18)_52%,transparent_74%)]
              "
            />

            <img
              src={
                analisisRobot
              }
              alt="Robot de Scapder"
              className="
                absolute
                bottom-[30px]
                right-[-3px]
                z-20
                w-[275px]
                max-w-none
                select-none
                object-contain
                drop-shadow-[0_22px_30px_rgba(0,26,63,.34)]
              "
            />

            <div
              className="
                absolute
                bottom-[40px]
                left-[15px]
                z-30
                -rotate-[4deg]
              "
            >
              <p
                className="
                  text-[16px]
                  font-black
                  italic
                  leading-[1]
                  text-white
                "
              >
                Analiza
                <br />
                Detecta
                <br />
                Mejora
              </p>

              <span
                className="
                  mt-2
                  block
                  h-[3px]
                  w-[75px]
                  -rotate-[6deg]
                  rounded-full
                  bg-[#ff641f]
                "
              />
            </div>
          </aside>

          {/* GRID */}

          <div
            className="
              grid
              gap-3
              lg:grid-cols-[minmax(0,1fr)_330px]
              lg:items-stretch
            "
          >
            {/* VIDEO */}

            <section
              className="
                min-w-0
                rounded-[22px]
                border
                border-[#c9dcec]
                bg-white
                p-5
                shadow-[0_18px_48px_-30px_rgba(4,43,87,.35)]
              "
            >
              <AreaPanel
                addPoint={
                  addPoint
                }
                mode={
                  mode
                }
                points={
                  points
                }
                preview={
                  preview
                }
                selectAllCamera={
                  selectAllCamera
                }
                selectZone={
                  selectZone
                }
                videoRef={
                  videoRef
                }
                zoneSaved={
                  zoneSaved
                }
              />
            </section>

            {/* PANEL DERECHO */}

            <aside
              className="
                flex
                min-h-[600px]
                flex-col
                rounded-[22px]
                border
                border-[#c9dcec]
                bg-white
                p-4
                shadow-[0_18px_48px_-30px_rgba(4,43,87,.32)]
              "
            >
              <div
                className="
                  mb-3
                  text-[#ff641f]
                "
              >
                <Play
                  size={34}
                />
              </div>

              <span
                className="
                  text-[9px]
                  font-black
                  uppercase
                  tracking-[.08em]
                  text-[#ff641f]
                "
              >
                Paso 2
              </span>

              <h2
                className="
                  mt-1
                  text-[20px]
                  font-black
                  tracking-[-0.03em]
                  text-[#102033]
                "
              >
                Área del análisis
              </h2>

              <p
                className="
                  mt-1
                  text-[10px]
                  font-semibold
                  leading-5
                  text-[#667991]
                "
              >
                Revisa la información de la zona seleccionada.
              </p>

              <StatusCard
                active
                className="mt-4"
                icon={
                  FileVideo
                }
                title="Video cargado correctamente"
                description={
                  file.name
                }
              />

              <StatusCard
                active={
                  areaReady
                }
                className="mt-2"
                icon={
                  Crosshair
                }
                title={
                  mode === 'all'
                    ? 'Toda la cámara seleccionada'
                    : zoneSaved
                      ? 'Zona guardada seleccionada'
                      : 'Área seleccionada'
                }
                description={
                  mode === 'all'
                    ? 'Se analizará el 100% del video.'
                    : zoneSaved
                      ? `${points.length} puntos recuperados de la configuración.`
                      : `${points.length} puntos del área`
                }
              />

              <StatusCard
                active={
                  mode === 'all' ||
                  zoneSaved
                }
                className="mt-2"
                icon={
                  Save
                }
                title={
                  mode === 'all'
                    ? 'Sin recorte adicional'
                    : zoneSaved
                      ? 'Zona guardada'
                      : 'Zona sin guardar'
                }
                description={
                  mode === 'all'
                    ? 'Se analizará toda la cámara.'
                    : zoneSaved
                      ? 'Zona recuperada y lista para continuar.'
                      : 'Guarda la zona antes de continuar.'
                }
              />

              <StatusCard
                active={
                  hasGondolas
                }
                className="mt-2"
                icon={
                  Store
                }
                title={
                  hasGondolas
                    ? `${gondolas.length} góndola${
                        gondolas.length ===
                        1
                          ? ''
                          : 's'
                      } guardada${
                        gondolas.length ===
                        1
                          ? ''
                          : 's'
                      }`
                    : 'Configurar góndolas'
                }
                description={
                  hasGondolas
                    ? 'Configuración existente de la sede.'
                    : 'Este será el siguiente paso.'
                }
              />

              {/* DIBUJAR NUEVA ZONA */}

              {mode ===
                'zone' &&
                points.length >
                  0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPoints(
                        []
                      )

                      setAnalysisArea(
                        null
                      )

                      setZoneSaved(
                        false
                      )
                    }}
                    className="
                      mt-3
                      inline-flex
                      min-h-[36px]
                      w-full
                      items-center
                      justify-center
                      gap-2
                      rounded-[9px]
                      border
                      border-[#d8e4ee]
                      bg-white
                      px-4
                      text-[9px]
                      font-black
                      text-[#102033]
                      transition
                      hover:border-[#ff641f]
                    "
                  >
                    <X
                      size={13}
                    />

                    Dibujar una zona nueva
                  </button>
                )}

              {/* GUARDAR ZONA */}

              {mode ===
                'zone' &&
                points.length >=
                  4 &&
                !zoneSaved && (
                  <button
                    type="button"
                    onClick={
                      saveZone
                    }
                    className="
                      mt-2
                      inline-flex
                      min-h-[36px]
                      w-full
                      items-center
                      justify-center
                      gap-2
                      rounded-[9px]
                      border
                      border-[#ff641f]
                      bg-[#fff5ef]
                      px-4
                      text-[9px]
                      font-black
                      text-[#ff641f]
                      transition
                      hover:bg-[#ffede3]
                    "
                  >
                    <Save
                      size={13}
                    />

                    Guardar zona
                  </button>
                )}

              {/* QUITAR ZONA */}

              {site
                ?.configuration
                ?.floor
                ?.outline
                ?.length >
                0 && (
                <button
                  type="button"
                  onClick={
                    clearZone
                  }
                  className="
                    mt-2
                    inline-flex
                    min-h-[36px]
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-[9px]
                    border
                    border-[#d8e4ee]
                    bg-white
                    px-4
                    text-[9px]
                    font-black
                    text-[#102033]
                    transition
                    hover:border-[#ff641f]
                    hover:text-[#ff641f]
                  "
                >
                  <X
                    size={13}
                  />

                  Quitar zona guardada
                </button>
              )}

              {/* CONTINUAR */}

              <button
                type="button"
                disabled={
                  !areaReady
                }
                onClick={
                  continueToGondolas
                }
                className="
                  mt-4
                  inline-flex
                  min-h-[44px]
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-[9px]
                  bg-gradient-to-r
                  from-[#ff5b12]
                  to-[#ff741f]
                  px-4
                  text-[11px]
                  font-black
                  text-white
                  shadow-[0_10px_25px_-12px_rgba(255,91,18,.8)]
                  transition
                  hover:-translate-y-0.5
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                Continuar a góndolas

                <ArrowRight
                  size={15}
                />
              </button>

              <Link
                to={`/sedes/${siteId}/analisis/nuevo`}
                className="
                  mt-2
                  inline-flex
                  min-h-[38px]
                  w-full
                  items-center
                  justify-center
                  gap-2
                  rounded-[9px]
                  border
                  border-[#d8e4ee]
                  bg-white
                  px-4
                  text-[9px]
                  font-black
                  text-[#102033]
                  no-underline
                  transition
                  hover:border-[#ff641f]
                "
              >
                <ArrowLeft
                  size={14}
                />

                Cambiar video
              </Link>
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}

/* =========================================================
   PANEL PASO 2
========================================================= */

function AreaPanel({
  addPoint,
  mode,
  points,
  preview,
  selectAllCamera,
  selectZone,
  videoRef,
  zoneSaved,
}) {
  return (
    <>
      <span
        className="
          text-[10px]
          font-black
          uppercase
          tracking-[.08em]
          text-[#ff641f]
        "
      >
        Paso 2
      </span>

      <h1
        className="
          mt-1
          text-[26px]
          font-black
          leading-tight
          tracking-[-0.04em]
          text-[#102033]
        "
      >
        Elige qué parte del video se analiza
      </h1>

      <p
        className="
          mt-2
          max-w-[700px]
          text-[10px]
          font-semibold
          leading-[17px]
          text-[#667991]
        "
      >
        Selecciona toda la cámara o dibuja un área
        específica. Usa mínimo 4 puntos para cerrar una
        zona confiable.
      </p>

      {/* OPCIONES */}

      <div
        className="
          mt-4
          grid
          gap-3
          sm:grid-cols-2
        "
      >
        <button
          type="button"
          onClick={
            selectAllCamera
          }
          className={`
            relative
            min-h-[78px]
            rounded-[12px]
            border
            p-4
            text-left
            transition

            ${
              mode === 'all'
                ? 'border-[#ff641f] bg-[#fff7f2]'
                : 'border-[#d6e4f1] bg-white hover:border-[#ff9b6c]'
            }
          `}
        >
          <div
            className="
              flex
              items-start
              gap-3
            "
          >
            <ScanLine
              size={27}
              className={
                mode === 'all'
                  ? 'text-[#ff641f]'
                  : 'text-[#60778f]'
              }
            />

            <div>
              <b
                className="
                  block
                  text-[11px]
                  font-black
                  text-[#102033]
                "
              >
                Toda la cámara
              </b>

              <span
                className="
                  mt-1
                  block
                  text-[8px]
                  font-semibold
                  text-[#61758c]
                "
              >
                Analiza todo lo que se ve en el video.
              </span>
            </div>
          </div>

          <span
            className={`
              absolute
              right-4
              top-4
              h-4
              w-4
              rounded-full
              border-2

              ${
                mode === 'all'
                  ? 'border-[#ff641f] bg-[#ff641f] shadow-[inset_0_0_0_3px_white]'
                  : 'border-[#9bb0c7] bg-white'
              }
            `}
          />
        </button>

        <button
          type="button"
          onClick={
            selectZone
          }
          className={`
            relative
            min-h-[78px]
            rounded-[12px]
            border
            p-4
            text-left
            transition

            ${
              mode === 'zone'
                ? 'border-[#ff641f] bg-[#fff7f2]'
                : 'border-[#d6e4f1] bg-white hover:border-[#ff9b6c]'
            }
          `}
        >
          <div
            className="
              flex
              items-start
              gap-3
            "
          >
            <Crosshair
              size={27}
              className={
                mode === 'zone'
                  ? 'text-[#ff641f]'
                  : 'text-[#60778f]'
              }
            />

            <div>
              <b
                className="
                  block
                  text-[11px]
                  font-black
                  text-[#102033]
                "
              >
                {zoneSaved
                  ? 'Zona guardada'
                  : 'Seleccionar zona'}
              </b>

              <span
                className="
                  mt-1
                  block
                  text-[8px]
                  font-semibold
                  text-[#61758c]
                "
              >
                {zoneSaved
                  ? 'Usa el área guardada anteriormente.'
                  : 'Dibuja el área que deseas analizar.'}
              </span>
            </div>
          </div>

          <span
            className={`
              absolute
              right-4
              top-4
              h-4
              w-4
              rounded-full
              border-2

              ${
                mode === 'zone'
                  ? 'border-[#ff641f] bg-[#ff641f] shadow-[inset_0_0_0_3px_white]'
                  : 'border-[#9bb0c7] bg-white'
              }
            `}
          />
        </button>
      </div>

      {/* VIDEO */}

      <div
        className="
          relative
          mt-4
          overflow-hidden
          rounded-[13px]
          bg-black
        "
      >
        <video
          ref={
            videoRef
          }
          src={
            preview
          }
          muted
          controls
          playsInline
          preload="auto"
          className="
            block
            aspect-video
            w-full
            bg-black
            object-contain
          "
          onLoadedMetadata={(
            event
          ) => {
            const video =
              event.currentTarget

            if (
              Number.isFinite(
                video.duration
              ) &&
              video.duration >
                0
            ) {
              video.currentTime =
                Math.min(
                  0.1,
                  video.duration
                )
            }
          }}
        />

        {/* ZONA */}

        {mode === 'zone' && (
          <>
            <div
              className={`
                pointer-events-none
                absolute
                right-3
                top-3
                z-20
                rounded-[7px]
                px-3
                py-2
                text-[8px]
                font-bold
                text-white

                ${
                  zoneSaved
                    ? 'bg-[#0a6a45]/90'
                    : 'bg-[#08111d]/85'
                }
              `}
            >
              {zoneSaved
                ? 'Zona guardada anteriormente'
                : 'Haz clic para marcar el área'}
            </div>

            <svg
              className="
                absolute
                inset-0
                z-10
                h-full
                w-full
                cursor-crosshair
              "
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              onClick={
                addPoint
              }
            >
              {points.length >
                1 && (
                <polyline
                  points={points
                    .map(
                      (
                        point
                      ) =>
                        point.join(
                          ','
                        )
                    )
                    .join(
                      ' '
                    )}
                  fill="none"
                  stroke="#ff5b12"
                  strokeWidth="0.006"
                />
              )}

              {points.length >=
                3 && (
                <polygon
                  points={points
                    .map(
                      (
                        point
                      ) =>
                        point.join(
                          ','
                        )
                    )
                    .join(
                      ' '
                    )}
                  fill="rgba(255,91,18,.32)"
                  stroke="#ff5b12"
                  strokeWidth="0.006"
                />
              )}

              {points.map(
                (
                  point,
                  index
                ) => (
                  <circle
                    key={`${point[0]}-${point[1]}-${index}`}
                    cx={
                      point[0]
                    }
                    cy={
                      point[1]
                    }
                    r="0.013"
                    fill="#ffffff"
                    stroke="#ff5b12"
                    strokeWidth="0.006"
                  />
                )
              )}
            </svg>
          </>
        )}
      </div>

      {/* INFORMACIÓN */}

      <div
        className={`
          mt-3
          flex
          min-h-[36px]
          items-center
          gap-2
          rounded-[9px]
          px-3
          text-[8px]
          font-semibold

          ${
            mode === 'zone' &&
            zoneSaved
              ? 'border border-[#c5ead8] bg-[#effbf5] text-[#177345]'
              : 'bg-[#eef7ff] text-[#61758c]'
          }
        `}
      >
        {mode === 'zone' &&
        zoneSaved ? (
          <CheckCircle2
            size={15}
            className="
              shrink-0
              text-[#15ae65]
            "
          />
        ) : (
          <Info
            size={15}
            className="
              shrink-0
              text-[#1686e8]
            "
          />
        )}

        {mode === 'all'
          ? 'Se analizará todo el contenido visible en el video.'
          : zoneSaved
            ? 'Se recuperó la zona guardada anteriormente para esta sede.'
            : 'Procura incluir únicamente la zona que deseas analizar.'}
      </div>
    </>
  )
}

/* =========================================================
   STATUS CARD
========================================================= */

function StatusCard({
  active,
  className = '',
  icon: Icon,
  title,
  description,
}) {
  return (
    <div
      className={`
        rounded-[9px]
        border
        px-2.5
        py-2

        ${
          active
            ? 'border-[#bfe8d3] bg-[#effbf5]'
            : 'border-[#dde6ef] bg-[#f7f9fb]'
        }

        ${className}
      `}
    >
      <div
        className="
          flex
          items-center
          gap-2.5
        "
      >
        <StatusIcon
          active={
            active
          }
          icon={
            Icon
          }
        />

        <div
          className="
            min-w-0
          "
        >
          <b
            className="
              block
              text-[8px]
              font-black
              leading-[13px]
              text-[#102033]
            "
          >
            {title}
          </b>

          {description && (
            <span
              className="
                mt-0.5
                block
                break-words
                text-[7px]
                font-semibold
                leading-[12px]
                text-[#61758c]
              "
            >
              {description}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   STATUS ICON
========================================================= */

function StatusIcon({
  active,
  icon: Icon,
}) {
  return (
    <span
      className={`
        grid
        h-7
        w-7
        shrink-0
        place-items-center
        rounded-full

        ${
          active
            ? 'bg-[#15ae65] text-white'
            : 'border border-[#c9d7e5] bg-white text-[#66809a]'
        }
      `}
    >
      {active ? (
        <CheckCircle2
          size={14}
        />
      ) : (
        <Icon
          size={13}
        />
      )}
    </span>
  )
}

/* =========================================================
   CALCULAR ÁREA POLÍGONO
========================================================= */

function estimatePolygonArea(
  points
) {
  if (
    !points ||
    points.length < 3
  ) {
    return 0
  }

  let area =
    0

  for (
    let index = 0;
    index <
    points.length;
    index += 1
  ) {
    const [
      x1,
      y1,
    ] =
      points[index]

    const [
      x2,
      y2,
    ] =
      points[
        (
          index +
          1
        ) %
          points.length
      ]

    area +=
      x1 * y2 -
      x2 * y1
  }

  return Math.abs(
    area / 2
  )
}