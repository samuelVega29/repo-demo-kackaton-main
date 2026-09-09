import {
  Check,
  Circle,
  Loader2,
  Play,
  Sparkles,
  X,
} from 'lucide-react'

import {
  useEffect,
  useState,
} from 'react'

import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'

import { useApp } from '../context/AppProvider'

import {
  cancelAnalysis,
  getAnalysis,
  getAnalysisStatus,
} from '../services/analyses'

/* =========================================================
   IMÁGENES
========================================================= */

import processingRobot from '../assets/images/robot-procesamiento.png'
import videoIcon from '../assets/images/icono-video.png'
import analysisIcon from '../assets/images/icono-analisis2.png'

/* =========================================================
   ETAPAS DEL PROCESAMIENTO
========================================================= */

const steps = [
  [
    'upload',
    'Carga del video',
    'Video listo para procesar',
  ],

  [
    'detect',
    'Detección de personas',
    'Identificando personas en el video',
  ],

  [
    'tracking',
    'Análisis de trayectoria',
    'Identificando patrones de movimiento',
  ],

  [
    'dwell',
    'Tiempo de permanencia',
    'Calculando tiempos dentro de cada zona',
  ],

  [
    'heatmaps',
    'Generación del mapa',
    'Construyendo el mapa de actividad',
  ],

  [
    'interactions',
    'Interacciones detectadas',
    'Analizando puntos de interacción',
  ],

  [
    'recommendations',
    'Recomendaciones finales',
    'Preparando los insights del análisis',
  ],
]

const stageIndex = (stage) =>
  Math.max(
    0,
    steps.findIndex(
      ([key]) =>
        key === stage
    )
  )

/* =========================================================
   COMPONENTE
========================================================= */

