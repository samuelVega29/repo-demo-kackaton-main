import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  Navigate,
  useParams,
} from 'react-router-dom'

import robotSedes from '../assets/images/robot-sedes.png'
import robotSedes1 from '../assets/images/robot-sedes1.png'

import iconoAnalisis from '../assets/images/icono-analisis.png'
import iconoUbicacion from '../assets/images/icono-ubicacion.png'
import iconoDocumento from '../assets/images/icono-documento.png'

import iconoAnalisis1 from '../assets/images/icono-analisis1.png'
import iconoCamara from '../assets/images/icono-camara.png'
import iconoUbicacion1 from '../assets/images/icono-ubicacion1.png'

import { useApp } from '../context/AppProvider'
import ConfirmDialog from '../components/ui/ConfirmDialog'

/* =========================================================
   FORMULARIO INICIAL
========================================================= */

const initialForm = {
  name: '',
  city: '',
  camera_name: '',
  floor_width: 12,
  floor_depth: 8,
}

/* =========================================================
   FORMATEAR ERRORES DEL BACKEND
========================================================= */

function getErrorMessage(
  error,
  fallback
) {
  if (!error) {
    return fallback
  }

  if (
    typeof error ===
    'string'
  ) {
    return error
  }

  if (
    Array.isArray(
      error
    )
  ) {
    return error
      .map(
        (item) => {
          if (
            typeof item ===
            'string'
          ) {
            return item
          }

          if (
            item?.msg
          ) {
            const field =
              Array.isArray(
                item.loc
              )
                ? item.loc[
                    item.loc.length -
                      1
                  ]
                : ''

            return field
              ? `${field}: ${item.msg}`
              : item.msg
          }

          if (
            item?.message
          ) {
            return item.message
          }

          return ''
        }
      )
      .filter(Boolean)
      .join(' · ')
  }

  if (
    Array.isArray(
      error?.detail
    )
  ) {
    return getErrorMessage(
      error.detail,
      fallback
    )
  }

  if (
    typeof error?.detail ===
    'string'
  ) {
    return error.detail
  }

  if (
    typeof error?.message ===
    'string'
  ) {
    if (
      error.message !==
        '[object Object]' &&
      !error.message.includes(
        '[object Object],[object Object]'
      )
    ) {
      return error.message
    }
  }

  if (
    error?.response?.data
      ?.detail
  ) {
    return getErrorMessage(
      error.response.data
        .detail,
      fallback
    )
  }

  return fallback
}

/* =========================================================
   ESTADO DE LA SEDE
========================================================= */

