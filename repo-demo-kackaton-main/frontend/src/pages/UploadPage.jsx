import {
  ArrowRight,
  CheckCircle2,
  Eye,
  FileVideo,
  HelpCircle,
  Settings2,
  Store,
  UploadCloud,
  Wrench,
  X,
} from 'lucide-react'

import {
  useEffect,
  useState,
} from 'react'

import {
  Link,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import AnalysisStepper from '../components/flow/AnalysisStepper'
import LiveAlignment from '../components/flow/LiveAlignment'
import { useApp } from '../context/AppProvider'

import analisisRobot from '../assets/images/analisis_robot2.png'

import {
  artifactUrl,
  listAnalyses,
} from '../services/analyses'

import {
  calibrationStatusLabel,
  isMetricCalibrated,
  isSiteConfigured,
} from '../utils/siteConfiguration'

const MAX_VIDEO_DURATION_SECONDS = 120

/* =========================================================
   FORMATEAR TAMAÑO
========================================================= */

const formatBytes = (bytes) => {
  if (!bytes) {
    return ''
  }

  const mb =
    bytes / 1048576

  return `${mb.toFixed(
    mb >= 10 ? 0 : 1
  )} MB`
}

/* =========================================================
   FORMATEAR DURACIÓN
========================================================= */

const formatDuration = (seconds) => {
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
      .padStart(
        2,
        '0'
      )

  return `${minutes}:${rest}`
}

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export default function UploadPage() {
  const {
    file,
    preview,
    chooseFile,
    clearFile,
    inputRef,
    site,
  } = useApp()

  const {
    siteId,
  } = useParams()

  const [
    searchParams,
  ] = useSearchParams()

  const [
    metadata,
    setMetadata,
  ] = useState(null)

  const [, setAcceptedConfig] = useState(false)

  const [
    instructionsOpen,
    setInstructionsOpen,
  ] = useState(false)

  const [
    history,
    setHistory,
  ] = useState([])

  const [
    historyError,
    setHistoryError,
  ] = useState('')

  /* =========================================================
     CONFIGURACIÓN DE LA SEDE
  ========================================================= */

  const configured =
    isSiteConfigured(
      site
    )

  const reconfiguringCamera =
    searchParams.get(
      'reconfigurar'
    ) === 'camara'

  const metricCalibrated =
    isMetricCalibrated(
      site
    )

  const calibrationLabel =
    calibrationStatusLabel(
      site
    )

  const gondolaCount =
    site?.configuration
      ?.gondolas
      ?.length || 0

  const referenceFrame =
    site?.configuration
      ?.reference_frame

  /* =========================================================
     ÚLTIMO FRAME GUARDADO
  ========================================================= */

  const latestFrameAnalysis =
    history.find(
      (item) =>
        item.result
          ?.annotated_frames
          ?.length
    )

  const latestFrame =
    latestFrameAnalysis
      ?.result
      ?.annotated_frames?.[0]

  const previewFrameSrc =
    referenceFrame?.dataUrl ||
    (
      latestFrameAnalysis &&
      latestFrame
        ? artifactUrl(
            latestFrameAnalysis.id,
            latestFrame
          )
        : ''
    )

  const previewFrameCaption =
    referenceFrame?.dataUrl
      ? `Frame guardado de la calibración${
          referenceFrame?.width &&
          referenceFrame?.height
            ? ` (${referenceFrame.width} x ${referenceFrame.height})`
            : ''
        }`
      : latestFrame
        ? `Previsualización tomada de ${
            latestFrameAnalysis.filename ||
            'un análisis anterior'
          }`
        : 'Sin previsualización disponible'

  /* =========================================================
     REVISAR CONFIGURACIÓN
  ========================================================= */

  const mustReviewConfiguration = false

  /* =========================================================
     SIGUIENTE RUTA
  ========================================================= */

  const nextPath =
    reconfiguringCamera
      ? `/sites/${siteId}/captura`
      : `/sedes/${siteId}/analisis/nuevo/siguiente`

  const nextLabel =
    reconfiguringCamera
      ? 'Capturar frame'
      : configured
        ? 'Continuar al area'
        : 'Continuar a zona'

  const videoTooLong =
    metadata?.duration >
    MAX_VIDEO_DURATION_SECONDS

  /* =========================================================
     LEER METADATOS DEL VIDEO
  ========================================================= */

  useEffect(() => {
    if (!preview) {
      setMetadata(
        null
      )

      return undefined
    }

    const video =
      document.createElement(
        'video'
      )

    video.preload =
      'metadata'

    video.src =
      preview

    video.onloadedmetadata =
      () => {
        setMetadata({
          duration:
            video.duration,

          width:
            video.videoWidth,

          height:
            video.videoHeight,
        })
      }

    return () => {
      video.src = ''
    }
  }, [
    preview,
  ])

  /* =========================================================
     HISTORIAL DE LA SEDE
  ========================================================= */

  useEffect(() => {
    if (!siteId) {
      return undefined
    }

    let active =
      true

    listAnalyses({
      site_id:
        siteId,
    })
      .then(
        (items) => {
          if (
            active
          ) {
            setHistory(
              items || []
            )
          }
        }
      )
      .catch(
        (error) => {
          if (
            active
          ) {
            setHistoryError(
              error.message
            )
          }
        }
      )

    return () => {
      active =
        false
    }
  }, [
    siteId,
  ])

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <main
      className="
        relative
        isolate
        w-full
        overflow-x-hidden
        overflow-y-visible
        bg-[linear-gradient(105deg,#02182f_0%,#063d78_18%,#0a67b7_31%,#58acec_45%,#dceefd_63%,#f8fbff_82%,#f8fbff_100%)]
      "
    >
      {/* =====================================================
          DECORACIÓN IZQUIERDA
      ===================================================== */}

      <div
        className="
          pointer-events-none
          absolute
          -left-[390px]
          top-[20px]
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
          -left-[140px]
          top-[130px]
          -z-10
          h-[600px]
          w-[600px]
          rounded-full
          bg-[radial-gradient(circle,rgba(4,63,124,.43)_0%,rgba(4,41,83,.28)_48%,transparent_74%)]
        "
      />

      {/* =====================================================
          DECORACIÓN DERECHA
      ===================================================== */}

      <div
        className="
          pointer-events-none
          absolute
          -right-[350px]
          bottom-[-150px]
          -z-10
          h-[680px]
          w-[680px]
          rounded-full
          border-[62px]
          border-[#7cc0ff]/10
        "
      />

      {/* =====================================================
          PUNTOS
      ===================================================== */}

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
          length:
            25,
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
                bg-[#5eb5ff]/40
              "
            />
          )
        )}
      </div>

      {/* =====================================================
          CONTENIDO
      ===================================================== */}

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
          sm:px-6
          lg:px-7
        "
      >
        {/* =================================================
            STEPPER
        ================================================= */}

        <div
          className="
            mx-auto
            mb-4
            w-full
            max-w-[820px]
            xl:ml-[250px]
            xl:mr-0
          "
        >
          <AnalysisStepper
            currentStep={1}
          />
        </div>

        {/* =================================================
            CONTENEDOR PRINCIPAL
        ================================================= */}

        <div
          className="
            relative
            mx-auto
            w-full
            max-w-[1040px]
            xl:ml-[250px]
            xl:mr-0
          "
        >
          {/* =================================================
              ROBOT
          ================================================= */}

          <aside
            className="
              pointer-events-none
              absolute
              -left-[245px]
              top-[-20px]
              z-20
              hidden
              h-[500px]
              w-[270px]
              xl:block
            "
          >
            {/* TEXTO SUPERIOR */}

            <div
              className="
                absolute
                left-0
                top-0
                z-30
                -rotate-[3deg]
              "
            >
              <p
                className="
                  text-[21px]
                  font-black
                  italic
                  leading-[1]
                  tracking-[-0.04em]
                  text-white
                "
              >
                {reconfiguringCamera
                  ? 'Nueva cámara,'
                  : 'Tu video,'}

                <br />

                <span
                  className="
                    text-[#48adff]
                  "
                >
                  {reconfiguringCamera
                    ? 'nueva referencia'
                    : 'nuestros insights'}
                </span>
              </p>

              <span
                className="
                  mt-3
                  block
                  h-[4px]
                  w-[128px]
                  -rotate-[5deg]
                  rounded-full
                  bg-[#ff641f]
                "
              />

              <p
                className="
                  mt-4
                  max-w-[195px]
                  text-[11px]
                  font-semibold
                  leading-5
                  text-white/85
                "
              >
                {reconfiguringCamera
                  ? 'Carga un nuevo video para actualizar la referencia de la cámara.'
                  : 'Transformamos imágenes en decisiones que impulsan tu negocio.'}
              </p>
            </div>

            {/* LUZ */}

            <div
              className="
                pointer-events-none
                absolute
                bottom-[8px]
                left-[-40px]
                h-[330px]
                w-[330px]
                rounded-full
                bg-[radial-gradient(circle,rgba(43,153,245,.35)_0%,rgba(11,86,164,.16)_52%,transparent_74%)]
              "
            />

            {/* ROBOT */}

            <img
              src={
                analisisRobot
              }
              alt="Robot de Scapder"
              className="
                absolute
                bottom-[14px]
                right-[-6px]
                z-20
                w-[270px]
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
                bottom-[34px]
                left-[3px]
                z-30
                -rotate-[4deg]
              "
            >
              <p
                className="
                  text-[15px]
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
                  w-[72px]
                  -rotate-[6deg]
                  rounded-full
                  bg-[#ff641f]
                "
              />
            </div>
          </aside>

          {/* =================================================
              FORMULARIO + PANEL DERECHO
          ================================================= */}

          <div
            className="
              grid
              w-full
              gap-3
              lg:grid-cols-[minmax(0,1fr)_285px]
              lg:items-stretch
            "
          >
            {/* =================================================
                PANEL PRINCIPAL
            ================================================= */}

            <div
              className="
                min-w-0
              "
            >
              {mustReviewConfiguration ? (
                /* =================================================
                   CONFIGURACIÓN YA GUARDADA
                ================================================= */

                <section
                  className="
                    h-full
                    min-h-[500px]
                    overflow-hidden
                    rounded-[22px]
                    border
                    border-[#c9dcec]
                    bg-white
                    p-5
                    shadow-[0_18px_48px_-30px_rgba(4,43,87,.38)]
                  "
                >
                  <span
                    className="
                      text-[10px]
                      font-black
                      uppercase
                      tracking-[.08em]
                      text-[#ff641f]
                    "
                  >
                    Configuración guardada
                  </span>

                  <h1
                    className="
                      mt-2
                      text-[24px]
                      font-black
                      tracking-[-0.035em]
                      text-[#102033]
                    "
                  >
                    Revisa la configuración de esta sede
                  </h1>

                  <p
                    className="
                      mt-2
                      max-w-[650px]
                      text-[11px]
                      font-semibold
                      leading-5
                      text-[#667991]
                    "
                  >
                    Esta sede ya tiene plano y góndolas
                    guardadas. Verifica la previsualización
                    antes de continuar.
                  </p>

                  {/* PREVIEW */}

                  <figure
                    className="
                      mt-4
                      overflow-hidden
                      rounded-[14px]
                      border
                      border-[#d6e4f1]
                      bg-[#071d25]
                    "
                  >
                    {previewFrameSrc ? (
                      <img
                        src={
                          previewFrameSrc
                        }
                        alt="Previsualización"
                        className="
                          block
                          aspect-video
                          w-full
                          object-cover
                        "
                      />
                    ) : (
                      <div
                        className="
                          grid
                          aspect-video
                          place-items-center
                          px-6
                          text-center
                          text-xs
                          font-bold
                          text-white/65
                        "
                      >
                        No hay frame guardado para previsualizar.
                      </div>
                    )}

                    <figcaption
                      className="
                        border-t
                        border-white/10
                        px-4
                        py-2
                        text-[10px]
                        font-semibold
                        text-white/70
                      "
                    >
                      {previewFrameCaption}
                    </figcaption>
                  </figure>

                  {/* ESTADOS */}

                  <div
                    className="
                      mt-4
                      grid
                      gap-2
                      md:grid-cols-3
                    "
                  >
                    <PipelineItem
                      icon={
                        Settings2
                      }
                      active={
                        configured ||
                        metricCalibrated
                      }
                      label="Estado de la sede"
                      value={
                        calibrationLabel
                      }
                    />

                    <PipelineItem
                      icon={
                        Store
                      }
                      active={
                        gondolaCount >
                        0
                      }
                      label="Góndolas"
                      value={
                        gondolaCount >
                        0
                          ? `${gondolaCount} guardadas`
                          : 'Pendientes'
                      }
                    />

                    <PipelineItem
                      icon={
                        Eye
                      }
                      active={Boolean(
                        previewFrameSrc
                      )}
                      label="Previsualización"
                      value={
                        previewFrameSrc
                          ? 'Disponible'
                          : 'Pendiente'
                      }
                    />
                  </div>

                  {/* ACCIONES */}

                  <div
                    className="
                      mt-4
                      grid
                      gap-2
                      sm:grid-cols-2
                    "
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setAcceptedConfig(
                          true
                        )
                      }
                      className="
                        inline-flex
                        min-h-[40px]
                        items-center
                        justify-center
                        gap-2
                        rounded-[9px]
                        bg-gradient-to-r
                        from-[#ff5b12]
                        to-[#ff7b31]
                        px-4
                        text-[11px]
                        font-black
                        text-white
                        transition
                        hover:-translate-y-0.5
                      "
                    >
                      <CheckCircle2
                        size={15}
                      />

                      Usar esta configuración
                    </button>

                    <Link
                      to={`/sedes/${siteId}/analisis/nuevo?reconfigurar=camara`}
                      className="
                        inline-flex
                        min-h-[40px]
                        items-center
                        justify-center
                        gap-2
                        rounded-[9px]
                        border
                        border-[#ffd1bb]
                        bg-[#fff7f2]
                        px-4
                        text-[11px]
                        font-black
                        text-[#ff5b12]
                        no-underline
                        transition
                        hover:border-[#ff641f]
                      "
                    >
                      <Wrench
                        size={14}
                      />

                      Reconfigurar cámara
                    </Link>
                  </div>
                </section>
              ) : (
                /* =================================================
                   SUBIR / CAMBIAR VIDEO
                ================================================= */

                <section
                  className="
                    flex
                    h-full
                    min-h-[500px]
                    flex-col
                    rounded-[22px]
                    border
                    border-[#c9dcec]
                    bg-white
                    p-5
                    shadow-[0_18px_48px_-30px_rgba(4,43,87,.38)]
                  "
                >
                  <div
                    className="
                      flex
                      items-start
                      justify-between
                      gap-4
                    "
                  >
                    <div>
                      <span
                        className="
                          text-[9px]
                          font-black
                          uppercase
                          tracking-[.08em]
                          text-[#ff641f]
                        "
                      >
                        {reconfiguringCamera
                          ? 'Reconfiguración'
                          : 'Paso 1'}
                      </span>

                      <h1
                        className="
                          mt-1
                          text-[23px]
                          font-black
                          leading-tight
                          tracking-[-0.035em]
                          text-[#102033]
                        "
                      >
                        {reconfiguringCamera
                          ? 'Video de referencia para recalibrar'
                          : configured
                            ? 'Nuevo video para analizar'
                            : 'Video de la cámara'}
                      </h1>

                      <p
                        className="
                          mt-2
                          max-w-[620px]
                          text-[11px]
                          font-semibold
                          leading-[18px]
                          text-[#667991]
                        "
                      >
                        {reconfiguringCamera
                          ? `Sube un MP4 de máximo ${MAX_VIDEO_DURATION_SECONDS} segundos desde la cámara actual. Con este video podrás capturar un nuevo frame y actualizar la calibración sin perder el plano guardado.`
                          : configured
                            ? `La sede ya tiene plano y góndolas guardadas. Sube un MP4 de máximo ${MAX_VIDEO_DURATION_SECONDS} segundos y continúa para elegir el área de análisis.`
                            : `Usa un video en formato MP4 de máximo ${MAX_VIDEO_DURATION_SECONDS} segundos. En el siguiente paso eliges el área y confirmas las góndolas.`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setInstructionsOpen(
                          true
                        )
                      }
                      className="
                        hidden
                        shrink-0
                        items-center
                        gap-2
                        rounded-[9px]
                        border
                        border-[#d8e4ee]
                        bg-white
                        px-3
                        py-2
                        text-[10px]
                        font-black
                        text-[#53657a]
                        transition
                        hover:border-[#ff641f]
                        hover:text-[#ff641f]
                        md:inline-flex
                      "
                    >
                      <HelpCircle
                        size={13}
                      />

                      Instrucciones
                    </button>
                  </div>

                  {/* CARGA */}

                  <button
                    type="button"
                    onClick={() =>
                      inputRef.current?.click()
                    }
                    className={`
                      relative
                      mt-4
                      grid
                      min-h-[290px]
                      w-full
                      flex-1
                      place-items-center
                      overflow-hidden
                      rounded-[15px]
                      border-2
                      border-dashed
                      p-5
                      text-center
                      transition
                      ${
                        file
                          ? 'border-[#ff641f] bg-[#fff9f5]'
                          : 'border-[#ff8f57] bg-[linear-gradient(135deg,#fffdfa_0%,#fff6f0_100%)] hover:border-[#ff641f]'
                      }
                    `}
                  >
                    <input
                      ref={
                        inputRef
                      }
                      type="file"
                      accept="video/mp4,.mp4"
                      hidden
                      onChange={(
                        event
                      ) => {
                        const selectedFile =
                          event.target
                            .files?.[0]

                        if (
                          selectedFile
                        ) {
                          chooseFile(
                            selectedFile
                          )
                        }
                      }}
                    />

                    <FileVideo
                      size={66}
                      className="
                        pointer-events-none
                        absolute
                        right-[8%]
                        top-[13%]
                        rotate-[12deg]
                        text-[#ff641f]/9
                      "
                    />

                    <UploadCloud
                      size={64}
                      className="
                        pointer-events-none
                        absolute
                        bottom-[10%]
                        left-[7%]
                        -rotate-[9deg]
                        text-[#ff641f]/8
                      "
                    />

                    <div
                      className="
                        relative
                        z-10
                        mx-auto
                        max-w-[450px]
                      "
                    >
                      <div
                        className="
                          mx-auto
                          mb-3
                          grid
                          h-[52px]
                          w-[52px]
                          place-items-center
                          rounded-full
                          border-2
                          border-[#ff641f]
                          bg-white
                          text-[#ff641f]
                        "
                      >
                        {file ? (
                          <FileVideo
                            size={24}
                          />
                        ) : (
                          <UploadCloud
                            size={25}
                          />
                        )}
                      </div>

                      <h2
                        className="
                          break-words
                          text-[15px]
                          font-black
                          text-[#102033]
                        "
                      >
                        {file
                          ? file.name
                          : reconfiguringCamera
                            ? 'Sube el video de referencia'
                            : 'Arrastra tu video aquí'}
                      </h2>

                      <p
                        className="
                          mt-1.5
                          text-[10px]
                          font-semibold
                          text-[#718096]
                        "
                      >
                        {file
                          ? `Máximo ${MAX_VIDEO_DURATION_SECONDS} segundos`
                          : 'o haz clic para seleccionar'}
                      </p>

                      {!file && (
                        <span
                          className="
                            mx-auto
                            mt-4
                            inline-flex
                            min-h-[35px]
                            items-center
                            gap-2
                            rounded-[9px]
                            border
                            border-[#ff641f]
                            bg-white
                            px-5
                            text-[10px]
                            font-black
                            text-[#ff641f]
                          "
                        >
                          <UploadCloud
                            size={14}
                          />

                          Seleccionar archivo
                        </span>
                      )}

                      <p
                        className="
                          mt-4
                          text-[8px]
                          font-bold
                          leading-4
                          text-[#718096]
                        "
                      >
                        Formato: MP4

                        <span className="mx-2">
                          |
                        </span>

                        Máximo 120 segundos

                        <span className="mx-2">
                          |
                        </span>

                        Video optimizado recomendado
                      </p>
                    </div>
                  </button>

                  {file && (
                    <button
                      type="button"
                      onClick={
                        clearFile
                      }
                      className="
                        mt-2
                        inline-flex
                        min-h-[34px]
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-[8px]
                        border
                        border-[#ffb795]
                        bg-white
                        px-4
                        text-[10px]
                        font-black
                        text-[#b74322]
                        transition
                        hover:bg-[#fff4ee]
                      "
                    >
                      <X
                        size={13}
                      />

                      Quitar video seleccionado
                    </button>
                  )}
                </section>
              )}
            </div>

            {/* =================================================
                PANEL DERECHO
                SIEMPRE VISIBLE
            ================================================= */}

            <aside
              className="
                flex
                h-full
                min-h-[500px]
                flex-col
                rounded-[22px]
                border
                border-[#c9dcec]
                bg-white
                p-4
                shadow-[0_18px_48px_-30px_rgba(4,43,87,.32)]
              "
            >
              {/* =================================================
                  CABECERA DEL PANEL
              ================================================= */}

              <div
                className="
                  mb-2.5
                  grid
                  h-8
                  w-8
                  place-items-center
                  rounded-[9px]
                  bg-[#fff0e8]
                  text-[#ff641f]
                "
              >
                {mustReviewConfiguration ? (
                  <Settings2
                    size={16}
                  />
                ) : (
                  <FileVideo
                    size={16}
                  />
                )}
              </div>

              <h2
                className="
                  text-[15px]
                  font-black
                  leading-tight
                  tracking-[-0.02em]
                  text-[#102033]
                "
              >
                {mustReviewConfiguration
                  ? 'Configuración actual'
                  : reconfiguringCamera
                    ? 'Siguiente: capturar frame'
                    : configured
                      ? 'Pipeline listo'
                      : 'Siguiente: área y góndolas'}
              </h2>

              <p
                className="
                  mt-2
                  text-[10px]
                  font-semibold
                  leading-[17px]
                  text-[#718096]
                "
              >
                {mustReviewConfiguration
                  ? 'Esta sede ya cuenta con una configuración guardada. Revisa sus datos antes de continuar.'
                  : reconfiguringCamera
                    ? 'Al continuar capturarás un nuevo frame. El plano guardado se mantiene para que solo ajustes lo necesario.'
                    : configured
                      ? 'La configuración guardada se reutilizará. Solo selecciona el video, define el área de análisis y ejecuta el procesamiento.'
                      : 'Después de subir el video, captura un frame claro y guarda las góndolas de esta sede.'}
              </p>

              {configured && (
                <figure
                  className="
                    mt-3
                    overflow-hidden
                    rounded-[12px]
                    border
                    border-[#d6e4f1]
                    bg-[#071d25]
                  "
                >
                  {referenceFrame?.dataUrl ? (
                    <div
                      className="
                        bg-[#071d25]
                        p-2
                        [&>div]:max-w-none
                        [&>div]:border-0
                        [&>div]:p-0
                        [&_canvas]:max-h-none
                      "
                    >
                      <LiveAlignment
                        frameCapture={referenceFrame}
                        configuration={site.configuration}
                        interactive={false}
                      />
                    </div>
                  ) : previewFrameSrc ? (
                    <img
                      src={previewFrameSrc}
                      alt="Previsualización de la configuración guardada"
                      className="
                        block
                        aspect-video
                        w-full
                        object-cover
                      "
                    />
                  ) : (
                    <div
                      className="
                        grid
                        aspect-video
                        place-items-center
                        px-4
                        text-center
                        text-[9px]
                        font-bold
                        text-white/65
                      "
                    >
                      Sin previsualización guardada
                    </div>
                  )}

                  <figcaption
                    className="
                      border-t
                      border-white/10
                      px-3
                      py-2
                      text-[8px]
                      font-semibold
                      text-white/70
                    "
                  >
                    {previewFrameCaption}
                  </figcaption>
                </figure>
              )}

              {/* =================================================
                  ESTADOS
              ================================================= */}

              <div
                className="
                  mt-3
                  grid
                  gap-2
                "
              >
                <PipelineItem
                  icon={
                    Settings2
                  }
                  active={
                    configured ||
                    metricCalibrated
                  }
                  label="Estado de la sede"
                  value={
                    calibrationLabel
                  }
                />

                <PipelineItem
                  icon={
                    Store
                  }
                  active={
                    gondolaCount >
                    0
                  }
                  label="Góndolas del plano"
                  value={
                    gondolaCount >
                    0
                      ? `${gondolaCount} guardadas`
                      : 'Pendientes'
                  }
                />

                <PipelineItem
                  icon={
                    UploadCloud
                  }
                  active={Boolean(
                    file
                  )}
                  label={
                    reconfiguringCamera
                      ? 'Video de referencia'
                      : 'Video del análisis'
                  }
                  value={
                    file
                      ? 'Listo'
                      : 'Pendiente'
                  }
                />
              </div>

              {/* =================================================
                  VIDEO SELECCIONADO
              ================================================= */}

              {file ? (
                <>
                  <h3
                    className="
                      mb-2
                      mt-3
                      text-[11px]
                      font-black
                      text-[#102033]
                    "
                  >
                    Video seleccionado
                  </h3>

                  <div
                    className="
                      grid
                      gap-1.5
                    "
                  >
                    <Data
                      label="Nombre"
                      value={
                        file.name
                      }
                    />

                    <Data
                      label="Tamaño"
                      value={formatBytes(
                        file.size
                      )}
                    />

                    <Data
                      label="Formato"
                      value={
                        file.type ||
                        'video/mp4'
                      }
                    />

                    {metadata?.duration ? (
                      <Data
                        label="Duración"
                        value={formatDuration(
                          metadata.duration
                        )}
                      />
                    ) : null}

                    {metadata?.width &&
                    metadata?.height ? (
                      <Data
                        label="Resolución"
                        value={`${metadata.width} x ${metadata.height}`}
                      />
                    ) : null}
                  </div>

                  {/* VIDEO MUY LARGO */}

                  {videoTooLong && (
                    <p
                      className="
                        mt-2
                        rounded-[8px]
                        border
                        border-[#ffd7c4]
                        bg-[#fff1eb]
                        px-3
                        py-2
                        text-[9px]
                        font-bold
                        text-[#b43b1d]
                      "
                    >
                      El video supera el límite de{' '}
                      {MAX_VIDEO_DURATION_SECONDS}{' '}
                      segundos. Selecciona un MP4 más corto.
                    </p>
                  )}

                  {/* =================================================
                      BOTONES
                  ================================================= */}

                  <div
                    className="
                      mt-auto
                      pt-3
                    "
                  >
                    <Link
                      aria-disabled={
                        videoTooLong
                      }
                      to={
                        videoTooLong
                          ? '#'
                          : nextPath
                      }
                      className={`
                        inline-flex
                        min-h-[36px]
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-[8px]
                        px-4
                        text-[10px]
                        font-black
                        text-white
                        no-underline
                        transition
                        ${
                          videoTooLong
                            ? 'pointer-events-none bg-[#cfd7e2] opacity-70'
                            : 'bg-gradient-to-r from-[#ff5b12] to-[#ff7b31] hover:-translate-y-0.5'
                        }
                      `}
                    >
                      {nextLabel}

                      <ArrowRight
                        size={14}
                      />
                    </Link>

                    <button
                      type="button"
                      onClick={
                        clearFile
                      }
                      className="
                        mt-2
                        inline-flex
                        min-h-[34px]
                        w-full
                        items-center
                        justify-center
                        gap-2
                        rounded-[8px]
                        border
                        border-[#d7e3ee]
                        bg-white
                        px-4
                        text-[10px]
                        font-black
                        text-[#102033]
                        transition
                        hover:border-[#ff641f]
                      "
                    >
                      <X
                        size={13}
                      />

                      Eliminar este video
                    </button>
                  </div>
                </>
              ) : (
                <p
                  className="
                    mt-3
                    rounded-[9px]
                    border
                    border-[#dce9f5]
                    bg-[#eef7ff]
                    px-3
                    py-3
                    text-[9px]
                    font-semibold
                    leading-4
                    text-[#61758c]
                  "
                >
                  {mustReviewConfiguration
                    ? 'La configuración de la sede está guardada. Selecciona un video para continuar con un nuevo análisis.'
                    : reconfiguringCamera
                      ? 'Selecciona el nuevo video de referencia para continuar con la captura del frame.'
                      : 'Cuando selecciones un video, SCAPDER mostrará sus datos reales aquí.'}
                </p>
              )}
            </aside>
          </div>

          {/* =================================================
              HISTORIAL
          ================================================= */}

          <section
            className="
              mt-3
              w-full
            "
          >
            <div
              className="
                rounded-[20px]
                border
                border-[#c9dcec]
                bg-white
                p-4
                shadow-[0_18px_48px_-32px_rgba(4,43,87,.26)]
              "
            >
              <div
                className="
                  flex
                  flex-col
                  gap-3
                  sm:flex-row
                  sm:items-center
                  sm:justify-between
                "
              >
                <div>
                  <span
                    className="
                      text-[8px]
                      font-black
                      uppercase
                      tracking-[.1em]
                      text-[#1686e8]
                    "
                  >
                    Historial
                  </span>

                  <h3
                    className="
                      mt-1
                      text-[15px]
                      font-black
                      text-[#102033]
                    "
                  >
                    Análisis anteriores de esta sede
                  </h3>
                </div>

                <Link
                  to={`/sedes/${siteId}/historial`}
                  className="
                    inline-flex
                    min-h-[34px]
                    items-center
                    justify-center
                    rounded-[8px]
                    border
                    border-[#d6e4f1]
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
                  Ver historial completo
                </Link>
              </div>

              {historyError && (
                <p
                  className="
                    mt-3
                    rounded-[9px]
                    bg-[#fff1eb]
                    px-4
                    py-3
                    text-[10px]
                    font-bold
                    text-[#b43b1d]
                  "
                >
                  {historyError}
                </p>
              )}

              <div
                className="
                  mt-3
                "
              >
                {!history.length &&
                !historyError ? (
                  <div
                    className="
                      flex
                      min-h-[58px]
                      items-center
                      justify-center
                      rounded-[9px]
                      border
                      border-dashed
                      border-[#cbddeb]
                      bg-[#f6faff]
                      px-5
                    "
                  >
                    <p
                      className="
                        text-[10px]
                        font-semibold
                        text-[#718096]
                      "
                    >
                      Todavía no hay análisis previos
                      para esta sede.
                    </p>
                  </div>
                ) : (
                  <div
                    className="
                      grid
                      gap-2
                    "
                  >
                    {history
                      .slice(
                        0,
                        4
                      )
                      .map(
                        (
                          analysis
                        ) => (
                          <Link
                            key={
                              analysis.id
                            }
                            to={`/analyses/${analysis.id}`}
                            className="
                              grid
                              gap-2
                              rounded-[9px]
                              border
                              border-[#e5e7ee]
                              bg-white
                              px-4
                              py-2.5
                              no-underline
                              transition
                              hover:border-[#ff641f]
                              sm:grid-cols-[1fr_auto_auto]
                              sm:items-center
                            "
                          >
                            <b
                              className="
                                truncate
                                text-[10px]
                                text-[#102033]
                              "
                            >
                              {
                                analysis.filename
                              }
                            </b>

                            <span
                              className="
                                text-[9px]
                                font-semibold
                                text-[#718096]
                              "
                            >
                              {analysis.created_at
                                ? new Date(
                                    analysis.created_at
                                  ).toLocaleString(
                                    'es-CO'
                                  )
                                : ''}
                            </span>

                            <span
                              className={`
                                w-fit
                                rounded-full
                                px-3
                                py-1
                                text-[8px]
                                font-black
                                ${
                                  analysis.status ===
                                  'completed'
                                    ? 'bg-[#eaf8ef] text-[#17803f]'
                                    : analysis.status ===
                                        'failed'
                                      ? 'bg-[#fff1eb] text-[#b43b1d]'
                                      : analysis.status ===
                                          'cancelled'
                                        ? 'bg-[#f0f2f5] text-[#64748b]'
                                        : 'bg-[#eef5ff] text-[#2f7df6]'
                                }
                              `}
                            >
                              {
                                analysis.status
                              }
                            </span>
                          </Link>
                        )
                      )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* =====================================================
          MODAL
      ===================================================== */}

      {instructionsOpen && (
        <InstructionsModal
          onClose={() =>
            setInstructionsOpen(
              false
            )
          }
          configured={
            configured
          }
          reconfiguringCamera={
            reconfiguringCamera
          }
        />
      )}
    </main>
  )
}

/* =========================================================
   MODAL DE INSTRUCCIONES
========================================================= */

function InstructionsModal({
  onClose,
  configured,
  reconfiguringCamera,
}) {
  return (
    <div
      className="
        fixed
        inset-0
        z-[80]
        grid
        place-items-center
        bg-[#02060b]/70
        px-4
        backdrop-blur-sm
      "
    >
      <section
        className="
          w-full
          max-w-[520px]
          rounded-[20px]
          border
          border-[#d6e4f1]
          bg-white
          p-5
          shadow-[0_30px_90px_rgba(0,0,0,.35)]
        "
      >
        <div
          className="
            mb-4
            flex
            items-start
            justify-between
            gap-3
          "
        >
          <div>
            <span
              className="
                text-[10px]
                font-black
                uppercase
                text-[#ff5b12]
              "
            >
              Ayuda rápida
            </span>

            <h2
              className="
                mt-1
                text-xl
                font-black
                text-[#151323]
              "
            >
              {reconfiguringCamera
                ? 'Cómo recalibrar la cámara'
                : 'Cómo usar este pipeline'}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Cerrar instrucciones"
            onClick={
              onClose
            }
            className="
              grid
              h-9
              w-9
              place-items-center
              rounded-full
              border
              border-[#e5e7ee]
              bg-white
              text-[#151323]
              transition
              hover:border-[#ff641f]
            "
          >
            <X
              size={16}
            />
          </button>
        </div>

        {reconfiguringCamera ? (
          <div
            className="
              grid
              gap-3
              text-xs
              font-semibold
              leading-5
              text-[#64748b]
            "
          >
            <p>
              <b className="text-[#151323]">
                1. Sube el nuevo video.
              </b>{' '}
              Usa un MP4 capturado desde la cámara actual.
            </p>

            <p>
              <b className="text-[#151323]">
                2. Captura un nuevo frame.
              </b>{' '}
              El siguiente paso utilizará el video para
              actualizar la referencia.
            </p>

            <p>
              <b className="text-[#151323]">
                3. Conserva el plano.
              </b>{' '}
              Las góndolas guardadas se mantienen para que
              solo ajustes lo necesario.
            </p>
          </div>
        ) : (
          <div
            className="
              grid
              gap-3
              text-xs
              font-semibold
              leading-5
              text-[#64748b]
            "
          >
            <p>
              <b className="text-[#151323]">
                1. Sube el video.
              </b>{' '}
              Usa un MP4 de la cámara fija de la sede.
            </p>

            <p>
              <b className="text-[#151323]">
                2. Configura zonas.
              </b>{' '}
              Elige si vas a analizar toda la cámara o
              solo un área del video.
            </p>

            <p>
              <b className="text-[#151323]">
                3. Dibuja el planograma.
              </b>{' '}
              En la siguiente pantalla puedes marcar
              góndolas y guardar el plano antes de analizar.
            </p>

            {!configured && (
              <p
                className="
                  rounded-xl
                  border
                  border-[#ffd7c4]
                  bg-[#fff7f2]
                  px-3
                  py-3
                  text-[#b43b1d]
                "
              >
                Si la sede no tiene plano guardado,
                dibuja las góndolas en el paso de zonas
                antes de analizar.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/* =========================================================
   ITEM DE PIPELINE
========================================================= */

function PipelineItem({
  icon: Icon,
  active,
  label,
  value,
}) {
  return (
    <div
      className={`
        flex
        items-center
        gap-2.5
        rounded-[10px]
        border
        px-3
        py-2
        ${
          active
            ? 'border-[#c6efdc] bg-[#effcf6]'
            : 'border-[#dce6ef] bg-white'
        }
      `}
    >
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
              ? 'bg-[#17a964] text-white'
              : 'bg-[#eff5fb] text-[#60778f]'
          }
        `}
      >
        <Icon
          size={13}
        />
      </span>

      <span
        className="
          min-w-0
        "
      >
        <b
          className="
            block
            text-[9px]
            font-black
            text-[#102033]
          "
        >
          {label}
        </b>

        <small
          className={`
            block
            text-[9px]
            font-semibold
            ${
              active
                ? 'text-[#169158]'
                : 'text-[#7d8392]'
            }
          `}
        >
          {value}
        </small>
      </span>
    </div>
  )
}

/* =========================================================
   DATOS DEL VIDEO
========================================================= */

function Data({
  label,
  value,
}) {
  return (
    <div
      className="
        rounded-[8px]
        border
        border-[#edf1f5]
        bg-[#f6f8fa]
        px-3
        py-1.5
      "
    >
      <span
        className="
          block
          text-[7px]
          font-black
          uppercase
          tracking-[.06em]
          text-[#7d8392]
        "
      >
        {label}
      </span>

      <b
        className="
          mt-0.5
          block
          break-words
          text-[9px]
          text-[#151323]
        "
      >
        {value}
      </b>
    </div>
  )
}
