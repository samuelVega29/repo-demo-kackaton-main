import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Crosshair,
  FileVideo,
  Info,
  Lightbulb,
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

function ConfidencePanel({ result }) {
  if (!result?.gondolas?.length) {
    return null
  }

  const gondolas = result.gondolas

  const scores = gondolas.map(
    (gondola) =>
      CONFIDENCE_CONFIG[
        gondola.confianza
      ]?.score ?? 60
  )

  const globalScore = Math.round(
    scores.reduce(
      (accumulator, current) =>
        accumulator + current,
      0
    ) / scores.length
  )

  return (
    <div
      className="
        mt-4
        rounded-[14px]
        border
        border-[#cfe2f3]
        bg-[#f4f9ff]
        p-4
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
          size={15}
          className="text-[#ff641f]"
        />

        <span
          className="
            text-[9px]
            font-black
            uppercase
            tracking-[.08em]
            text-[#1686e8]
          "
        >
          Sugerencia de IA aplicada
        </span>
      </div>

      <h4
        className="
          mt-2
          text-[13px]
          font-black
          text-[#102033]
        "
      >
        Claude detectó {gondolas.length} góndolas

        <span
          className="
            ml-1
            text-[#61758c]
          "
        >
          · acierto global {globalScore}%
        </span>
      </h4>

      <div
        className="
          mt-3
          flex
          flex-wrap
          gap-2
        "
      >
        {gondolas.map(
          (gondola, index) => (
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
                px-3
                py-1.5
                text-[9px]
                font-black
                text-[#102033]
              "
            >
              <span
                className="
                  h-2
                  w-2
                  rounded-full
                "
                style={{
                  background:
                    CONFIDENCE_CONFIG[
                      gondola.confianza
                    ]?.color || '#ff5b12',
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

  const { siteId } = useParams()

  const videoRef = useRef(null)

  const [tab, setTab] =
    useState('area')

  const [mode, setMode] =
    useState(
      analysisArea?.length
        ? 'zone'
        : 'all'
    )

  const [points, setPoints] =
    useState(
      analysisArea || []
    )

  const [zoneSaved, setZoneSaved] =
    useState(false)

  const [
    layoutSuggesting,
    setLayoutSuggesting,
  ] = useState(false)

  const [
    layoutMessage,
    setLayoutMessage,
  ] = useState('')

  const [
    layoutResult,
    setLayoutResult,
  ] = useState(null)

  const [
    videoMetadata,
    setVideoMetadata,
  ] = useState({
    width: 0,
    height: 0,
    duration: 0,
  })

  const running =
    job &&
    ![
      'completed',
      'failed',
    ].includes(job.status)

  const gondolas =
    site?.configuration?.gondolas || []

  const hasGondolas =
    gondolas.length > 0

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

  const suggestLayoutAutomatically =
    async () => {
      if (!file) {
        setLayoutMessage(
          'Error: no se encontró un video cargado.'
        )

        return
      }

      setLayoutSuggesting(true)
      setLayoutMessage('')
      setLayoutResult(null)

      try {
        const body =
          new FormData()

        body.append(
          'video',
          file,
          file.name || 'video.mp4'
        )

        const result = await api(
          `/api/sites/${siteId}/layout-suggestions`,
          {
            method: 'POST',
            body,
          }
        )

        const coloredGondolas =
          (
            result.gondolas || []
          ).map((gondola) => ({
            ...gondola,

            color:
              CONFIDENCE_CONFIG[
                gondola.confianza
              ]?.color ??
              '#b26500',
          }))

        updateConfiguration({
          ...site.configuration,

          gondolas:
            coloredGondolas,
        })

        setLayoutResult({
          ...result,

          gondolas:
            coloredGondolas,
        })

        setLayoutMessage(
          `Listo: Claude sugirió ${coloredGondolas.length} góndolas.`
        )
      } catch (error) {
        setLayoutMessage(
          `Error: ${error.message}`
        )
      } finally {
        setLayoutSuggesting(
          false
        )
      }
    }

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

  useEffect(() => {
    setPoints([])
    setMode('all')
    setZoneSaved(false)
    setTab('area')

    if (
      site?.configuration
        ?.floor?.outline
        ?.length
    ) {
      updateConfiguration({
        ...site.configuration,

        floor: {
          ...site.configuration.floor,
          outline: [],
        },
      })
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  if (!file || !preview) {
    return (
      <Navigate
        to={`/sedes/${siteId}/analisis/nuevo`}
        replace
      />
    )
  }

  const addPoint = (event) => {
    if (mode !== 'zone') {
      return
    }

    const rect =
      event.currentTarget
        .getBoundingClientRect()

    const x = Math.max(
      0,
      Math.min(
        1,
        (
          event.clientX -
          rect.left
        ) / rect.width
      )
    )

    const y = Math.max(
      0,
      Math.min(
        1,
        (
          event.clientY -
          rect.top
        ) / rect.height
      )
    )

    setPoints((current) => [
      ...current,

      [
        Number(x.toFixed(4)),
        Number(y.toFixed(4)),
      ],
    ])

    setZoneSaved(false)
  }

  const captureFrame = () => {
    const video =
      videoRef.current

    if (
      !video ||
      !video.videoWidth
    ) {
      return false
    }

    const width =
      video.videoWidth

    const height =
      video.videoHeight

    const canvas =
      document.createElement(
        'canvas'
      )

    canvas.width = width
    canvas.height = height

    canvas
      .getContext('2d')
      .drawImage(
        video,
        0,
        0,
        width,
        height
      )

    onFrameCapture(
      canvas.toDataURL(
        'image/jpeg',
        0.85
      ),
      width,
      height
    )

    return true
  }

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
          site.configuration.camera
        )

      const meters =
        points
          .map(([nx, ny]) =>
            forward
              ? projectFloor(
                  forward,
                  nx,
                  ny
                )
              : null
          )
          .filter(Boolean)
          .filter(
            ([x, z]) =>
              Number.isFinite(x) &&
              Number.isFinite(z)
          )
          .map(
            ([x, z]) => [
              Math.round(
                x * 100
              ) / 100,

              Math.round(
                z * 100
              ) / 100,
            ]
          )

      if (meters.length < 3) {
        return false
      }

      const next = {
        ...site.configuration,

        floor: {
          ...site.configuration.floor,

          outline: meters,
        },
      }

      updateConfiguration(next)

      try {
        await saveConfiguration(next)

        setZoneSaved(true)

        return true
      } catch {
        setZoneSaved(false)

        return false
      }
    }

  const clearZone =
    async () => {
      const next = {
        ...site.configuration,

        floor: {
          ...site.configuration.floor,

          outline: [],
        },
      }

      updateConfiguration(next)

      setZoneSaved(false)
      setPoints([])

      try {
        await saveConfiguration(next)
      } catch {
        setZoneSaved(false)
      }
    }

  const continueToGondolas =
    async () => {
      if (!areaReady) {
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

      captureFrame()

      setTab('gondolas')

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }

  const start = async () => {
    if (!canAnalyze) {
      return
    }

    try {
      await saveConfiguration(
        site.configuration
      )
    } catch {
      // Usa la última configuración disponible.
    }

    analyze(
      mode === 'zone'
        ? points
        : null
    )
  }

  /*
    =====================================================
    PASO 3 - CONFIGURAR GÓNDOLAS
    =====================================================
  */

  if (tab === 'gondolas') {
    return (
      <main
        className="
          relative
          isolate
          w-full
          overflow-x-hidden
          bg-[linear-gradient(105deg,#02182f_0%,#07549c_18%,#1590df_35%,#8bcbf5_54%,#e9f6ff_76%,#f8fbff_100%)]
        "
      >
        {/* DECORACIONES */}

        <div
          className="
            pointer-events-none
            absolute
            -left-[390px]
            top-[30px]
            -z-10
            h-[850px]
            w-[850px]
            rounded-full
            border-[86px]
            border-[#0d63b3]/20
          "
        />

        <div
          className="
            pointer-events-none
            absolute
            -left-[130px]
            top-[150px]
            -z-10
            h-[610px]
            w-[610px]
            rounded-full
            bg-[radial-gradient(circle,rgba(4,63,124,.46)_0%,rgba(4,41,83,.25)_48%,transparent_74%)]
          "
        />

        <div
          className="
            pointer-events-none
            absolute
            -right-[320px]
            bottom-[-180px]
            -z-10
            h-[700px]
            w-[700px]
            rounded-full
            border-[64px]
            border-[#75bfff]/12
          "
        />

        {/* PUNTOS IZQUIERDOS */}

        <div
          className="
            pointer-events-none
            absolute
            left-5
            top-[80px]
            hidden
            grid-cols-5
            gap-[8px]
            xl:grid
          "
        >
          {Array.from({
            length: 30,
          }).map((_, index) => (
            <span
              key={index}
              className="
                h-[3px]
                w-[3px]
                rounded-full
                bg-[#5eb5ff]/45
              "
            />
          ))}
        </div>

        {/* CONTENIDO */}

        <div
          className="
            relative
            z-10
            mx-auto
            w-full
            max-w-[1380px]
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
              mb-4
              w-full
              max-w-[840px]
              xl:ml-[255px]
              xl:mr-0
            "
          >
            <AnalysisStepper
              currentStep={3}
            />
          </div>

          {/* CONTENEDOR PRINCIPAL */}

          <div
            className="
              relative
              mx-auto
              w-full
              max-w-[1090px]
              xl:ml-[255px]
              xl:mr-0
            "
          >
            {/* ROBOT */}

            <aside
              className="
                pointer-events-none
                absolute
                -left-[255px]
                top-[18px]
                z-20
                hidden
                h-[720px]
                w-[275px]
                xl:block
              "
            >
              {/* TEXTO */}

              <div
                className="
                  absolute
                  left-0
                  top-[14px]
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
                    w-[132px]
                    -rotate-[5deg]
                    rounded-full
                    bg-[#ff641f]
                  "
                />

                <p
                  className="
                    mt-5
                    max-w-[195px]
                    text-[12px]
                    font-semibold
                    leading-5
                    text-white/90
                  "
                >
                  Configura tus góndolas
                  y visualiza tu tienda
                  de forma inteligente.
                </p>
              </div>

              {/* LUZ */}

              <div
                className="
                  absolute
                  bottom-[55px]
                  left-[-55px]
                  h-[350px]
                  w-[350px]
                  rounded-full
                  bg-[radial-gradient(circle,rgba(43,153,245,.4)_0%,rgba(11,86,164,.18)_52%,transparent_74%)]
                "
              />

              {/* ROBOT */}

              <img
                src={analisisRobot}
                alt="Robot de Scapder"
                className="
                  absolute
                  bottom-[40px]
                  right-[-8px]
                  z-20
                  w-[290px]
                  max-w-none
                  select-none
                  object-contain
                  drop-shadow-[0_22px_30px_rgba(0,26,63,.34)]
                "
              />

              {/* TEXTO INFERIOR */}

              <div
                className="
                  absolute
                  bottom-[28px]
                  left-[14px]
                  z-30
                  -rotate-[4deg]
                "
              >
                <p
                  className="
                    text-[17px]
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
                    w-[80px]
                    -rotate-[6deg]
                    rounded-full
                    bg-[#ff641f]
                  "
                />
              </div>
            </aside>

            {/* GRID GÓNDOLAS */}

            <div
              className="
                grid
                w-full
                gap-3
                lg:grid-cols-[minmax(0,1fr)_310px]
                lg:items-stretch
              "
            >
              {/* FORMULARIO */}

              <section
                className="
                  min-w-0
                  overflow-hidden
                  rounded-[22px]
                  border
                  border-[#c9dcec]
                  bg-white
                  shadow-[0_18px_48px_-30px_rgba(4,43,87,.4)]
                "
              >
                {/* HEADER FORMULARIO */}

                <div
                  className="
                    p-5
                    pb-0
                  "
                >
                  <div
                    className="
                      flex
                      flex-col
                      gap-4
                      xl:flex-row
                      xl:items-start
                      xl:justify-between
                    "
                  >
                    <div>
                      <span
                        className="
                          text-[10px]
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
                          text-[26px]
                          font-black
                          leading-tight
                          tracking-[-0.04em]
                          text-[#102033]
                        "
                      >
                        Ubica las góndolas sobre el frame
                      </h1>

                      <p
                        className="
                          mt-2
                          max-w-[630px]
                          text-[10px]
                          font-semibold
                          leading-[17px]
                          text-[#667991]
                        "
                      >
                        Añade, arrastra y ajusta cada
                        góndola. Esta configuración se
                        reutiliza en futuros videos de
                        la sede.
                      </p>
                    </div>

                    {/* ACCIONES */}

                    <div
                      className="
                        flex
                        shrink-0
                        flex-col
                        gap-2
                      "
                    >
                      <button
                        type="button"
                        onClick={
                          suggestLayoutAutomatically
                        }
                        disabled={
                          layoutSuggesting
                        }
                        className="
                          inline-flex
                          min-h-[39px]
                          items-center
                          justify-center
                          gap-2
                          rounded-[8px]
                          bg-[#102033]
                          px-4
                          text-[9px]
                          font-black
                          text-white
                          shadow-[0_8px_18px_-10px_rgba(16,32,51,.7)]
                          transition
                          hover:-translate-y-0.5
                          disabled:opacity-50
                        "
                      >
                        <Sparkles
                          size={14}
                          className="
                            text-[#ff641f]
                          "
                        />

                        {layoutSuggesting
                          ? 'Analizando...'
                          : 'Sugerir góndolas con IA'}
                      </button>

                      <button
                        type="button"
                        onClick={captureFrame}
                        className="
                          inline-flex
                          min-h-[39px]
                          items-center
                          justify-center
                          gap-2
                          rounded-[8px]
                          border
                          border-[#ff641f]
                          bg-white
                          px-4
                          text-[9px]
                          font-black
                          text-[#ff641f]
                          transition
                          hover:bg-[#fff5ef]
                        "
                      >
                        <Camera size={14} />

                        {frameCapture
                          ? 'Recapturar frame'
                          : 'Capturar frame'}
                      </button>
                    </div>
                  </div>

                  {/* MENSAJE IA */}

                  {layoutMessage && (
                    <p
                      className={`
                        mt-3
                        rounded-[9px]
                        border
                        px-3
                        py-2
                        text-[9px]
                        font-bold
                        ${
                          layoutMessage.includes(
                            'Error'
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
                      result={layoutResult}
                    />
                  )}

                  {/* INFORMACIÓN */}

                  <div
                    className="
                      mt-4
                      flex
                      items-start
                      gap-3
                      rounded-[10px]
                      border
                      border-[#cae4fa]
                      bg-[#eef7ff]
                      px-4
                      py-3
                    "
                  >
                    <Info
                      size={17}
                      className="
                        mt-[1px]
                        shrink-0
                        text-[#1686e8]
                      "
                    />

                    <p
                      className="
                        text-[9px]
                        font-semibold
                        leading-4
                        text-[#527090]
                      "
                    >
                      Usa el botón “+ Añadir góndola”,
                      colócala encima del mueble real y
                      presiona “Guardar plano”. Luego
                      podrás iniciar el análisis.
                    </p>
                  </div>
                </div>

                {/* PLANOGRAMA */}

                <div
                  className="
                    mx-5
                    mb-5
                    mt-4
                    overflow-hidden
                    rounded-[16px]
                    border
                    border-[#dce8f2]
                    bg-white
                    shadow-[0_12px_28px_-24px_rgba(12,69,117,.45)]
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
                  min-h-[680px]
                  flex-col
                  rounded-[22px]
                  border
                  border-[#c9dcec]
                  bg-white
                  p-4
                  shadow-[0_18px_48px_-30px_rgba(4,43,87,.32)]
                "
              >
                {/* ICONO */}

                <div
                  className="
                    mb-3
                    text-[#ff641f]
                  "
                >
                  <Play
                    size={34}
                    fill="#ff641f"
                    strokeWidth={1.5}
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
                  Paso 3
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
                  Configurar góndolas
                </h2>

                <p
                  className="
                    mt-2
                    text-[10px]
                    font-semibold
                    leading-5
                    text-[#667991]
                  "
                >
                  Cuando haya al menos una
                  góndola guardada, puedes lanzar
                  el análisis.
                </p>

                {/* VIDEO CARGADO */}

                <StatusCard
                  active
                  className="mt-4"
                  icon={FileVideo}
                  title="Video cargado correctamente"
                  description={file.name}
                />

                {/* ÁREA */}

                <StatusCard
                  active={areaReady}
                  className="mt-2"
                  icon={Crosshair}
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

                {/* ZONA */}

                <StatusCard
                  active={
                    mode === 'all' ||
                    zoneSaved
                  }
                  className="mt-2"
                  icon={Save}
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

                {/* GÓNDOLAS */}

                <StatusCard
                  active={hasGondolas}
                  className="mt-2"
                  icon={Store}
                  title={
                    hasGondolas
                      ? `${gondolas.length} góndola${
                          gondolas.length === 1
                            ? ''
                            : 's'
                        } guardada${
                          gondolas.length === 1
                            ? ''
                            : 's'
                        }`
                      : 'Góndolas pendientes'
                  }
                  description={
                    hasGondolas
                      ? 'Puedes añadir más si lo necesitas.'
                      : 'Añade al menos una góndola.'
                  }
                />

                {/* ADVERTENCIA */}

                {!hasGondolas && (
                  <div
                    className="
                      mt-3
                      rounded-[10px]
                      border
                      border-[#ffdfd0]
                      bg-[#fff4ee]
                      px-4
                      py-3
                      text-[9px]
                      font-bold
                      leading-4
                      text-[#b74322]
                    "
                  >
                    Para medir zonas calientes y
                    pick-ups, guarda al menos una
                    góndola.
                  </div>
                )}

                {/* ERROR */}

                {job?.status ===
                  'failed' && (
                  <p
                    className="
                      mt-3
                      rounded-[9px]
                      bg-[#fff1eb]
                      px-3
                      py-2
                      text-[9px]
                      font-bold
                      text-[#b43b1d]
                    "
                  >
                    {job.message}
                  </p>
                )}

                {/* ANALIZAR */}

                <button
                  type="button"
                  disabled={!canAnalyze}
                  onClick={start}
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
                    shadow-[0_10px_22px_-12px_rgba(255,91,18,.8)]
                    transition
                    hover:-translate-y-0.5
                    disabled:cursor-not-allowed
                    disabled:opacity-40
                  "
                >
                  {running
                    ? 'Iniciando...'
                    : 'Guardar y analizar'}

                  {!running && (
                    <ArrowRight
                      size={15}
                    />
                  )}
                </button>

                {/* VOLVER */}

                <button
                  type="button"
                  onClick={() => {
                    setTab('area')

                    window.scrollTo({
                      top: 0,
                      behavior: 'smooth',
                    })
                  }}
                  className="
                    mt-2
                    inline-flex
                    min-h-[39px]
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-[9px]
                    border
                    border-[#d7e3ee]
                    bg-white
                    px-4
                    text-[9px]
                    font-black
                    text-[#102033]
                    transition
                    hover:border-[#ff641f]
                  "
                >
                  <ArrowLeft
                    size={14}
                  />

                  Volver al área
                </button>

                {/* CAMBIAR VIDEO */}

                <Link
                  to={`/sedes/${siteId}/analisis/nuevo`}
                  className="
                    mt-2
                    inline-flex
                    min-h-[39px]
                    w-full
                    items-center
                    justify-center
                    gap-2
                    rounded-[9px]
                    border
                    border-[#d7e3ee]
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

                {/* CONSEJO */}

                <div
                  className="
                    mt-auto
                    pt-4
                  "
                >
                  <div
                    className="
                      flex
                      gap-3
                      rounded-[12px]
                      border
                      border-[#d6e9fa]
                      bg-[#eef7ff]
                      p-3
                    "
                  >
                    <Lightbulb
                      size={20}
                      className="
                        shrink-0
                        text-[#1686e8]
                      "
                    />

                    <div>
                      <b
                        className="
                          block
                          text-[9px]
                          font-black
                          text-[#1686e8]
                        "
                      >
                        Consejo
                      </b>

                      <p
                        className="
                          mt-1
                          text-[8px]
                          font-semibold
                          leading-4
                          text-[#61758c]
                        "
                      >
                        Ubica cada góndola sobre su
                        posición real para mejorar la
                        precisión del análisis.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </main>
    )
  }

  /*
    =====================================================
    PASO 2 - SELECCIONAR ÁREA
    =====================================================
  */

  return (
    <main
      className="
        relative
        isolate
        w-full
        overflow-x-hidden
        bg-[linear-gradient(105deg,#02182f_0%,#07549c_18%,#148ada_35%,#8ac8f4_54%,#e7f4ff_76%,#f8fbff_100%)]
      "
    >
      {/* DECORACIÓN */}

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

      {/* CONTENIDO */}

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

        {/* CONTENEDOR */}

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
                Selecciona el área ideal
                y obtén análisis precisos
                para tu negocio.
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
              src={analisisRobot}
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
            {/* FORMULARIO ÁREA */}

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
                addPoint={addPoint}
                mode={mode}
                points={points}
                preview={preview}
                setMode={setMode}
                videoRef={videoRef}
                setVideoMetadata={
                  setVideoMetadata
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
                  strokeWidth={1.8}
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
                Revisa la información de
                la zona seleccionada.
              </p>

              <StatusCard
                active
                className="mt-4"
                icon={FileVideo}
                title="Video cargado correctamente"
                description={file.name}
              />

              <StatusCard
                active={areaReady}
                className="mt-2"
                icon={Crosshair}
                title={
                  mode === 'all'
                    ? 'Toda la cámara seleccionada'
                    : 'Área seleccionada'
                }
                description={
                  mode === 'all'
                    ? 'Se analizará el 100% del video.'
                    : `${points.length} puntos del área`
                }
              />

              <StatusCard
                active={
                  mode === 'all' ||
                  zoneSaved
                }
                className="mt-2"
                icon={Save}
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
                      ? 'Zona lista para continuar.'
                      : 'Guarda la zona antes de continuar.'
                }
              />

              <StatusCard
                active={false}
                className="mt-2"
                icon={Store}
                title="Configurar góndolas"
                description="Este será el siguiente paso."
              />

              {mode === 'zone' &&
                points.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPoints([])
                      setZoneSaved(false)
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
                      hover:border-[#ff641f]
                    "
                  >
                    <X size={13} />

                    Limpiar selección
                  </button>
                )}

              {mode === 'zone' &&
                points.length >= 4 &&
                !zoneSaved && (
                  <button
                    type="button"
                    onClick={saveZone}
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
                    "
                  >
                    <Save size={13} />

                    Guardar zona
                  </button>
                )}

              {site?.configuration
                ?.floor?.outline
                ?.length > 0 && (
                  <button
                    type="button"
                    onClick={clearZone}
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
                      hover:border-[#ff641f]
                    "
                  >
                    Quitar zona guardada
                  </button>
                )}

              <button
                type="button"
                disabled={!areaReady}
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

function AreaPanel({
  addPoint,
  mode,
  points,
  preview,
  setMode,
  videoRef,
  setVideoMetadata,
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
        Selecciona toda la cámara o dibuja
        un área específica. Usa mínimo 4
        puntos para cerrar una zona confiable.
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
          onClick={() =>
            setMode('all')
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
                Analiza todo lo que se ve
                en el video.
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
          onClick={() =>
            setMode('zone')
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
                Seleccionar zona
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
                Dibuja el área que deseas analizar.
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
          ref={videoRef}
          src={preview}
          muted
          controls
          playsInline
          className="
            block
            aspect-video
            w-full
            bg-black
            object-contain
          "
          onLoadedMetadata={() => {
            if (
              videoRef.current
            ) {
              videoRef.current.currentTime =
                0.1

              setVideoMetadata({
                width:
                  videoRef.current
                    .videoWidth,

                height:
                  videoRef.current
                    .videoHeight,

                duration:
                  videoRef.current
                    .duration,
              })
            }
          }}
        />

        {mode === 'zone' && (
          <>
            <div
              className="
                pointer-events-none
                absolute
                right-3
                top-3
                z-20
                rounded-[7px]
                bg-[#08111d]/85
                px-3
                py-2
                text-[8px]
                font-bold
                text-white
              "
            >
              Haz clic para marcar el área
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
              onClick={addPoint}
            >
              {points.length > 1 && (
                <polyline
                  points={points
                    .map((point) =>
                      point.join(',')
                    )
                    .join(' ')}
                  fill="none"
                  stroke="#ff5b12"
                  strokeWidth="0.006"
                />
              )}

              {points.length >= 3 && (
                <polygon
                  points={points
                    .map((point) =>
                      point.join(',')
                    )
                    .join(' ')}
                  fill="rgba(255,91,18,.32)"
                  stroke="#ff5b12"
                  strokeWidth="0.006"
                />
              )}

              {points.map(
                (point, index) => (
                  <circle
                    key={`${point[0]}-${point[1]}-${index}`}
                    cx={point[0]}
                    cy={point[1]}
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
        className="
          mt-3
          flex
          min-h-[36px]
          items-center
          gap-2
          rounded-[9px]
          bg-[#eef7ff]
          px-3
          text-[8px]
          font-semibold
          text-[#61758c]
        "
      >
        <Info
          size={15}
          className="
            shrink-0
            text-[#1686e8]
          "
        />

        {mode === 'all'
          ? 'Se analizará todo el contenido visible en el video.'
          : 'Procura incluir únicamente la zona que deseas analizar.'}
      </div>
    </>
  )
}

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
        rounded-[11px]
        border
        p-3
        ${
          active
            ? 'border-[#c8ecda] bg-[#effbf5]'
            : 'border-[#dde6ef] bg-[#f7f9fb]'
        }
        ${className}
      `}
    >
      <div
        className="
          flex
          items-start
          gap-3
        "
      >
        <StatusIcon
          active={active}
          icon={Icon}
        />

        <div className="min-w-0">
          <b
            className="
              block
              text-[9px]
              font-black
              leading-4
              text-[#102033]
            "
          >
            {title}
          </b>

          {description && (
            <span
              className="
                mt-1
                block
                break-words
                text-[8px]
                font-semibold
                leading-4
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

function StatusIcon({
  active,
  icon: Icon,
}) {
  return (
    <span
      className={`
        grid
        h-8
        w-8
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
          size={16}
        />
      ) : (
        <Icon
          size={15}
        />
      )}
    </span>
  )
}

function estimatePolygonArea(points) {
  if (
    !points ||
    points.length < 3
  ) {
    return 0
  }

  let area = 0

  for (
    let index = 0;
    index < points.length;
    index += 1
  ) {
    const [
      x1,
      y1,
    ] = points[index]

    const [
      x2,
      y2,
    ] =
      points[
        (index + 1) %
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

function formatDuration(seconds) {
  if (
    !Number.isFinite(seconds)
  ) {
    return ''
  }

  const minutes =
    Math.floor(
      seconds / 60
    )

  const rest =
    Math.round(
      seconds % 60
    )
      .toString()
      .padStart(2, '0')

  return `${minutes}:${rest}`
}