function getSiteStatus(
  site
) {
  if (
    site?.status ===
    'inactive'
  ) {
    return {
      label: 'Inactiva',
      dot: 'bg-[#ff294d]',
    }
  }

  if (
    site?.status ===
      'setup' ||
    site?.status ===
      'configuring'
  ) {
    return {
      label:
        'En configuración',
      dot: 'bg-[#ffc928]',
    }
  }

  return {
    label: 'Activa',
    dot: 'bg-[#11d990]',
  }
}

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export default function SitePickerPage() {
  const {
    retailers,
    retailer,
    sites,
    selectSite,
    createSite,
    deleteSite,
    goHome,
    setRetailer,

    /* =====================================================
       CAMBIO:
       Limpia únicamente la sesión temporal del análisis.

       Esta función debe existir en AppProvider.jsx.
    ===================================================== */
    resetAnalysisSession,
  } = useApp()

  const {
    retailerId,
  } = useParams()

  const [
    showCreate,
    setShowCreate,
  ] = useState(false)

  const [
    creating,
    setCreating,
  ] = useState(false)

  const [
    deletingId,
    setDeletingId,
  ] = useState(null)

  const [
    siteToDelete,
    setSiteToDelete,
  ] = useState(null)

  const [
    error,
    setError,
  ] = useState('')

  const [
    search,
    setSearch,
  ] = useState('')

  const [
    page,
    setPage,
  ] = useState(0)

  const [
    form,
    setForm,
  ] = useState(
    initialForm
  )

  const mobileCarouselRef =
    useRef(null)

  const sitesPerPage =
    4

  const currentSites =
    useMemo(
      () =>
        Array.isArray(
          sites
        )
          ? sites
          : [],
      [sites]
    )

  /* =========================================================
     CARGAR EMPRESA
  ========================================================= */

  useEffect(() => {
    if (
      !retailer &&
      retailerId &&
      retailers?.length
    ) {
      const found =
        retailers.find(
          (item) =>
            String(
              item.id
            ) ===
            String(
              retailerId
            )
        )

      if (found) {
        setRetailer(
          found
        )
      }
    }
  }, [
    retailer,
    retailerId,
    retailers,
    setRetailer,
  ])

  /* =========================================================
     REINICIAR PAGINACIÓN
  ========================================================= */

  useEffect(() => {
    setPage(0)

    mobileCarouselRef
      .current
      ?.scrollTo({
        left: 0,
        behavior:
          'smooth',
      })
  }, [search])

  /* =========================================================
     FILTRAR SEDES
  ========================================================= */

  const filteredSites =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase()

      if (!term) {
        return currentSites
      }

      return currentSites.filter(
        (site) => {
          const searchable = `
            ${site?.name || ''}
            ${site?.city || ''}
          `.toLowerCase()

          return searchable.includes(
            term
          )
        }
      )
    }, [
      currentSites,
      search,
    ])

  /* =========================================================
     PAGINACIÓN
  ========================================================= */

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredSites.length /
          sitesPerPage
      )
    )

  useEffect(() => {
    if (
      page >
      totalPages - 1
    ) {
      setPage(
        Math.max(
          totalPages - 1,
          0
        )
      )
    }
  }, [
    page,
    totalPages,
  ])

  const visibleSites =
    filteredSites.slice(
      page *
        sitesPerPage,
      page *
        sitesPerPage +
        sitesPerPage
    )

  const previousPage =
    () => {
      setPage(
        (current) =>
          current === 0
            ? totalPages -
              1
            : current - 1
      )
    }

  const nextPage =
    () => {
      setPage(
        (current) =>
          current ===
          totalPages - 1
            ? 0
            : current + 1
      )
    }

  /* =========================================================
     CARRUSEL MÓVIL
  ========================================================= */

  const scrollMobileLeft =
    () => {
      mobileCarouselRef
        .current
        ?.scrollBy({
          left: -200,
          behavior:
            'smooth',
        })
    }

  const scrollMobileRight =
    () => {
      mobileCarouselRef
        .current
        ?.scrollBy({
          left: 200,
          behavior:
            'smooth',
        })
    }

  /* =========================================================
     MÉTRICAS
  ========================================================= */

  const totalCameras =
    useMemo(() => {
      return currentSites.reduce(
        (
          total,
          site
        ) => {
          const camera =
            site
              ?.configuration
              ?.camera

          return (
            total +
            (camera
              ? 1
              : 0)
          )
        },
        0
      )
    }, [currentSites])

  const totalAnalyses =
    useMemo(() => {
      return currentSites.reduce(
        (
          total,
          site
        ) => {
          return (
            total +
            Number(
              site
                ?.analysis_count ??
                site
                  ?.analyses_count ??
                site
                  ?.analysisCount ??
                0
            )
          )
        },
        0
      )
    }, [currentSites])

  /* =========================================================
     ABRIR / CERRAR CREAR SEDE
  ========================================================= */

  const toggleCreate =
    () => {
      setError('')

      setShowCreate(
        (current) => {
          if (current) {
            setForm(
              initialForm
            )
          }

          return !current
        }
      )
    }

  const closeCreate =
    () => {
      setShowCreate(
        false
      )

      setError('')

      setForm(
        initialForm
      )
    }

  /* =========================================================
     CAMBIAR CAMPOS
  ========================================================= */

  const changeForm =
    (
      field,
      value
    ) => {
      setForm(
        (current) => ({
          ...current,
          [field]:
            value,
        })
      )
    }

  /* =========================================================
     LIMPIAR SESIÓN TEMPORAL

     Esta función NO elimina:
     - cámara
     - calibración
     - góndolas
     - floor.outline
     - analysis_area guardado en la sede

     Solo elimina el análisis anterior.
  ========================================================= */

  const clearPreviousAnalysis =
    () => {
      if (
        typeof resetAnalysisSession ===
        'function'
      ) {
        resetAnalysisSession()
      }
    }

  /* =========================================================
     CREAR SEDE
  ========================================================= */

  const submit =
    async (
      event
    ) => {
      event.preventDefault()

      if (creating) {
        return
      }

      const name =
        form.name.trim()

      const city =
        form.city.trim()

      const cameraName =
        form.camera_name.trim()

      if (
        name.length < 2
      ) {
        setError(
          'Escribe un nombre válido para la sede.'
        )

        return
      }

      if (
        city.length < 2
      ) {
        setError(
          'Escribe una ciudad válida.'
        )

        return
      }

      if (
        cameraName.length <
        2
      ) {
        setError(
          'Escribe un nombre válido para la cámara.'
        )

        return
      }

      const payload = {
        name,
        city,

        camera_name:
          cameraName,

        floor_width:
          Number(
            form.floor_width
          ) || 12,

        floor_depth:
          Number(
            form.floor_depth
          ) || 8,
      }

      try {
        setCreating(
          true
        )

        setError('')

        /* =================================================
           CAMBIO IMPORTANTE

           Antes de crear una sede nueva eliminamos:
           video anterior, preview, metadata, job, etc.
        ================================================= */

        clearPreviousAnalysis()

        console.log(
          'Payload enviado para crear sede:',
          payload
        )

        await createSite(
          payload
        )

        setForm({
          ...initialForm,
        })

        setShowCreate(
          false
        )
      } catch (
        requestError
      ) {
        console.error(
          'Error creando sede:',
          requestError
        )

        setError(
          getErrorMessage(
            requestError,
            'No fue posible crear la sede. Intenta nuevamente.'
          )
        )
      } finally {
        setCreating(
          false
        )
      }
    }

  /* =========================================================
     ABRIR UNA SEDE

     IMPORTANTE:
     También limpiamos el análisis anterior cuando
     cambiamos de una sede a otra.
  ========================================================= */

  const openSelectedSite =
    (
      selectedSite
    ) => {
      if (
        !selectedSite
      ) {
        return
      }

      clearPreviousAnalysis()

      selectSite(
        selectedSite
      )
    }

  /* =========================================================
     ELIMINAR SEDE
  ========================================================= */

  const removeSite =
    (
      event,
      site
    ) => {
      event.preventDefault()
      event.stopPropagation()

      if (!site?.id) {
        setError(
          'No se encontró el identificador de la sede.'
        )

        return
      }

      if (
        deletingId !==
        null
      ) {
        return
      }

      setSiteToDelete(
        site
      )
    }

  const confirmRemoveSite =
    async () => {
      if (
        !siteToDelete
      ) {
        return
      }

      try {
        setError('')

        setDeletingId(
          siteToDelete.id
        )

        await deleteSite(
          siteToDelete
        )

        setSiteToDelete(
          null
        )
      } catch (
        requestError
      ) {
        console.error(
          'Error eliminando sede:',
          requestError
        )

        setError(
          getErrorMessage(
            requestError,
            'No fue posible eliminar la sede.'
          )
        )
      } finally {
        setDeletingId(
          null
        )
      }
    }

  /* =========================================================
     PROTEGER RUTA
  ========================================================= */

  if (!retailer) {
    return (
      <Navigate
        to="/empresas"
        replace
      />
    )
  }

  return (
    <section
      data-tour="sites-hero"
      className="
        relative
        min-h-[calc(100vh-72px)]
        overflow-hidden
        bg-[#02070d]
        text-white
      "
    >
      {/* FONDO */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          bg-[linear-gradient(180deg,#02060b_0%,#030911_30%,#061728_50%,#f7fbff_50%,#ffffff_100%)]
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          inset-x-0
          bottom-0
          top-1/2
          bg-[radial-gradient(circle_at_14%_12%,rgba(37,170,255,.10),transparent_24%),linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)]
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          left-1/2
          top-[190px]
          h-[520px]
          w-[1050px]
          -translate-x-1/2
          rounded-full
          bg-[#006dff]/10
          blur-[135px]
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -left-[160px]
          -top-[165px]
          h-[190px]
          w-[190px]
          rounded-full
          border-[12px]
          border-[#ff681e]
          shadow-[0_0_18px_rgba(255,104,30,.25)]

          max-sm:-left-[155px]
          max-sm:-top-[155px]
          max-sm:h-[175px]
          max-sm:w-[175px]
          max-sm:border-[9px]
        "
      />

      {/* CURVAS IZQUIERDAS */}

      <div
        className="
          pointer-events-none
          absolute
          -left-[515px]
          top-[330px]
          h-[900px]
          w-[900px]
          rounded-full
          border-[34px]
          border-[#087ee8]/18

          max-sm:-left-[475px]
          max-sm:top-[380px]
          max-sm:h-[720px]
          max-sm:w-[720px]
          max-sm:border-[24px]
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -left-[470px]
          top-[375px]
          h-[810px]
          w-[810px]
          rounded-full
          border-[2px]
          border-[#1596ff]/55
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -left-[565px]
          top-[450px]
          h-[980px]
          w-[980px]
          rounded-full
          border-[22px]
          border-[#ff5b12]/10
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -left-[520px]
          top-[495px]
          h-[890px]
          w-[890px]
          rounded-full
          border-[2px]
          border-[#ff681e]/55
        "
      />

      {/* CURVAS DERECHAS */}

      <div
        className="
          pointer-events-none
          absolute
          -right-[500px]
          top-[200px]
          h-[920px]
          w-[920px]
          rounded-full
          border-[36px]
          border-[#087ee8]/18
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -right-[455px]
          top-[245px]
          h-[830px]
          w-[830px]
          rounded-full
          border-[2px]
          border-[#158fff]/60
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -right-[570px]
          top-[420px]
          h-[990px]
          w-[990px]
          rounded-full
          border-[24px]
          border-[#ff5b12]/10
        "
      />

      <div
        className="
          pointer-events-none
          absolute
          -right-[525px]
          top-[465px]
          h-[900px]
          w-[900px]
          rounded-full
          border-[2px]
          border-[#ff681e]/60
        "
      />

      {/* PUNTOS */}

      <span
        className="
          pointer-events-none
          absolute
          left-[27%]
          top-[112px]
          h-[5px]
          w-[5px]
          rounded-full
          bg-[#25aaff]
          shadow-[0_0_8px_3px_rgba(37,170,255,.9)]
        "
      />

      <span
        className="
          pointer-events-none
          absolute
          right-[7%]
          top-[55px]
          h-[5px]
          w-[5px]
          rounded-full
          bg-[#ff681e]
          shadow-[0_0_8px_3px_rgba(255,104,30,.9)]
        "
      />

      {/* CONTENIDO */}

      <div
        className="
          relative
          z-10
          mx-auto
          w-full
          max-w-[1450px]
          px-3
          pb-5
          pt-2

          sm:px-7
          sm:pb-8
          sm:pt-5

          lg:px-9
        "
      >
        {/* VOLVER */}

        <button
          type="button"
          onClick={
            goHome
          }
          className="
            mb-1
            inline-flex
            items-center
            gap-2
            border-0
            bg-transparent
            p-0
            text-[9px]
            font-bold
            text-white/80
            transition
            hover:text-[#ff681e]

            sm:mb-4
            sm:text-[12px]
          "
        >
          <ArrowLeft
            size={12}
          />

          Empresas
        </button>

        {/* HERO */}

        <div
          className="
            relative
            grid
            grid-cols-[minmax(0,1.12fr)_minmax(125px,.88fr)]
            items-start
            gap-x-0
            gap-y-0

            min-[390px]:grid-cols-[minmax(0,1.1fr)_minmax(145px,.9fr)]

            sm:grid-cols-[minmax(0,1.1fr)_minmax(190px,.9fr)]
            sm:gap-x-3
            sm:gap-y-2

            lg:grid-cols-[365px_minmax(0,1fr)_290px]
            lg:gap-6
          "
        >
          {/* TEXTO */}

          <div
            className="
              relative
              z-20
              col-start-1
              row-start-1
              min-w-0
              pt-1

              lg:col-auto
              lg:row-auto
              lg:order-1
            "
          >
            <span
              className="
                mb-1
                block
                h-[2px]
                w-7
                rounded-full
                bg-[#ff681e]

                sm:mb-3
                sm:h-[3px]
                sm:w-9

                lg:w-10
              "
            />

            <div
              className="
                flex
                items-end
                gap-3
                sm:gap-4
              "
            >
              <span
                className="
                  block
                  text-[54px]
                  font-black
                  leading-[.78]
                  text-[#ff8b3a]

                  sm:text-[74px]
                  lg:text-[86px]
                "
              >
                02
              </span>

              <div
                className="
                  min-w-0
                  pb-1
                "
              >
                <p
                  className="
                    mb-1
                    text-[9px]
                    font-black
                    uppercase
                    tracking-[.24em]
                    text-[#9fb2c4]

                    sm:text-[11px]
                  "
                >
                  Paso 2
                </p>

                <h1
                  className="
                    text-[36px]
                    font-black
                    leading-[.86]
                    text-white

                    sm:text-[52px]
                    lg:text-[62px]
                  "
                >
                  Sedes
                </h1>
              </div>
            </div>

            <p
              className="
                mt-2
                max-w-[170px]
                text-[6px]
                font-semibold
                leading-[9px]
                text-[#aebfd0]

                min-[390px]:max-w-[195px]
                min-[390px]:text-[7px]
                min-[390px]:leading-[10px]

                sm:mt-4
                sm:max-w-[300px]
                sm:text-[11px]
                sm:leading-[17px]

                lg:mt-5
                lg:text-[12px]
                lg:leading-[19px]
              "
            >
              Selecciona la sede que vas a analizar, revisa
              su historial y reutiliza la configuración
              guardada para nuevos videos.
            </p>
          </div>

          {/* ROBOT */}

          <div
            className="
              relative
              z-10
              col-start-2
              row-start-1
              -mt-7
              ml-auto
              h-[140px]
              w-full
              max-w-[145px]

              min-[390px]:-mt-8
              min-[390px]:h-[150px]
              min-[390px]:max-w-[160px]

              sm:-mt-3
              sm:h-[190px]
              sm:max-w-[235px]

              lg:col-auto
              lg:row-auto
              lg:order-3
              lg:mt-0
              lg:h-[185px]
              lg:max-w-none
            "
          >
            <div className="pointer-events-none absolute left-1/2 top-[20px] h-[90px] w-[120px] -translate-x-1/2 rounded-full bg-[#006cff]/20 blur-[30px] sm:h-[135px] sm:w-[180px] lg:top-0 lg:h-[190px] lg:w-[230px] lg:blur-[50px]" />

            <div className="pointer-events-none absolute left-1/2 top-[22px] h-[85px] w-[145px] -translate-x-1/2 -rotate-[15deg] rounded-[50%] border border-[#168fff]/40 sm:h-[120px] sm:w-[215px] lg:top-[15px] lg:h-[150px] lg:w-[260px]" />

            <div className="pointer-events-none absolute left-1/2 top-[27px] h-[82px] w-[140px] -translate-x-1/2 rotate-[17deg] rounded-[50%] border border-[#ff681e]/35 sm:h-[125px] sm:w-[205px] lg:top-[22px] lg:h-[155px] lg:w-[250px]" />

            <img
              src={
                iconoAnalisis
              }
              alt=""
              className="pointer-events-none absolute left-[-2px] top-[12px] z-20 h-[27px] w-[27px] object-contain sm:left-[8px] sm:top-[12px] sm:h-[42px] sm:w-[42px] lg:left-[5px] lg:top-[-12px] lg:h-[56px] lg:w-[56px]"
            />

            <img
              src={
                iconoUbicacion
              }
              alt=""
              className="pointer-events-none absolute right-[-3px] top-[31px] z-20 h-[28px] w-[28px] object-contain sm:right-[5px] sm:top-[48px] sm:h-[43px] sm:w-[43px] lg:right-0 lg:top-[38px] lg:h-[58px] lg:w-[58px]"
            />

            <img
              src={
                iconoDocumento
              }
              alt=""
              className="pointer-events-none absolute bottom-[17px] right-[6px] z-20 h-[26px] w-[26px] object-contain sm:bottom-[16px] sm:right-[15px] sm:h-[38px] sm:w-[38px] lg:bottom-auto lg:right-[12px] lg:top-[105px] lg:h-[56px] lg:w-[56px]"
            />

            <img
              src={
                robotSedes
              }
              alt="Asistente Scapder"
              className="pointer-events-none absolute bottom-[11px] left-1/2 z-10 h-[125px] w-[125px] -translate-x-1/2 object-contain object-bottom min-[390px]:h-[135px] min-[390px]:w-[135px] sm:h-[175px] sm:w-[175px] lg:bottom-auto lg:top-[-23px] lg:h-[205px] lg:w-[205px]"
            />
          </div>

          {/* MÉTRICAS */}

          <div
            className="
              relative
              col-span-2
              row-start-2
              -mt-7
              overflow-hidden
              rounded-[22px]
              border
              border-white/70
              bg-white/95
              p-2

              shadow-[0_0_0_1px_rgba(38,169,255,.55),0_0_22px_rgba(38,169,255,.80),0_26px_70px_-34px_rgba(0,91,180,.75)]
              backdrop-blur

              min-[390px]:-mt-6

              sm:-mt-1
              sm:rounded-[26px]
              sm:p-3

              lg:col-auto
              lg:row-auto
              lg:order-2
              lg:mt-2
              lg:rounded-[28px]
            "
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(38,169,255,.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,.98),rgba(239,248,255,.96))]" />

            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white" />

            <div className="relative grid grid-cols-3 gap-1.5 sm:gap-2.5">
              <TopMetric
                image={
                  iconoUbicacion1
                }
                value={
                  currentSites.length
                }
                label="Sedes registradas"
              />

              <TopMetric
                image={
                  iconoCamara
                }
                value={
                  totalCameras
                }
                label="Cámaras en total"
              />

              <TopMetric
                image={
                  iconoAnalisis1
                }
                value={
                  totalAnalyses
                }
                label="Análisis realizados"
              />
            </div>
          </div>
        </div>

        {/* BUSCADOR */}

        <div
          data-tour="sites-search"
          className="
            relative
            z-30
            mt-2
            grid
            grid-cols-1
            gap-1.5

            sm:mt-4
            sm:gap-2.5

            lg:grid-cols-[520px_210px_1fr_205px]
            lg:items-center
            lg:gap-3
          "
        >
          <label className="flex h-[38px] items-center gap-2 rounded-[12px] border border-[#1e4b6f] bg-[#061725]/95 px-3 transition focus-within:border-[#168aff] sm:h-[50px] sm:px-4 lg:h-[52px] lg:px-5">
            <Search
              size={15}
              className="shrink-0 text-white"
            />

            <input
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="Buscar sede..."
              className="min-w-0 flex-1 border-0 bg-transparent text-[9px] text-white outline-none placeholder:text-[#748aa0] min-[390px]:text-[10px] sm:text-[12px] lg:text-[13px]"
            />
          </label>

          <button
            type="button"
            className="inline-flex h-[38px] items-center justify-center gap-3 rounded-[12px] border border-[#1e4b6f] bg-[#061725]/95 text-[11px] font-black text-white transition hover:border-[#ff681e] sm:h-[48px] sm:text-[12px] lg:h-[52px]"
          >
            <SlidersHorizontal
              size={14}
            />

            Filtrar

            <ChevronDown
              size={13}
            />
          </button>

          <div className="hidden lg:block" />

          <button
            type="button"
            onClick={
              toggleCreate
            }
            data-tour="sites-create"
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(90deg,#ff5510,#ff7022)] text-[11px] font-black text-white shadow-[0_10px_24px_-15px_rgba(255,91,18,.85)] transition hover:brightness-110 sm:h-[52px] sm:text-[12px] lg:w-[205px] lg:rounded-[22px]"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[#ff5b12] sm:h-7 sm:w-7">
              <Plus
                size={14}
                strokeWidth={
                  3
                }
              />
            </span>

            {showCreate
              ? 'Cancelar'
              : 'Crear sede'}
          </button>
        </div>

        {/* ERROR GENERAL */}

        {error &&
          !showCreate && (
            <div className="relative z-30 mt-3 rounded-[12px] border border-[#ff594d]/30 bg-[#ff594d]/10 px-4 py-3 text-[12px] font-bold text-[#ff998f]">
              {error}
            </div>
          )}

        {/* FORMULARIO MÓVIL */}

        {showCreate && (
          <form
            onSubmit={
              submit
            }
            className="relative z-30 mt-3 grid gap-3 rounded-[18px] border border-[#17486e] bg-[#061725]/95 p-3 md:grid-cols-2 md:p-5 lg:hidden"
          >
            <FormField
              label="Nombre"
              placeholder="Ej. Sede Centro"
              value={
                form.name
              }
              onChange={(
                value
              ) =>
                changeForm(
                  'name',
                  value
                )
              }
            />

            <FormField
              label="Ciudad"
              placeholder="Ej. Bogotá"
              value={
                form.city
              }
              onChange={(
                value
              ) =>
                changeForm(
                  'city',
                  value
                )
              }
            />

            <FormField
              label="Cámara"
              placeholder="Ej. Cámara principal"
              value={
                form.camera_name
              }
              onChange={(
                value
              ) =>
                changeForm(
                  'camera_name',
                  value
                )
              }
            />

            <button
              disabled={
                creating
              }
              type="submit"
              className="min-h-[46px] rounded-[14px] bg-[#ff681e] font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating
                ? 'Creando...'
                : 'Crear sede'}
            </button>

            {error && (
              <p className="text-xs font-bold text-[#ff8968] md:col-span-2">
                {error}
              </p>
            )}
          </form>
        )}

        {/* TARJETAS */}

        <div className="relative z-20 mt-2 sm:mt-5" data-tour="sites-list">
          {filteredSites.length ? (
            <>
              {/* MÓVIL */}

              <div className="md:hidden">
                <div
                  ref={
                    mobileCarouselRef
                  }
                  className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 py-3 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {filteredSites.map(
                    (
                      site,
                      originalIndex
                    ) => {
                      const camera =
                        site
                          ?.configuration
                          ?.camera ??
                        {}

                      return (
                        <SiteCard
                          key={
                            site.id
                          }
                          site={
                            site
                          }
                          originalIndex={
                            originalIndex
                          }
                          camera={
                            camera
                          }
                          status={getSiteStatus(
                            site
                          )}
                          selectSite={
                            openSelectedSite
                          }
                          removeSite={
                            removeSite
                          }
                          deleting={
                            String(
                              deletingId
                            ) ===
                            String(
                              site.id
                            )
                          }
                          mobile
                        />
                      )
                    }
                  )}
                </div>

                {filteredSites.length >
                  1 && (
                  <div className="mt-1 flex items-center justify-between px-1">
                    <button
                      type="button"
                      onClick={
                        scrollMobileLeft
                      }
                      aria-label="Anterior"
                      className="grid h-8 w-8 place-items-center rounded-full border border-[#214d6f] bg-[#061725]"
                    >
                      <ChevronLeft
                        size={
                          17
                        }
                      />
                    </button>

                    <span className="h-[5px] w-7 rounded-full bg-[#ff681e]" />

                    <button
                      type="button"
                      onClick={
                        scrollMobileRight
                      }
                      aria-label="Siguiente"
                      className="grid h-8 w-8 place-items-center rounded-full border border-[#214d6f] bg-[#061725]"
                    >
                      <ChevronRight
                        size={
                          17
                        }
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* DESKTOP */}

              <div className="hidden md:block">
                {filteredSites.length >
                  sitesPerPage && (
                  <button
                    type="button"
                    onClick={
                      previousPage
                    }
                    aria-label="Página anterior"
                    className="absolute -left-7 top-[45%] z-30 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-[#204f74] bg-[#061725] transition hover:bg-[#ff681e] lg:grid"
                  >
                    <ChevronLeft
                      size={
                        23
                      }
                    />
                  </button>
                )}

                <div className="grid gap-5 py-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                  {visibleSites.map(
                    (
                      site
                    ) => {
                      const originalIndex =
                        filteredSites.indexOf(
                          site
                        )

                      const camera =
                        site
                          ?.configuration
                          ?.camera ??
                        {}

                      return (
                        <SiteCard
                          key={
                            site.id
                          }
                          site={
                            site
                          }
                          originalIndex={
                            originalIndex
                          }
                          camera={
                            camera
                          }
                          status={getSiteStatus(
                            site
                          )}
                          selectSite={
                            openSelectedSite
                          }
                          removeSite={
                            removeSite
                          }
                          deleting={
                            String(
                              deletingId
                            ) ===
                            String(
                              site.id
                            )
                          }
                        />
                      )
                    }
                  )}
                </div>

                {filteredSites.length >
                  sitesPerPage && (
                  <button
                    type="button"
                    onClick={
                      nextPage
                    }
                    aria-label="Página siguiente"
                    className="absolute -right-7 top-[45%] z-30 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-[#204f74] bg-[#061725] transition hover:bg-[#ff681e] lg:grid"
                  >
                    <ChevronRight
                      size={
                        23
                      }
                    />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#235077] bg-[#061725]/95 p-8 text-center">
              <Building2
                size={38}
                className="mx-auto text-[#ff681e]"
              />

              <h2 className="mt-4 text-xl font-black">
                No encontramos
                sedes
              </h2>

              <p className="mt-2 text-sm text-[#96aabd]">
                {search
                  ? 'No hay sedes que coincidan con la búsqueda.'
                  : 'Todavía no hay sedes registradas.'}
              </p>
            </div>
          )}
        </div>

        {/* PAGINACIÓN */}

        {totalPages >
          1 && (
          <div className="relative z-20 mt-5 hidden justify-center gap-3 md:flex">
            {Array.from({
              length:
                totalPages,
            }).map(
              (
                _,
                index
              ) => (
                <button
                  key={
                    index
                  }
                  type="button"
                  onClick={() =>
                    setPage(
                      index
                    )
                  }
                  aria-label={`Página ${
                    index +
                    1
                  }`}
                  className={`
                    h-2
                    rounded-full
                    transition-all

                    ${
                      page ===
                      index
                        ? 'w-7 bg-[#ff681e]'
                        : 'w-2 bg-[#3c5b77]'
                    }
                  `}
                />
              )
            )}
          </div>
        )}

        <div className="h-4 sm:h-6" />
      </div>

      {/* MODAL CREAR SEDE */}

      {showCreate && (
        <div className="fixed inset-0 z-[100] hidden items-center justify-center bg-[#01060c]/85 px-6 py-6 backdrop-blur-[10px] lg:flex">
          <button
            type="button"
            aria-label="Cerrar modal"
            onClick={
              closeCreate
            }
            className="absolute inset-0 z-0 cursor-default"
          />

          <div className="relative z-10 grid w-full max-w-[900px] grid-cols-[42%_58%] overflow-hidden rounded-[26px] border border-[#16689f] bg-[#03111f] shadow-[0_35px_90px_-25px_rgba(0,0,0,.95)]">
            {/* ROBOT */}

            <div className="relative min-h-[500px] overflow-hidden border-r border-[#123b5d] bg-[radial-gradient(circle_at_50%_60%,rgba(0,102,255,.17),transparent_52%)]">
              <div className="absolute left-1/2 top-[35px] z-30 w-[255px] -translate-x-1/2 -rotate-[3deg] rounded-[18px] border border-[#168fff] bg-[#06192b]/95 px-5 py-3 text-center shadow-[0_12px_35px_-18px_rgba(0,112,255,.8)]">
                <p className="text-[15px] font-black leading-tight text-white">
                  ¡Crea una nueva
                  sede
                </p>

                <p className="mt-1 text-[15px] font-black leading-tight text-[#ff681e]">
                  y sigue
                  creciendo!
                </p>
              </div>

              <div className="pointer-events-none absolute bottom-[35px] left-1/2 h-[290px] w-[290px] -translate-x-1/2 rounded-full bg-[#0074ff]/10 blur-[45px]" />

              <div className="pointer-events-none absolute bottom-[55px] left-1/2 h-[285px] w-[285px] -translate-x-1/2 rounded-full border border-[#168fff]/30" />

              <div className="pointer-events-none absolute bottom-[45px] left-1/2 h-[260px] w-[260px] -translate-x-1/2 rotate-[17deg] rounded-full border border-[#ff681e]/30" />

              <img
                src={
                  iconoAnalisis
                }
                alt=""
                className="pointer-events-none absolute left-[28px] top-[190px] z-30 h-[58px] w-[58px] object-contain"
              />

              <img
                src={
                  iconoUbicacion
                }
                alt=""
                className="pointer-events-none absolute right-[25px] top-[175px] z-30 h-[62px] w-[62px] object-contain"
              />

              <img
                src={
                  iconoDocumento
                }
                alt=""
                className="pointer-events-none absolute bottom-[48px] right-[30px] z-30 h-[58px] w-[58px] object-contain"
              />

              <img
                src={
                  robotSedes1
                }
                alt="Asistente para crear sede"
                className="pointer-events-none absolute bottom-[-12px] left-1/2 z-20 h-[340px] w-[340px] -translate-x-1/2 object-contain object-bottom"
              />
            </div>

            {/* FORMULARIO */}

            <form
              onSubmit={
                submit
              }
              className="relative z-20 flex min-h-[500px] flex-col justify-center px-10 py-8"
            >
              <button
                type="button"
                aria-label="Cerrar"
                onClick={
                  closeCreate
                }
                className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[21px] text-white transition hover:border-[#ff681e] hover:text-[#ff681e]"
              >
                ×
              </button>

              <span className="mb-3 block h-[3px] w-10 rounded-full bg-[#ff681e]" />

              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#ff681e]">
                Nueva sede
              </p>

              <h2 className="text-[31px] font-black leading-[.98] tracking-[-0.04em] text-white">
                Crea un nuevo

                <span className="block text-[#ff681e]">
                  espacio
                  Scapder.
                </span>
              </h2>

              <p className="mt-3 max-w-[450px] text-[12px] leading-5 text-[#9fb2c4]">
                Registra la
                información básica
                de la sede para
                comenzar a
                configurarla.
              </p>

              <div className="mt-6 grid gap-4">
                <CompactDesktopFormField
                  label="Nombre"
                  placeholder="Ej. Sede Centro"
                  value={
                    form.name
                  }
                  icon={
                    <Building2
                      size={
                        18
                      }
                    />
                  }
                  onChange={(
                    value
                  ) =>
                    changeForm(
                      'name',
                      value
                    )
                  }
                />

                <CompactDesktopFormField
                  label="Ciudad"
                  placeholder="Ej. Bogotá"
                  value={
                    form.city
                  }
                  icon={
                    <MapPin
                      size={
                        18
                      }
                    />
                  }
                  onChange={(
                    value
                  ) =>
                    changeForm(
                      'city',
                      value
                    )
                  }
                />

                <CompactDesktopFormField
                  label="Cámara"
                  placeholder="Ej. Cámara principal"
                  value={
                    form.camera_name
                  }
                  icon={
                    <Camera
                      size={
                        18
                      }
                    />
                  }
                  onChange={(
                    value
                  ) =>
                    changeForm(
                      'camera_name',
                      value
                    )
                  }
                />
              </div>

              {error && (
                <div className="mt-4 rounded-[12px] border border-[#ff654d]/30 bg-[#ff654d]/10 px-4 py-3 text-[11px] font-bold leading-4 text-[#ff9b8f]">
                  {error}
                </div>
              )}

              <div className="mt-6 grid grid-cols-[1fr_1.15fr] gap-3">
                <button
                  type="button"
                  onClick={
                    closeCreate
                  }
                  className="h-[48px] rounded-[14px] border border-[#1d557e] bg-[#05182a] text-[13px] font-black text-white transition hover:border-[#168fff]"
                >
                  Cancelar
                </button>

                <button
                  disabled={
                    creating
                  }
                  type="submit"
                  className="inline-flex h-[48px] items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(90deg,#ff5510,#ff7423)] text-[13px] font-black text-white shadow-[0_15px_30px_-14px_rgba(255,91,18,.8)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating
                    ? 'Creando...'
                    : 'Crear sede'}

                  {!creating && (
                    <ArrowRight
                      size={
                        16
                      }
                    />
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(
          siteToDelete
        )}
        title="Eliminar sede"
        message={`Se eliminara "${
          siteToDelete
            ?.name ||
          'esta sede'
        }" junto con su configuracion y analisis asociados.`}
        confirmLabel="Eliminar sede"
        loading={
          deletingId ===
          siteToDelete?.id
        }
        onCancel={() =>
          setSiteToDelete(
            null
          )
        }
        onConfirm={
          confirmRemoveSite
        }
      />
    </section>
  )
}

/* =========================================================
   TARJETA
========================================================= */

function SiteCard({
  site,
  originalIndex,
  camera,
  status,
  selectSite,
  removeSite,
  deleting,
  mobile = false,
}) {
  const hasImage =
    typeof site?.image_url ===
      'string' &&
    site.image_url
      .trim()
      .length > 0

  const openSite =
    () => {
      if (
        !deleting
      ) {
        selectSite(
          site
        )
      }
    }

  const handleImageKeyDown =
    (
      event
    ) => {
      if (
        event.key ===
          'Enter' ||
        event.key ===
          ' '
      ) {
        event.preventDefault()

        openSite()
      }
    }

  return (
    <article
      className={`
        group
        relative
        shrink-0
        overflow-hidden
        border
        border-[#25aaff]
        bg-white
        shadow-[0_0_8px_rgba(37,170,255,.75),0_0_18px_rgba(0,119,255,.38),0_20px_42px_-24px_rgba(0,0,0,.65)]
        transition
        duration-300

        ${
          mobile
            ? 'w-[47vw] min-w-[155px] max-w-[190px] snap-start rounded-[18px_18px_32px_18px]'
            : 'w-auto rounded-[24px_24px_42px_20px]'
        }

        md:hover:-translate-y-1
        md:hover:shadow-[0_0_12px_rgba(37,170,255,.95),0_0_28px_rgba(0,119,255,.55)]
      `}
    >
      {/* FOTO */}

      <div
        role="button"
        tabIndex={0}
        aria-label={`Abrir ${
          site.name ||
          'sede'
        }`}
        onClick={
          openSite
        }
        onKeyDown={
          handleImageKeyDown
        }
        className={`
          relative
          cursor-pointer
          overflow-hidden
          bg-[#eaf2f8]
          outline-none
          transition

          focus-visible:ring-4
          focus-visible:ring-[#25aaff]/50

          ${
            mobile
              ? 'h-[105px] rounded-br-[30px]'
              : 'h-[185px] rounded-br-[52px] sm:h-[195px]'
          }
        `}
      >
        {hasImage ? (
          <img
            src={
              site.image_url
            }
            alt={
              site.name ||
              'Sede'
            }
            className="
              h-full
              w-full
              object-cover
              transition
              duration-700
              group-hover:scale-105
            "
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#eef5fa_0%,#dceaf4_50%,#c8deed_100%)]">
            <div className="absolute bottom-0 left-0 right-0 h-[58%] bg-[linear-gradient(180deg,#9bbacf_0%,#6389a4_100%)]" />

            <div className="absolute bottom-[17%] left-1/2 h-[48%] w-[76%] -translate-x-1/2 rounded-t-[6px] bg-[#e9edf0] shadow-[0_10px_25px_rgba(0,0,0,.15)]">
              <div className="grid h-full grid-cols-4 gap-[5%] px-[8%] py-[9%]">
                {Array.from({
                  length: 8,
                }).map(
                  (
                    _,
                    index
                  ) => (
                    <span
                      key={
                        index
                      }
                      className="bg-[#5b8099]"
                    />
                  )
                )}
              </div>
            </div>

            <div className="absolute bottom-[17%] left-1/2 h-[23%] w-[18%] -translate-x-1/2 bg-[#375e79]" />

            <Building2
              size={
                mobile
                  ? 23
                  : 34
              }
              className="absolute bottom-3 right-3 text-white/70"
            />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

        {/* NÚMERO */}

        <span
          className={`
            pointer-events-none
            absolute
            grid
            place-items-center
            bg-white
            font-black
            text-[#ff5b12]
            shadow-lg

            ${
              mobile
                ? 'left-2 top-2 h-7 min-w-[32px] rounded-[8px] px-2 text-[10px]'
                : 'left-4 top-4 h-10 min-w-[48px] rounded-[11px] px-3 text-[17px]'
            }
          `}
        >
          {String(
            originalIndex +
              1
          ).padStart(
            2,
            '0'
          )}
        </span>

        {/* ESTADO */}

        <span
          className={`
            pointer-events-none
            absolute
            inline-flex
            items-center
            rounded-full
            bg-[#071b2d]/95
            font-black
            text-white
            shadow-lg

            ${
              mobile
                ? 'right-2 top-2 gap-1 px-2 py-1.5 text-[6px]'
                : 'right-4 top-4 gap-2 px-4 py-2 text-[10px]'
            }
          `}
        >
          <span
            className={`
              rounded-full
              ${status.dot}

              ${
                mobile
                  ? 'h-1.5 w-1.5'
                  : 'h-2.5 w-2.5'
              }
            `}
          />

          {status.label}
        </span>

        {/* ELIMINAR */}

        <button
          type="button"
          disabled={
            deleting
          }
          onClick={(
            event
          ) =>
            removeSite(
              event,
              site
            )
          }
          aria-label={`Eliminar ${
            site.name ||
            'sede'
          }`}
          className={`
            absolute
            z-30
            grid
            place-items-center
            rounded-full
            bg-white
            text-[#ff5b12]
            shadow-lg
            transition
            hover:bg-[#ff5b12]
            hover:text-white
            disabled:cursor-not-allowed
            disabled:opacity-60

            ${
              mobile
                ? 'bottom-3 right-3 h-7 w-7'
                : 'bottom-4 right-4 h-9 w-9 opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
            }
          `}
        >
          {deleting ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#ff5b12] border-t-transparent" />
          ) : (
            <Trash2
              size={
                mobile
                  ? 11
                  : 15
              }
            />
          )}
        </button>
      </div>

      {/* INFORMACIÓN */}

      <div
        className={`
          relative
          bg-white

          ${
            mobile
              ? 'min-h-[110px] px-3 pb-3 pt-3'
              : 'min-h-[145px] px-5 pb-5 pt-4'
          }
        `}
      >
        <span
          className={`
            absolute
            left-1/2
            top-0
            -translate-x-1/2
            rounded-full
            bg-[#ff681e]

            ${
              mobile
                ? 'h-[3px] w-8'
                : 'h-[4px] w-12'
            }
          `}
        />

        <h2
          className={`
            truncate
            font-black
            text-[#111111]

            ${
              mobile
                ? 'text-[10px]'
                : 'text-[17px]'
            }
          `}
        >
          {site.name ||
            'Sede sin nombre'}
        </h2>

        <p
          className={`
            flex
            items-center
            font-semibold
            text-[#191919]

            ${
              mobile
                ? 'mt-1 gap-1 text-[7px]'
                : 'mt-2 gap-2 text-[12px]'
            }
          `}
        >
          <MapPin
            size={
              mobile
                ? 9
                : 15
            }
            className="shrink-0 text-[#ff681e]"
            strokeWidth={
              2.8
            }
          />

          {site.city ||
            'Sin ciudad'}
        </p>

        <p
          className={`
            flex
            items-center
            font-semibold
            text-[#191919]

            ${
              mobile
                ? 'mt-1 gap-1 text-[7px]'
                : 'mt-2 gap-2 text-[12px]'
            }
          `}
        >
          <Camera
            size={
              mobile
                ? 9
                : 15
            }
            className="shrink-0 text-[#ff681e]"
            strokeWidth={
              2.8
            }
          />

          {camera?.name
            ? 1
            : 0}{' '}

          {camera?.name
            ? 'cámara'
            : 'cámaras'}
        </p>

        <button
          type="button"
          onClick={
            openSite
          }
          className={`
            mt-4
            border-0
            bg-transparent
            p-0
            font-black
            text-[#111111]
            transition
            hover:text-[#ff681e]

            ${
              mobile
                ? 'mt-2 text-[7px]'
                : 'text-[12px]'
            }
          `}
        >
          Ver sede
        </button>
      </div>
    </article>
  )
}

/* =========================================================
   MÉTRICAS
========================================================= */

function TopMetric({
  image,
  value,
  label,
}) {
  return (
    <div className="flex min-h-[58px] min-w-0 items-center justify-center gap-2 rounded-[16px] border border-[#d8ebfa] bg-white px-2 shadow-[inset_0_1px_0_rgba(255,255,255,.95),0_14px_26px_-22px_rgba(0,73,145,.55)] sm:min-h-[78px] sm:gap-3 sm:rounded-[20px] sm:px-3 lg:min-h-[82px] lg:gap-4 lg:px-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#eff8ff,#ffffff)] shadow-[0_10px_24px_-18px_rgba(0,112,255,.85)] min-[390px]:h-10 min-[390px]:w-10 sm:h-[52px] sm:w-[52px] lg:h-[62px] lg:w-[62px]">
        <img
          src={
            image
          }
          alt=""
          className="h-[82%] w-[82%] object-contain drop-shadow-[0_7px_10px_rgba(0,68,130,.18)]"
        />
      </div>

      <div className="min-w-0">
        <strong className="block text-[18px] font-black leading-none text-[#061327] min-[390px]:text-[20px] sm:text-[28px] lg:text-[32px]">
          {value}
        </strong>

        <span className="mt-1 block max-w-[56px] text-[5.5px] font-black leading-[7px] text-[#10243a] min-[390px]:max-w-[65px] min-[390px]:text-[6px] sm:max-w-[90px] sm:text-[8px] sm:leading-[10px] lg:max-w-none lg:whitespace-nowrap lg:text-[9px]">
          {label}
        </span>
      </div>
    </div>
  )
}

/* =========================================================
   CAMPO MÓVIL
========================================================= */

function FormField({
  label,
  placeholder,
  value,
  onChange,
}) {
  return (
    <label className="grid gap-2 text-xs font-bold text-[#b9cad9]">
      {label}

      <input
        required
        minLength={
          2
        }
        value={
          value
        }
        placeholder={
          placeholder
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .value
          )
        }
        className="min-h-[44px] rounded-[13px] border border-[#1d4b70] bg-[#03111e] px-4 text-sm text-white outline-none transition placeholder:text-[#60798e] focus:border-[#ff681e] focus:ring-4 focus:ring-[#ff681e]/10"
      />
    </label>
  )
}

/* =========================================================
   CAMPO MODAL
========================================================= */

function CompactDesktopFormField({
  label,
  placeholder,
  value,
  icon,
  onChange,
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black text-[#dce7f1]">
        {label}
      </span>

      <div className="flex h-[50px] items-center gap-3 rounded-[14px] border border-[#18557f] bg-[#031321] px-4 transition focus-within:border-[#168fff] focus-within:shadow-[0_0_0_3px_rgba(0,112,255,.08)]">
        <span className="shrink-0 text-[#ff681e]">
          {icon}
        </span>

        <input
          required
          minLength={
            2
          }
          value={
            value
          }
          placeholder={
            placeholder
          }
          onChange={(
            event
          ) =>
            onChange(
              event.target
                .value
            )
          }
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold text-white outline-none placeholder:text-[#667f95]"
        />
      </div>
    </label>
  )
}