export default function ProcessingPage() {
  const {
    analysisId,
  } = useParams()

  const navigate =
    useNavigate()

  const {
    setJob,
  } = useApp()

  const [
    status,
    setStatus,
  ] = useState(null)

  const [
    error,
    setError,
  ] = useState('')

  const [
    cancelling,
    setCancelling,
  ] = useState(false)

  const [
    showCancelConfirm,
    setShowCancelConfirm,
  ] = useState(false)

  /* =========================================================
     ESTADOS DERIVADOS
  ========================================================= */

  const isCancelling =
    cancelling ||
    status?.status ===
      'cancelling'

  const isCancelled =
    status?.status ===
    'cancelled'

  const isFailed =
    status?.status ===
    'failed'

  const isCompleted =
    status?.status ===
    'completed'

  const isFinished =
    isCancelled ||
    isFailed ||
    isCompleted

  /* =========================================================
     CONSULTAR ESTADO DEL ANÁLISIS
  ========================================================= */

  useEffect(() => {
    if (!analysisId) {
      return undefined
    }

    let stopped =
      false

    const tick =
      async () => {
        try {
          const data =
            await getAnalysisStatus(
              analysisId
            )

          if (stopped) {
            return
          }

          setStatus(
            data
          )

          /* =========================
             COMPLETADO
          ========================== */

          if (
            data.status ===
            'completed'
          ) {
            const detail =
              await getAnalysis(
                analysisId
              )

            if (stopped) {
              return
            }

            setJob(
              detail
            )

            navigate(
              `/analyses/${analysisId}`,
              {
                replace:
                  true,
              }
            )

            return
          }

          /* =========================
             CANCELANDO
          ========================== */

          if (
            data.status ===
            'cancelling'
          ) {
            setCancelling(
              true
            )

            setShowCancelConfirm(
              false
            )

            setError(
              ''
            )

            return
          }

          /* =========================
             CANCELADO
          ========================== */

          if (
            data.status ===
            'cancelled'
          ) {
            setCancelling(
              false
            )

            setShowCancelConfirm(
              false
            )

            setError(
              ''
            )

            return
          }

          /* =========================
             ERROR DEL BACKEND
          ========================== */

          if (
            data.status ===
            'failed'
          ) {
            setCancelling(
              false
            )

            setError(
              data.message ||
                'No fue posible completar el análisis.'
            )
          }
        } catch (
          requestError
        ) {
          if (
            !stopped
          ) {
            setError(
              requestError.message ||
                'No fue posible consultar el estado del análisis.'
            )
          }
        }
      }

    tick()

    const timer =
      window.setInterval(
        tick,
        1200
      )

    return () => {
      stopped = true

      window.clearInterval(
        timer
      )
    }
  }, [
    analysisId,
    navigate,
    setJob,
  ])

  /* =========================================================
     CANCELAR ANÁLISIS
  ========================================================= */

  const handleCancelAnalysis =
    async () => {
      if (
        !analysisId ||
        isCancelling ||
        isCancelled ||
        isCompleted
      ) {
        return
      }

      try {
        setCancelling(
          true
        )

        setShowCancelConfirm(
          false
        )

        setError(
          ''
        )

        const result =
          await cancelAnalysis(
            analysisId
          )

        setStatus(
          (
            currentStatus
          ) => ({
            ...(
              currentStatus ||
              {}
            ),

            ...result,
          })
        )
      } catch (
        cancelError
      ) {
        setCancelling(
          false
        )

        setError(
          cancelError?.message ||
            'No fue posible cancelar el análisis.'
        )
      }
    }

  /* =========================================================
     PROGRESO
  ========================================================= */

  const current =
    stageIndex(
      status?.stage
    )

  const rawProgress =
    Number(
      status?.progress ??
        0
    )

  const progress =
    Math.min(
      100,
      Math.max(
        0,
        Math.round(
          rawProgress
        )
      )
    )

  /* =========================================================
     MENSAJE PRINCIPAL
  ========================================================= */

  const mainMessage =
    isCancelled
      ? 'El análisis fue cancelado.'
      : isCancelling
        ? 'Estamos deteniendo el procesamiento...'
        : status?.message ||
          'Preparando el análisis del video...'

  const progressLabel =
    isCancelled
      ? 'Cancelado'
      : isCancelling
        ? 'Cancelando...'
        : isFailed
          ? 'Error'
          : 'Analizando...'

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <main
      className="
        relative
        isolate
        min-h-[calc(100vh-64px)]
        w-full
        overflow-x-hidden
        bg-[#03182f]
        text-white
      "
    >
      {/* =====================================================
          FONDO PRINCIPAL
      ===================================================== */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          -z-20
          bg-[radial-gradient(circle_at_16%_40%,rgba(0,103,211,.30),transparent_30%),radial-gradient(circle_at_92%_8%,rgba(255,100,31,.15),transparent_24%),linear-gradient(115deg,#03172d_0%,#052b55_34%,#041b35_66%,#020f20_100%)]
        "
      />

      {/* CÍRCULO AZUL IZQUIERDO */}

      <div
        className="
          pointer-events-none
          absolute
          -left-[260px]
          top-[70px]
          -z-10
          h-[720px]
          w-[720px]
          rounded-full
          border-[90px]
          border-[#1276d6]/10
        "
      />

      {/* LUZ AZUL */}

      <div
        className="
          pointer-events-none
          absolute
          left-[8%]
          top-[22%]
          -z-10
          h-[520px]
          w-[520px]
          rounded-full
          bg-[radial-gradient(circle,rgba(8,104,210,.25),transparent_68%)]
          blur-2xl
        "
      />

      {/* CÍRCULO NARANJA */}

      <div
        className="
          pointer-events-none
          absolute
          -right-[180px]
          -top-[210px]
          -z-10
          h-[500px]
          w-[500px]
          rounded-full
          border-[42px]
          border-[#ff641f]/20
        "
      />

      {/* FORMA INFERIOR */}

      <div
        className="
          pointer-events-none
          absolute
          bottom-[-280px]
          right-[7%]
          -z-10
          h-[700px]
          w-[250px]
          rotate-[32deg]
          rounded-full
          bg-[#0b67bd]/10
          blur-xl
        "
      />

      {/* PUNTOS DECORATIVOS */}

      <div
        className="
          pointer-events-none
          absolute
          right-[3%]
          top-[37%]
          hidden
          grid-cols-4
          gap-[9px]
          xl:grid
        "
      >
        {Array.from({
          length: 20,
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
                bg-[#1686e8]/35
              "
            />
          )
        )}
      </div>

      {/* =====================================================
          CONTENIDO GENERAL
      ===================================================== */}

      <div
        className="
          relative
          z-10
          mx-auto
          grid
          w-full
          max-w-[1450px]
          gap-5
          px-4
          py-7
          sm:px-6
          lg:grid-cols-[420px_minmax(0,1fr)]
          lg:items-center
          lg:px-8
          xl:grid-cols-[470px_minmax(0,1fr)]
          xl:gap-7
        "
      >
        {/* =================================================
            COLUMNA IZQUIERDA
        ================================================= */}

        <section
          className="
            relative
            hidden
            min-h-[700px]
            overflow-hidden
            rounded-[28px]
            lg:block
          "
        >
          {/* =========================
              TÍTULO
          ========================== */}

          <div
            className="
              relative
              z-30
              px-8
              pt-8
            "
          >
            <span
              className="
                text-[10px]
                font-black
                uppercase
                tracking-[.22em]
                text-[#ff641f]
              "
            >
              Inteligencia que transforma
            </span>

            <h1
              className="
                mt-4
                max-w-[380px]
                text-[42px]
                font-black
                leading-[.98]
                tracking-[-0.05em]
                text-white
              "
            >
              {isCancelled ? (
                <>
                  Análisis
                  <br />

                  <span
                    className="
                      text-[#ff641f]
                    "
                  >
                    cancelado
                  </span>
                </>
              ) : (
                <>
                  Procesando tu
                  <br />

                  análisis de{' '}

                  <span
                    className="
                      text-[#ff641f]
                    "
                  >
                    video
                  </span>
                </>
              )}
            </h1>

            <p
              className="
                mt-5
                max-w-[350px]
                text-[13px]
                font-semibold
                leading-6
                text-[#a8c0d9]
              "
            >
              {isCancelled
                ? 'El procesamiento se detuvo correctamente. Puedes volver e iniciar un nuevo análisis cuando quieras.'
                : isCancelling
                  ? 'Estamos deteniendo de forma segura el procesamiento del video.'
                  : 'Nuestra IA está analizando cada frame para convertir el video en información útil para tu sede.'}
            </p>
          </div>

          {/* =================================================
              CÍRCULO DETRÁS DEL ROBOT
          ================================================= */}

          <div
            className="
              pointer-events-none
              absolute
              left-[34px]
              top-[280px]
              h-[440px]
              w-[440px]
              rounded-full
              border
              border-[#ff641f]/40
              shadow-[0_0_70px_rgba(255,100,31,.12)]
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              left-[72px]
              top-[320px]
              h-[360px]
              w-[360px]
              rounded-full
              bg-[radial-gradient(circle,rgba(255,100,31,.18),transparent_68%)]
              blur-xl
            "
          />

          {/* =================================================
              TEXTO ANALIZANDO
          ================================================= */}

          {!isCancelled && (
            <div
              className="
                absolute
                left-[25px]
                top-[295px]
                z-40
                -rotate-[5deg]
              "
            >
              <p
                className="
                  text-[22px]
                  font-black
                  italic
                  leading-[1.08]
                  text-white
                "
              >
                {isCancelling
                  ? (
                    <>
                      Deteniendo
                      <br />
                      proceso...
                    </>
                  )
                  : (
                    <>
                      Analizando
                      <br />
                      para ti...
                    </>
                  )}
              </p>

              <span
                className="
                  mt-2
                  block
                  h-[3px]
                  w-[110px]
                  -rotate-[8deg]
                  rounded-full
                  bg-[#ff641f]
                "
              />
            </div>
          )}

          {/* =================================================
              ICONO ANÁLISIS
          ================================================= */}

          <div
            className="
              absolute
              right-[5px]
              top-[230px]
              z-30
              grid
              h-[125px]
              w-[150px]
              place-items-center
              rounded-[18px]
              border
              border-[#3273ad]/40
              bg-[#0d3155]/65
              p-3
              shadow-[0_20px_45px_-25px_rgba(0,0,0,.8)]
              backdrop-blur-md
            "
          >
            <img
              src={
                analysisIcon
              }
              alt="Icono de análisis"
              className="
                h-full
                w-full
                object-contain
              "
            />
          </div>

          {/* =================================================
              ICONO VIDEO
          ================================================= */}

          <div
            className="
              absolute
              right-[5px]
              top-[370px]
              z-30
              grid
              h-[90px]
              w-[110px]
              place-items-center
              rounded-[17px]
              border
              border-[#ff641f]/25
              bg-[#0c2948]/70
              p-3
              shadow-[0_20px_45px_-25px_rgba(0,0,0,.8)]
              backdrop-blur-md
            "
          >
            <img
              src={
                videoIcon
              }
              alt="Icono de video"
              className="
                h-full
                w-full
                object-contain
              "
            />
          </div>

          {/* =================================================
              ROBOT
          ================================================= */}

          <img
            src={
              processingRobot
            }
            alt="Robot Scapder procesando análisis"
            className="
              absolute
              bottom-[30px]
              left-1/2
              z-30
              h-[470px]
              w-[455px]
              max-w-none
              -translate-x-1/2
              object-contain
              object-bottom
              drop-shadow-[0_30px_45px_rgba(0,0,0,.48)]
            "
          />

          {/* =================================================
              BASE DEL ROBOT
          ================================================= */}

          <div
            className="
              absolute
              bottom-[44px]
              left-1/2
              z-20
              h-[58px]
              w-[345px]
              -translate-x-1/2
              rounded-[50%]
              border-2
              border-[#ff641f]/70
              bg-[#ff641f]/5
              shadow-[0_0_42px_rgba(255,100,31,.32)]
            "
          />

          {/* =================================================
              TARJETA INFERIOR
          ================================================= */}

          <div
            className="
              absolute
              bottom-[5px]
              left-7
              right-7
              z-40
              rounded-[16px]
              border
              border-[#ff641f]/30
              bg-[#071a2d]/90
              px-4
              py-3
              backdrop-blur-xl
            "
          >
            <div
              className="
                flex
                items-center
                gap-3
              "
            >
              <div
                className="
                  grid
                  h-9
                  w-9
                  shrink-0
                  place-items-center
                  rounded-full
                  bg-[#ff641f]
                  text-white
                "
              >
                <Sparkles
                  size={16}
                />
              </div>

              <div>
                <b
                  className="
                    block
                    text-[11px]
                    font-black
                    text-white
                  "
                >
                  {isCancelled
                    ? 'Procesamiento detenido'
                    : 'Análisis inteligente'}
                </b>

                <span
                  className="
                    mt-0.5
                    block
                    text-[9px]
                    font-semibold
                    leading-4
                    text-[#8facca]
                  "
                >
                  {isCancelled
                    ? 'El análisis fue cancelado correctamente.'
                    : 'Procesamos movimiento, permanencia e interacciones para generar resultados.'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================
            PANEL DERECHO
        ================================================= */}

        <section
          className="
            relative
            overflow-hidden
            rounded-[26px]
            border
            border-[#1269ae]/55
            bg-[#031a31]/90
            p-5
            shadow-[0_30px_80px_-40px_rgba(0,0,0,.8)]
            backdrop-blur-xl
            sm:p-6
            lg:p-7
          "
        >
          {/* LUZ INTERNA */}

          <div
            className="
              pointer-events-none
              absolute
              -right-[100px]
              -top-[100px]
              h-[320px]
              w-[320px]
              rounded-full
              bg-[radial-gradient(circle,rgba(13,95,170,.22),transparent_70%)]
            "
          />

          {/* =================================================
              CABECERA
          ================================================= */}

          <div
            className="
              relative
              z-10
            "
          >
            <span
              className="
                text-[11px]
                font-black
                text-[#ff641f]
              "
            >
              {isCancelled
                ? 'Procesamiento cancelado'
                : isCancelling
                  ? 'Cancelando procesamiento'
                  : 'Procesamiento'}
            </span>

            <h2
              className="
                mt-2
                text-[clamp(25px,3vw,36px)]
                font-black
                leading-tight
                tracking-[-0.04em]
                text-white
              "
            >
              {isCancelled
                ? 'El análisis fue cancelado'
                : isCancelling
                  ? 'Deteniendo el análisis'
                  : 'Procesando tu análisis de video'}
            </h2>

            <p
              className="
                mt-2
                text-[13px]
                font-semibold
                text-[#8fa9c3]
              "
            >
              {mainMessage}
            </p>
          </div>

          {/* =================================================
              PROGRESO
          ================================================= */}

          <div
            className="
              relative
              z-10
              mt-6
              grid
              gap-5
              md:grid-cols-[210px_minmax(0,1fr)]
              md:items-center
            "
          >
            {/* CÍRCULO */}

            <div
              className="
                flex
                justify-center
                md:justify-start
              "
            >
              <div
                className="
                  relative
                  grid
                  h-[170px]
                  w-[170px]
                  place-items-center
                  rounded-full
                "
                style={{
                  background:
                    `conic-gradient(
                      ${
                        isCancelled
                          ? '#64748b'
                          : '#ff641f'
                      }
                      0deg,
                      ${
                        isCancelled
                          ? '#64748b'
                          : '#ff641f'
                      }
                      ${progress * 3.6}deg,
                      #173a5c
                      ${progress * 3.6}deg,
                      #173a5c
                      360deg
                    )`,
                }}
              >
                <div
                  className="
                    grid
                    h-[136px]
                    w-[136px]
                    place-items-center
                    rounded-full
                    border
                    border-[#244765]
                    bg-[#041a30]
                    shadow-[inset_0_0_28px_rgba(0,0,0,.24)]
                  "
                >
                  <div
                    className="
                      text-center
                    "
                  >
                    <strong
                      className="
                        block
                        text-[38px]
                        font-black
                        leading-none
                        text-white
                      "
                    >
                      {progress}%
                    </strong>

                    <span
                      className="
                        mt-2
                        block
                        text-[10px]
                        font-bold
                        text-[#9bb2c8]
                      "
                    >
                      {progressLabel}
                    </span>
                  </div>
                </div>

                {!error &&
                  !isCancelled && (
                    <span
                      className="
                        absolute
                        -right-2
                        top-1/2
                        grid
                        h-8
                        w-8
                        -translate-y-1/2
                        place-items-center
                        rounded-full
                        bg-[#ff641f]
                        shadow-[0_0_24px_rgba(255,100,31,.5)]
                      "
                    >
                      <Loader2
                        size={16}
                        className="
                          animate-spin
                          text-white
                        "
                      />
                    </span>
                  )}

                {isCancelled && (
                  <span
                    className="
                      absolute
                      -right-2
                      top-1/2
                      grid
                      h-8
                      w-8
                      -translate-y-1/2
                      place-items-center
                      rounded-full
                      bg-[#64748b]
                      text-white
                    "
                  >
                    <X
                      size={16}
                    />
                  </span>
                )}
              </div>
            </div>

            {/* INFORMACIÓN */}

            <div
              className="
                rounded-[16px]
                border
                border-[#244767]
                bg-[#0a2743]/70
                px-4
                py-4
              "
            >
              <div
                className="
                  flex
                  items-center
                  gap-3
                "
              >
                <div
                  className="
                    grid
                    h-12
                    w-12
                    shrink-0
                    place-items-center
                    rounded-[11px]
                    border
                    border-[#ff641f]/20
                    bg-[#ff641f]/5
                    p-2
                  "
                >
                  <img
                    src={
                      analysisIcon
                    }
                    alt="Análisis en proceso"
                    className="
                      h-full
                      w-full
                      object-contain
                    "
                  />
                </div>

                <div>
                  <b
                    className="
                      block
                      text-[12px]
                      font-black
                      text-white
                    "
                  >
                    {isCancelled
                      ? 'Análisis cancelado'
                      : isCancelling
                        ? 'Deteniendo análisis'
                        : 'Análisis en proceso'}
                  </b>

                  <p
                    className="
                      mt-1
                      text-[10px]
                      font-semibold
                      leading-5
                      text-[#91a9c0]
                    "
                  >
                    {isCancelled
                      ? 'El procesamiento del video se detuvo correctamente.'
                      : isCancelling
                        ? 'Espera un momento mientras detenemos el procesamiento de forma segura.'
                        : 'Estamos procesando cada frame para obtener resultados más precisos.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* =================================================
              ETAPAS
          ================================================= */}

          <div
            className="
              relative
              z-10
              mt-6
              grid
              gap-2
            "
          >
            {steps.map(
              (
                [
                  key,
                  label,
                  description,
                ],
                index
              ) => {
                const done =
                  index <
                    current ||
                  status?.status ===
                    'completed'

                const active =
                  index ===
                    current &&
                  !error &&
                  !isCancelled

                return (
                  <div
                    key={
                      key
                    }
                    className={`
                      flex
                      min-h-[58px]
                      items-center
                      gap-3
                      rounded-[12px]
                      border
                      px-4
                      py-3
                      transition

                      ${
                        done
                          ? 'border-[#135a50] bg-[#07322f]/45'
                          : active
                            ? 'border-[#ff641f]/70 bg-[#432014]/35 shadow-[0_0_25px_-18px_rgba(255,100,31,.7)]'
                            : 'border-[#1f405e] bg-[#082039]/55'
                      }
                    `}
                  >
                    {/* ICONO */}

                    <span
                      className={`
                        grid
                        h-8
                        w-8
                        shrink-0
                        place-items-center
                        rounded-full

                        ${
                          done
                            ? 'bg-[#10b981] text-white'
                            : active
                              ? 'border-2 border-[#ff641f] bg-[#ff641f]/15 text-[#ff641f]'
                              : 'border-2 border-[#45627d] bg-[#09223b] text-[#7891aa]'
                        }
                      `}
                    >
                      {done ? (
                        <Check
                          size={15}
                        />
                      ) : active ? (
                        isCancelling ? (
                          <X
                            size={14}
                          />
                        ) : (
                          <Loader2
                            size={14}
                            className="
                              animate-spin
                            "
                          />
                        )
                      ) : (
                        <Circle
                          size={11}
                        />
                      )}
                    </span>

                    {/* TEXTO */}

                    <div
                      className="
                        min-w-0
                        flex-1
                      "
                    >
                      <b
                        className="
                          block
                          text-[11px]
                          font-black
                          text-white
                        "
                      >
                        {label}
                      </b>

                      {active && (
                        <span
                          className="
                            mt-0.5
                            block
                            text-[9px]
                            font-semibold
                            text-[#8fa7be]
                          "
                        >
                          {isCancelling
                            ? 'Deteniendo esta etapa...'
                            : description}
                        </span>
                      )}
                    </div>

                    {/* ESTADO */}

                    <div
                      className="
                        hidden
                        shrink-0
                        items-center
                        gap-3
                        sm:flex
                      "
                    >
                      {done && (
                        <span
                          className="
                            text-[9px]
                            font-black
                            text-[#10b981]
                          "
                        >
                          Completado
                        </span>
                      )}

                      {active && (
                        <>
                          <div
                            className="
                              h-[5px]
                              w-[120px]
                              overflow-hidden
                              rounded-full
                              bg-[#244561]
                            "
                          >
                            <div
                              className="
                                h-full
                                rounded-full
                                bg-gradient-to-r
                                from-[#ff5b12]
                                to-[#ff7c37]
                              "
                              style={{
                                width:
                                  `${progress}%`,
                              }}
                            />
                          </div>

                          <span
                            className="
                              min-w-[55px]
                              text-right
                              text-[9px]
                              font-black
                              text-white
                            "
                          >
                            {isCancelling
                              ? 'Cancelando'
                              : `${progress}%`}
                          </span>
                        </>
                      )}

                      {!done &&
                        !active && (
                          <span
                            className="
                              text-[9px]
                              font-semibold
                              text-[#8298ac]
                            "
                          >
                            {isCancelled
                              ? 'No iniciado'
                              : 'Pendiente'}
                          </span>
                        )}
                    </div>
                  </div>
                )
              }
            )}
          </div>

          {/* =================================================
              PIE NORMAL
          ================================================= */}

          {!error &&
            !isCancelled && (
              <div
                className="
                  relative
                  z-10
                  mt-4
                  rounded-[12px]
                  border
                  border-[#163b5b]
                  bg-[#06203a]/80
                  px-4
                  py-3
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
                  <div
                    className="
                      inline-flex
                      items-center
                      gap-2
                      text-[9px]
                      font-semibold
                      text-[#93abc2]
                    "
                  >
                    <Play
                      size={13}
                      className="
                        text-[#36a6ff]
                      "
                    />

                    {isCancelling
                      ? 'Estamos deteniendo el procesamiento...'
                      : 'El proceso puede tardar algunos minutos.'}
                  </div>

                  <span
                    className="
                      text-[9px]
                      font-black
                      text-[#ff7b3b]
                    "
                  >
                    {isCancelling
                      ? 'Cancelación en proceso'
                      : 'Procesamiento en tiempo real'}
                  </span>
                </div>

                {/* =============================================
                    BOTÓN CANCELAR
                ============================================= */}

                {!isCancelling && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowCancelConfirm(
                        true
                      )
                    }
                    disabled={
                      isFinished
                    }
                    className="
                      mt-3
                      inline-flex
                      min-h-[42px]
                      w-full
                      items-center
                      justify-center
                      gap-2
                      rounded-[10px]
                      border
                      border-[#ff641f]/50
                      bg-[#ff641f]/10
                      px-4
                      text-[10px]
                      font-black
                      text-[#ff7b3b]
                      transition
                      hover:border-[#ff641f]
                      hover:bg-[#ff641f]
                      hover:text-white
                      disabled:cursor-not-allowed
                      disabled:opacity-40
                    "
                  >
                    <X
                      size={14}
                    />

                    Cancelar análisis
                  </button>
                )}

                {isCancelling && (
                  <button
                    type="button"
                    disabled
                    className="
                      mt-3
                      inline-flex
                      min-h-[42px]
                      w-full
                      cursor-wait
                      items-center
                      justify-center
                      gap-2
                      rounded-[10px]
                      border
                      border-[#ff641f]/35
                      bg-[#ff641f]/10
                      px-4
                      text-[10px]
                      font-black
                      text-[#ff9a69]
                      opacity-80
                    "
                  >
                    <Loader2
                      size={14}
                      className="
                        animate-spin
                      "
                    />

                    Cancelando análisis...
                  </button>
                )}
              </div>
            )}

          {/* =================================================
              ANÁLISIS CANCELADO
          ================================================= */}

          {isCancelled && (
            <div
              className="
                relative
                z-10
                mt-5
                rounded-[14px]
                border
                border-[#36536e]
                bg-[#0b2944]/80
                p-4
              "
            >
              <div
                className="
                  flex
                  items-start
                  gap-3
                "
              >
                <div
                  className="
                    grid
                    h-9
                    w-9
                    shrink-0
                    place-items-center
                    rounded-full
                    bg-[#64748b]
                    text-white
                  "
                >
                  <X
                    size={17}
                  />
                </div>

                <div>
                  <b
                    className="
                      block
                      text-[12px]
                      font-black
                      text-white
                    "
                  >
                    Análisis cancelado
                  </b>

                  <p
                    className="
                      mt-1
                      text-[10px]
                      font-semibold
                      leading-5
                      text-[#9bb2c8]
                    "
                  >
                    El procesamiento se detuvo correctamente.
                    Puedes volver y comenzar un nuevo análisis.
                  </p>
                </div>
              </div>

              <Link
                to="/empresas"
                className="
                  mt-4
                  inline-flex
                  min-h-[40px]
                  w-full
                  items-center
                  justify-center
                  rounded-[9px]
                  bg-[#ff641f]
                  px-4
                  text-[10px]
                  font-black
                  text-white
                  no-underline
                  transition
                  hover:-translate-y-px
                  hover:bg-[#ff752f]
                "
              >
                Volver a empresas
              </Link>
            </div>
          )}

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div
              className="
                relative
                z-10
                mt-5
                rounded-[14px]
                border
                border-[#7c3928]
                bg-[#351b18]/80
                p-4
              "
            >
              <p
                className="
                  text-[11px]
                  font-bold
                  leading-5
                  text-[#ff9b7c]
                "
              >
                {error}
              </p>

              <Link
                to="/empresas"
                className="
                  mt-3
                  inline-flex
                  min-h-[38px]
                  items-center
                  justify-center
                  rounded-[8px]
                  bg-[#ff641f]
                  px-4
                  text-[10px]
                  font-black
                  text-white
                  no-underline
                  transition
                  hover:-translate-y-px
                "
              >
                Volver a empresas
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* =====================================================
          MODAL CONFIRMAR CANCELACIÓN
      ===================================================== */}

      {showCancelConfirm && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            bg-[#010914]/80
            px-4
            backdrop-blur-sm
          "
          onClick={() =>
            setShowCancelConfirm(
              false
            )
          }
        >
          <div
            className="
              w-full
              max-w-[430px]
              rounded-[22px]
              border
              border-[#315373]
              bg-[#071d33]
              p-6
              shadow-[0_30px_90px_rgba(0,0,0,.6)]
            "
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div
              className="
                grid
                h-12
                w-12
                place-items-center
                rounded-full
                bg-[#ff641f]/15
                text-[#ff641f]
              "
            >
              <X
                size={21}
              />
            </div>

            <h3
              className="
                mt-4
                text-[20px]
                font-black
                text-white
              "
            >
              ¿Cancelar el análisis?
            </h3>

            <p
              className="
                mt-2
                text-[12px]
                font-semibold
                leading-6
                text-[#91a9c0]
              "
            >
              El procesamiento del video se detendrá y
              este análisis no generará resultados finales.
            </p>

            <div
              className="
                mt-6
                grid
                gap-2
                sm:grid-cols-2
              "
            >
              <button
                type="button"
                onClick={() =>
                  setShowCancelConfirm(
                    false
                  )
                }
                className="
                  min-h-[42px]
                  rounded-[9px]
                  border
                  border-[#31506d]
                  bg-[#0c2945]
                  px-4
                  text-[10px]
                  font-black
                  text-white
                  transition
                  hover:bg-[#123758]
                "
              >
                Continuar análisis
              </button>

              <button
                type="button"
                onClick={
                  handleCancelAnalysis
                }
                disabled={
                  cancelling
                }
                className="
                  inline-flex
                  min-h-[42px]
                  items-center
                  justify-center
                  gap-2
                  rounded-[9px]
                  bg-[#ff641f]
                  px-4
                  text-[10px]
                  font-black
                  text-white
                  transition
                  hover:bg-[#ff752f]
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                {cancelling ? (
                  <>
                    <Loader2
                      size={14}
                      className="
                        animate-spin
                      "
                    />

                    Cancelando...
                  </>
                ) : (
                  <>
                    <X
                      size={14}
                    />

                    Sí, cancelar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}