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

/* Iconos alrededor del robot */
import iconoAnalisis from '../assets/images/icono-analisis.png'
import iconoUbicacion from '../assets/images/icono-ubicacion.png'
import iconoDocumento from '../assets/images/icono-documento.png'

/* Iconos de las métricas */
import iconoAnalisis1 from '../assets/images/icono-analisis1.png'
import iconoCamara from '../assets/images/icono-camara.png'
import iconoUbicacion1 from '../assets/images/icono-ubicacion1.png'

import { useApp } from '../context/AppProvider'

/* =========================================================
   IMÁGENES DE LAS SEDES
========================================================= */

const siteImagePool = [
  'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1000&q=88',
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1000&q=88',
  'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1000&q=88',
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1000&q=88',
]

function getSiteImage(site, index) {
  if (site.image_url) {
    return site.image_url
  }

  const source = `${site.name || ''} ${site.city || ''}`.toLowerCase()

  if (source.includes('centro')) {
    return siteImagePool[0]
  }

  if (
    source.includes('norte') ||
    source.includes('exito') ||
    source.includes('éxito')
  ) {
    return siteImagePool[1]
  }

  if (
    source.includes('sur') ||
    source.includes('carulla')
  ) {
    return siteImagePool[2]
  }

  return siteImagePool[index % siteImagePool.length]
}

/* =========================================================
   ESTADO DE LAS SEDES
========================================================= */

function getSiteStatus(site) {
  if (site.status === 'inactive') {
    return {
      label: 'Inactiva',
      dot: 'bg-[#ff294d]',
    }
  }

  if (
    site.status === 'setup' ||
    site.status === 'configuring'
  ) {
    return {
      label: 'En configuración',
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
  } = useApp()

  const { retailerId } = useParams()

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const mobileCarouselRef = useRef(null)

  const [form, setForm] = useState({
    name: '',
    city: '',
    camera_name: 'Camara principal',
  })

  const sitesPerPage = 4

  /* =========================================================
     CARGAR EMPRESA
  ========================================================= */

  useEffect(() => {
    if (!retailer && retailerId && retailers.length) {
      const found = retailers.find(
        (item) => String(item.id) === String(retailerId)
      )

      if (found) {
        setRetailer(found)
      }
    }
  }, [
    retailer,
    retailerId,
    retailers,
    setRetailer,
  ])

  useEffect(() => {
    setPage(0)

    mobileCarouselRef.current?.scrollTo({
      left: 0,
      behavior: 'smooth',
    })
  }, [search])

  /* =========================================================
     FILTRAR
  ========================================================= */

  const filteredSites = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) {
      return sites
    }

    return sites.filter((site) => {
      const searchable = `
        ${site.name || ''}
        ${site.city || ''}
      `.toLowerCase()

      return searchable.includes(term)
    })
  }, [sites, search])

  /* =========================================================
     PAGINACIÓN
  ========================================================= */

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSites.length / sitesPerPage)
  )

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(totalPages - 1, 0))
    }
  }, [page, totalPages])

  const visibleSites = filteredSites.slice(
    page * sitesPerPage,
    page * sitesPerPage + sitesPerPage
  )

  const previousPage = () => {
    setPage((current) =>
      current === 0
        ? totalPages - 1
        : current - 1
    )
  }

  const nextPage = () => {
    setPage((current) =>
      current === totalPages - 1
        ? 0
        : current + 1
    )
  }

  /* =========================================================
     CARRUSEL MÓVIL
  ========================================================= */

  const scrollMobileLeft = () => {
    mobileCarouselRef.current?.scrollBy({
      left: -200,
      behavior: 'smooth',
    })
  }

  const scrollMobileRight = () => {
    mobileCarouselRef.current?.scrollBy({
      left: 200,
      behavior: 'smooth',
    })
  }

  /* =========================================================
     MÉTRICAS
  ========================================================= */

  const totalCameras = sites.reduce(
    (total, site) => {
      const configuration = site.configuration ?? {}

      return total + (configuration.camera ? 1 : 0)
    },
    0
  )

  const totalAnalyses = sites.reduce(
    (total, site) =>
      total +
      Number(
        site.analysis_count ??
          site.analyses_count ??
          site.analysisCount ??
          0
      ),
    0
  )

  /* =========================================================
     CREAR SEDE
  ========================================================= */

  const submit = async (event) => {
    event.preventDefault()

    setCreating(true)
    setError('')

    try {
      await createSite(form)

      setForm({
        name: '',
        city: '',
        camera_name: 'Camara principal',
      })

      setShowCreate(false)
    } catch (requestError) {
      setError(
        requestError.message ||
          'No fue posible crear la sede.'
      )
    } finally {
      setCreating(false)
    }
  }

  /* =========================================================
     ELIMINAR SEDE
  ========================================================= */

  const removeSite = async (event, site) => {
    event.stopPropagation()

    const confirmation = window.confirm(
      `¿Eliminar la sede ${site.name} con sus análisis?`
    )

    if (!confirmation) return

    try {
      await deleteSite(site)
    } catch (requestError) {
      setError(
        requestError.message ||
          'No fue posible eliminar la sede.'
      )
    }
  }

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
      className="
        relative
        min-h-[calc(100vh-72px)]
        overflow-hidden
        bg-[#02070d]
        text-white
      "
    >
      {/* =====================================================
          FONDO
      ===================================================== */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          bg-[linear-gradient(180deg,#02060b_0%,#030911_22%,#04101b_40%,#061728_62%,#061a2e_78%,#030d18_100%)]
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

      {/* ESQUINA NARANJA */}

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

          max-sm:-left-[435px]
          max-sm:top-[415px]
          max-sm:h-[650px]
          max-sm:w-[650px]
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

      {/* =====================================================
          CONTENIDO
      ===================================================== */}

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
          onClick={goHome}
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
          <ArrowLeft size={12} />
          Empresas
        </button>

        {/* =====================================================
            HERO
        ===================================================== */}

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
          {/* TEXTO IZQUIERDA */}

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

            <p
              className="
                mb-1
                text-[8px]
                font-black
                leading-none
                text-[#ff681e]

                sm:text-[11px]

                lg:text-[12px]
              "
            >
              Mis sedes
            </p>

            <h1
              className="
                max-w-[180px]
                font-black
                tracking-[-0.045em]

                min-[390px]:max-w-[200px]

                sm:max-w-[300px]

                lg:max-w-[365px]
              "
            >
              <span
                className="
                  block
                  text-[19px]
                  leading-[.98]
                  text-white

                  min-[390px]:text-[21px]

                  sm:text-[28px]

                  lg:whitespace-nowrap
                  lg:text-[clamp(29px,2.55vw,40px)]
                "
              >
                Todas tus sedes,
              </span>

              <span
                className="
                  mt-[2px]
                  block
                  text-[19px]
                  leading-[.98]
                  text-[#ff681e]

                  min-[390px]:text-[21px]

                  sm:text-[28px]

                  lg:whitespace-nowrap
                  lg:text-[clamp(29px,2.55vw,40px)]
                "
              >
                en un solo lugar.
              </span>
            </h1>

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
              Administra, analiza y potencia cada espacio de tu negocio.
            </p>
          </div>

          {/* =================================================
              ROBOT DERECHA
          ================================================= */}

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
            {/* RESPLANDOR */}

            <div
              className="
                pointer-events-none
                absolute
                left-1/2
                top-[20px]
                h-[90px]
                w-[120px]
                -translate-x-1/2
                rounded-full
                bg-[#006cff]/20
                blur-[30px]

                sm:h-[135px]
                sm:w-[180px]

                lg:top-0
                lg:h-[190px]
                lg:w-[230px]
                lg:blur-[50px]
              "
            />

            {/* ÓRBITA AZUL */}

            <div
              className="
                pointer-events-none
                absolute
                left-1/2
                top-[22px]
                h-[85px]
                w-[145px]
                -translate-x-1/2
                -rotate-[15deg]
                rounded-[50%]
                border
                border-[#168fff]/40

                sm:h-[120px]
                sm:w-[215px]

                lg:top-[15px]
                lg:h-[150px]
                lg:w-[260px]
              "
            />

            {/* ÓRBITA NARANJA */}

            <div
              className="
                pointer-events-none
                absolute
                left-1/2
                top-[27px]
                h-[82px]
                w-[140px]
                -translate-x-1/2
                rotate-[17deg]
                rounded-[50%]
                border
                border-[#ff681e]/35

                sm:h-[125px]
                sm:w-[205px]

                lg:top-[22px]
                lg:h-[155px]
                lg:w-[250px]
              "
            />

            {/* ICONO ANÁLISIS */}

            <img
              src={iconoAnalisis}
              alt=""
              className="
                pointer-events-none
                absolute
                left-[-2px]
                top-[12px]
                z-20
                h-[27px]
                w-[27px]
                object-contain

                sm:left-[8px]
                sm:top-[12px]
                sm:h-[42px]
                sm:w-[42px]

                lg:left-[5px]
                lg:top-[-12px]
                lg:h-[56px]
                lg:w-[56px]
              "
            />

            {/* ICONO UBICACIÓN */}

            <img
              src={iconoUbicacion}
              alt=""
              className="
                pointer-events-none
                absolute
                right-[-3px]
                top-[31px]
                z-20
                h-[28px]
                w-[28px]
                object-contain

                sm:right-[5px]
                sm:top-[48px]
                sm:h-[43px]
                sm:w-[43px]

                lg:right-0
                lg:top-[38px]
                lg:h-[58px]
                lg:w-[58px]
              "
            />

            {/* ICONO DOCUMENTO */}

            <img
              src={iconoDocumento}
              alt=""
              className="
                pointer-events-none
                absolute
                bottom-[17px]
                right-[6px]
                z-20
                h-[26px]
                w-[26px]
                object-contain

                sm:bottom-[16px]
                sm:right-[15px]
                sm:h-[38px]
                sm:w-[38px]

                lg:bottom-auto
                lg:right-[12px]
                lg:top-[105px]
                lg:h-[56px]
                lg:w-[56px]
              "
            />

            {/* ROBOT */}

            <img
              src={robotSedes}
              alt="Asistente Scapder"
              className="
                pointer-events-none
                absolute
                bottom-[11px]
                left-1/2
                z-10
                h-[125px]
                w-[125px]
                -translate-x-1/2
                object-contain
                object-bottom

                min-[390px]:h-[135px]
                min-[390px]:w-[135px]

                sm:h-[175px]
                sm:w-[175px]

                lg:bottom-auto
                lg:top-[-23px]
                lg:h-[205px]
                lg:w-[205px]
              "
            />
          </div>

          {/* =================================================
              MÉTRICAS
          ================================================= */}

          <div
            className="
              relative
              col-span-2
              row-start-2
              -mt-7
              overflow-hidden
              rounded-[14px]
              border
              border-[#26a9ff]
              bg-white
              px-[2px]
              py-1

              shadow-[0_0_10px_rgba(38,169,255,.85),0_0_24px_rgba(0,130,255,.5),0_18px_45px_-28px_rgba(0,91,180,.55)]

              min-[390px]:-mt-6

              sm:-mt-1
              sm:rounded-[18px]
              sm:px-1
              sm:py-2

              lg:col-auto
              lg:row-auto
              lg:order-2
              lg:mt-2
              lg:rounded-[20px]
              lg:px-3
              lg:py-3
            "
          >
            <div
              className="
                pointer-events-none
                absolute
                inset-0
                bg-[linear-gradient(120deg,rgba(17,81,168,.035),transparent_58%)]
              "
            />

            <div className="relative grid grid-cols-3">
              <TopMetric
                image={iconoUbicacion1}
                value={sites.length}
                label="Sedes registradas"
                border
              />

              <TopMetric
                image={iconoCamara}
                value={totalCameras}
                label="Cámaras en total"
                border
              />

              <TopMetric
                image={iconoAnalisis1}
                value={totalAnalyses}
                label="Análisis realizados"
              />
            </div>
          </div>
        </div>

        {/* =====================================================
            BUSCADOR Y CONTROLES
        ===================================================== */}

        <div
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
          {/* BUSCADOR */}

          <label
            className="
              flex
              h-[38px]
              items-center
              gap-2
              rounded-[12px]
              border
              border-[#1e4b6f]
              bg-[#061725]/95
              px-3
              transition
              focus-within:border-[#168aff]

              sm:h-[50px]
              sm:px-4

              lg:h-[52px]
              lg:px-5
            "
          >
            <Search
              size={15}
              className="shrink-0 text-white"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar sede..."
              className="
                min-w-0
                flex-1
                border-0
                bg-transparent
                text-[9px]
                text-white
                outline-none
                placeholder:text-[#748aa0]

                min-[390px]:text-[10px]

                sm:text-[12px]

                lg:text-[13px]
              "
            />
          </label>

          {/* FILTRAR */}

          <button
            type="button"
            className="
              inline-flex
              h-[38px]
              items-center
              justify-center
              gap-3
              rounded-[12px]
              border
              border-[#1e4b6f]
              bg-[#061725]/95
              text-[11px]
              font-black
              text-white
              transition
              hover:border-[#ff681e]

              sm:h-[48px]
              sm:text-[12px]

              lg:h-[52px]
            "
          >
            <SlidersHorizontal size={14} />

            Filtrar

            <ChevronDown size={13} />
          </button>

          <div className="hidden lg:block" />

          {/* CREAR SEDE */}

          <button
            type="button"
            onClick={() =>
              setShowCreate((value) => !value)
            }
            className="
              inline-flex
              h-[42px]
              items-center
              justify-center
              gap-2
              rounded-[14px]
              bg-[linear-gradient(90deg,#ff5510,#ff7022)]
              text-[11px]
              font-black
              text-white
              shadow-[0_10px_24px_-15px_rgba(255,91,18,.85)]
              transition
              hover:brightness-110

              sm:h-[52px]
              sm:text-[12px]

              lg:w-[205px]
              lg:rounded-[22px]
            "
          >
            <span
              className="
                grid
                h-6
                w-6
                place-items-center
                rounded-full
                bg-white
                text-[#ff5b12]

                sm:h-7
                sm:w-7
              "
            >
              <Plus
                size={14}
                strokeWidth={3}
              />
            </span>

            {showCreate
              ? 'Cancelar'
              : 'Crear sede'}
          </button>
        </div>

        {/* =====================================================
            FORMULARIO MÓVIL
        ===================================================== */}

        {showCreate && (
          <form
            onSubmit={submit}
            className="
              relative
              z-30
              mt-3
              grid
              gap-3
              rounded-[18px]
              border
              border-[#17486e]
              bg-[#061725]/95
              p-3

              md:grid-cols-2
              md:p-5

              lg:hidden
            "
          >
            <FormField
              label="Nombre"
              placeholder="Ej. Sede Centro"
              value={form.name}
              onChange={(value) =>
                setForm({
                  ...form,
                  name: value,
                })
              }
            />

            <FormField
              label="Ciudad"
              placeholder="Ej. Bogotá"
              value={form.city}
              onChange={(value) =>
                setForm({
                  ...form,
                  city: value,
                })
              }
            />

            <FormField
              label="Cámara"
              placeholder="Cámara principal"
              value={form.camera_name}
              onChange={(value) =>
                setForm({
                  ...form,
                  camera_name: value,
                })
              }
            />

            <button
              disabled={creating}
              type="submit"
              className="
                min-h-[46px]
                rounded-[14px]
                bg-[#ff681e]
                font-black
                text-white
                transition
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
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

        {/* =====================================================
            TARJETAS
        ===================================================== */}

        <div
          className="
            relative
            z-20
            mt-2

            sm:mt-5
          "
        >
          {filteredSites.length ? (
            <>
              {/* MÓVIL */}

              <div className="md:hidden">
                <div
                  ref={mobileCarouselRef}
                  className="
                    -mx-3
                    flex
                    snap-x
                    snap-mandatory
                    gap-3
                    overflow-x-auto
                    px-3
                    py-3
                    scroll-smooth
                    [scrollbar-width:none]
                    [&::-webkit-scrollbar]:hidden
                  "
                >
                  {filteredSites.map(
                    (site, originalIndex) => {
                      const camera =
                        site.configuration?.camera ?? {}

                      return (
                        <SiteCard
                          key={site.id}
                          site={site}
                          originalIndex={originalIndex}
                          camera={camera}
                          status={getSiteStatus(site)}
                          selectSite={selectSite}
                          removeSite={removeSite}
                          mobile
                        />
                      )
                    }
                  )}
                </div>

                {filteredSites.length > 1 && (
                  <div
                    className="
                      mt-1
                      flex
                      items-center
                      justify-between
                      px-1
                    "
                  >
                    <button
                      type="button"
                      onClick={scrollMobileLeft}
                      aria-label="Anterior"
                      className="
                        grid
                        h-8
                        w-8
                        place-items-center
                        rounded-full
                        border
                        border-[#214d6f]
                        bg-[#061725]
                      "
                    >
                      <ChevronLeft size={17} />
                    </button>

                    <span className="h-[5px] w-7 rounded-full bg-[#ff681e]" />

                    <button
                      type="button"
                      onClick={scrollMobileRight}
                      aria-label="Siguiente"
                      className="
                        grid
                        h-8
                        w-8
                        place-items-center
                        rounded-full
                        border
                        border-[#214d6f]
                        bg-[#061725]
                      "
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                )}
              </div>

              {/* TABLET / DESKTOP */}

              <div className="hidden md:block">
                {filteredSites.length > sitesPerPage && (
                  <button
                    type="button"
                    onClick={previousPage}
                    aria-label="Página anterior"
                    className="
                      absolute
                      -left-7
                      top-[45%]
                      z-30
                      hidden
                      h-12
                      w-12
                      -translate-y-1/2
                      place-items-center
                      rounded-full
                      border
                      border-[#204f74]
                      bg-[#061725]
                      transition
                      hover:bg-[#ff681e]

                      lg:grid
                    "
                  >
                    <ChevronLeft size={23} />
                  </button>
                )}

                <div
                  className="
                    grid
                    gap-5
                    py-3

                    md:grid-cols-2

                    lg:grid-cols-4
                    lg:gap-6
                  "
                >
                  {visibleSites.map((site) => {
                    const originalIndex =
                      filteredSites.indexOf(site)

                    const camera =
                      site.configuration?.camera ?? {}

                    return (
                      <SiteCard
                        key={site.id}
                        site={site}
                        originalIndex={originalIndex}
                        camera={camera}
                        status={getSiteStatus(site)}
                        selectSite={selectSite}
                        removeSite={removeSite}
                      />
                    )
                  })}
                </div>

                {filteredSites.length > sitesPerPage && (
                  <button
                    type="button"
                    onClick={nextPage}
                    aria-label="Página siguiente"
                    className="
                      absolute
                      -right-7
                      top-[45%]
                      z-30
                      hidden
                      h-12
                      w-12
                      -translate-y-1/2
                      place-items-center
                      rounded-full
                      border
                      border-[#204f74]
                      bg-[#061725]
                      transition
                      hover:bg-[#ff681e]

                      lg:grid
                    "
                  >
                    <ChevronRight size={23} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div
              className="
                rounded-[24px]
                border
                border-dashed
                border-[#235077]
                bg-[#061725]/95
                p-8
                text-center
              "
            >
              <Building2
                size={38}
                className="mx-auto text-[#ff681e]"
              />

              <h2 className="mt-4 text-xl font-black">
                No encontramos sedes
              </h2>

              <p className="mt-2 text-sm text-[#96aabd]">
                Busca por nombre o ciudad.
              </p>
            </div>
          )}
        </div>

        {/* PAGINACIÓN */}

        {totalPages > 1 && (
          <div
            className="
              relative
              z-20
              mt-5
              hidden
              justify-center
              gap-3

              md:flex
            "
          >
            {Array.from({
              length: totalPages,
            }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
                aria-label={`Página ${index + 1}`}
                className={`
                  h-2
                  rounded-full
                  transition-all

                  ${
                    page === index
                      ? 'w-7 bg-[#ff681e]'
                      : 'w-2 bg-[#3c5b77]'
                  }
                `}
              />
            ))}
          </div>
        )}

        <div className="h-4 sm:h-6" />
      </div>

      {/* =====================================================
          MODAL CREAR SEDE DESKTOP - COMPACTO
      ===================================================== */}

      {showCreate && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            hidden
            items-center
            justify-center
            bg-[#01060c]/85
            px-6
            py-6
            backdrop-blur-[10px]

            lg:flex
          "
        >
          {/* CLICK FUERA */}

          <button
            type="button"
            aria-label="Cerrar modal"
            onClick={() => setShowCreate(false)}
            className="absolute inset-0 cursor-default"
          />

          {/* CONTENEDOR */}

          <div
            className="
              relative
              z-10
              grid
              w-full
              max-w-[900px]
              grid-cols-[42%_58%]
              overflow-hidden
              rounded-[26px]
              border
              border-[#16689f]
              bg-[#03111f]
              shadow-[0_35px_90px_-25px_rgba(0,0,0,.95)]
            "
          >
            {/* =================================================
                ROBOT MODAL
            ================================================= */}

            <div
              className="
                relative
                min-h-[500px]
                overflow-hidden
                border-r
                border-[#123b5d]
                bg-[radial-gradient(circle_at_50%_60%,rgba(0,102,255,.17),transparent_52%)]
              "
            >
              {/* MENSAJE */}

              <div
                className="
                  absolute
                  left-1/2
                  top-[35px]
                  z-30
                  w-[255px]
                  -translate-x-1/2
                  -rotate-[3deg]
                  rounded-[18px]
                  border
                  border-[#168fff]
                  bg-[#06192b]/95
                  px-5
                  py-3
                  text-center
                  shadow-[0_12px_35px_-18px_rgba(0,112,255,.8)]
                "
              >
                <p className="text-[15px] font-black leading-tight text-white">
                  ¡Crea una nueva sede
                </p>

                <p className="mt-1 text-[15px] font-black leading-tight text-[#ff681e]">
                  y sigue creciendo!
                </p>
              </div>

              {/* LUZ */}

              <div
                className="
                  pointer-events-none
                  absolute
                  bottom-[35px]
                  left-1/2
                  h-[290px]
                  w-[290px]
                  -translate-x-1/2
                  rounded-full
                  bg-[#0074ff]/10
                  blur-[45px]
                "
              />

              {/* CÍRCULO AZUL */}

              <div
                className="
                  pointer-events-none
                  absolute
                  bottom-[55px]
                  left-1/2
                  h-[285px]
                  w-[285px]
                  -translate-x-1/2
                  rounded-full
                  border
                  border-[#168fff]/30
                "
              />

              {/* CÍRCULO NARANJA */}

              <div
                className="
                  pointer-events-none
                  absolute
                  bottom-[45px]
                  left-1/2
                  h-[260px]
                  w-[260px]
                  -translate-x-1/2
                  rotate-[17deg]
                  rounded-full
                  border
                  border-[#ff681e]/30
                "
              />

              {/* ICONOS */}

              <img
                src={iconoAnalisis}
                alt=""
                className="
                  pointer-events-none
                  absolute
                  left-[28px]
                  top-[190px]
                  z-30
                  h-[58px]
                  w-[58px]
                  object-contain
                "
              />

              <img
                src={iconoUbicacion}
                alt=""
                className="
                  pointer-events-none
                  absolute
                  right-[25px]
                  top-[175px]
                  z-30
                  h-[62px]
                  w-[62px]
                  object-contain
                "
              />

              <img
                src={iconoDocumento}
                alt=""
                className="
                  pointer-events-none
                  absolute
                  bottom-[48px]
                  right-[30px]
                  z-30
                  h-[58px]
                  w-[58px]
                  object-contain
                "
              />

              {/* ROBOT */}

              <img
                src={robotSedes1}
                alt="Asistente para crear sede"
                className="
                  pointer-events-none
                  absolute
                  bottom-[-12px]
                  left-1/2
                  z-20
                  h-[340px]
                  w-[340px]
                  -translate-x-1/2
                  object-contain
                  object-bottom
                "
              />
            </div>

            {/* =================================================
                FORMULARIO MODAL
            ================================================= */}

            <form
              onSubmit={submit}
              className="
                relative
                z-20
                flex
                min-h-[500px]
                flex-col
                justify-center
                px-10
                py-8
              "
            >
              {/* CERRAR */}

              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setShowCreate(false)}
                className="
                  absolute
                  right-5
                  top-5
                  grid
                  h-9
                  w-9
                  place-items-center
                  rounded-full
                  border
                  border-white/10
                  bg-white/[0.04]
                  text-[21px]
                  text-white
                  transition
                  hover:border-[#ff681e]
                  hover:text-[#ff681e]
                "
              >
                ×
              </button>

              <span
                className="
                  mb-3
                  block
                  h-[3px]
                  w-10
                  rounded-full
                  bg-[#ff681e]
                "
              />

              <p
                className="
                  mb-2
                  text-[10px]
                  font-black
                  uppercase
                  tracking-[0.14em]
                  text-[#ff681e]
                "
              >
                Nueva sede
              </p>

              <h2
                className="
                  text-[31px]
                  font-black
                  leading-[.98]
                  tracking-[-0.04em]
                  text-white
                "
              >
                Crea un nuevo

                <span className="block text-[#ff681e]">
                  espacio Scapder.
                </span>
              </h2>

              <p
                className="
                  mt-3
                  max-w-[450px]
                  text-[12px]
                  leading-5
                  text-[#9fb2c4]
                "
              >
                Registra la información básica de la sede para comenzar a
                configurarla.
              </p>

              {/* CAMPOS */}

              <div className="mt-6 grid gap-4">
                <CompactDesktopFormField
                  label="Nombre"
                  placeholder="Ej. Sede Centro"
                  value={form.name}
                  icon={<Building2 size={18} />}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      name: value,
                    })
                  }
                />

                <CompactDesktopFormField
                  label="Ciudad"
                  placeholder="Ej. Bogotá"
                  value={form.city}
                  icon={<MapPin size={18} />}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      city: value,
                    })
                  }
                />

                <CompactDesktopFormField
                  label="Cámara"
                  placeholder="Cámara principal"
                  value={form.camera_name}
                  icon={<Camera size={18} />}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      camera_name: value,
                    })
                  }
                />
              </div>

              {error && (
                <p className="mt-3 text-[12px] font-bold text-[#ff8968]">
                  {error}
                </p>
              )}

              {/* BOTONES */}

              <div
                className="
                  mt-6
                  grid
                  grid-cols-[1fr_1.15fr]
                  gap-3
                "
              >
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="
                    h-[48px]
                    rounded-[14px]
                    border
                    border-[#1d557e]
                    bg-[#05182a]
                    text-[13px]
                    font-black
                    text-white
                    transition
                    hover:border-[#168fff]
                  "
                >
                  Cancelar
                </button>

                <button
                  disabled={creating}
                  type="submit"
                  className="
                    inline-flex
                    h-[48px]
                    items-center
                    justify-center
                    gap-2
                    rounded-[14px]
                    bg-[linear-gradient(90deg,#ff5510,#ff7423)]
                    text-[13px]
                    font-black
                    text-white
                    shadow-[0_15px_30px_-14px_rgba(255,91,18,.8)]
                    transition
                    hover:-translate-y-0.5
                    hover:brightness-110
                    disabled:cursor-not-allowed
                    disabled:opacity-60
                  "
                >
                  {creating
                    ? 'Creando...'
                    : 'Crear sede'}

                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  mobile = false,
}) {
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
        className={`
          relative
          overflow-hidden
          bg-[#eaf2f8]

          ${
            mobile
              ? 'h-[105px] rounded-br-[30px]'
              : 'h-[185px] rounded-br-[52px] sm:h-[195px]'
          }
        `}
      >
        <img
          src={getSiteImage(site, originalIndex)}
          alt={site.name}
          className="
            h-full
            w-full
            object-cover
            transition
            duration-700
            group-hover:scale-105
          "
        />

        <div
          className="
            absolute
            inset-0
            bg-gradient-to-t
            from-black/25
            via-transparent
            to-transparent
          "
        />

        {/* NÚMERO */}

        <span
          className={`
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
          {String(originalIndex + 1).padStart(2, '0')}
        </span>

        {/* ESTADO */}

        <span
          className={`
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
          onClick={(event) =>
            removeSite(event, site)
          }
          aria-label={`Eliminar ${site.name}`}
          className={`
            absolute
            grid
            place-items-center
            rounded-full
            bg-white
            text-[#ff5b12]
            shadow-lg
            transition
            hover:bg-[#ff5b12]
            hover:text-white

            ${
              mobile
                ? 'bottom-3 right-3 h-7 w-7'
                : 'bottom-4 right-4 h-9 w-9 opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
            }
          `}
        >
          <Trash2 size={mobile ? 11 : 15} />
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
              : 'min-h-[160px] px-5 pb-5 pt-4'
          }
        `}
      >
        {/* LÍNEA NARANJA */}

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

        {/* NOMBRE */}

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
          {site.name}
        </h2>

        {/* CIUDAD */}

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
            size={mobile ? 9 : 15}
            className="shrink-0 text-[#ff681e]"
            strokeWidth={2.8}
          />

          {site.city || 'Sin ciudad'}
        </p>

        {/* CÁMARA */}

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
            size={mobile ? 9 : 15}
            className="shrink-0 text-[#ff681e]"
            strokeWidth={2.8}
          />

          {camera.name ? 1 : 0}{' '}
          {camera.name
            ? 'cámara'
            : 'cámaras'}
        </p>

        {/* BOTONES */}

        <div
          className={`
            flex
            items-center
            justify-between

            ${
              mobile
                ? 'mt-2'
                : 'mt-4'
            }
          `}
        >
          <button
            type="button"
            onClick={() =>
              selectSite(site)
            }
            className={`
              inline-flex
              items-center
              gap-1
              border-0
              bg-transparent
              p-0
              font-black
              text-[#111111]
              transition
              hover:text-[#ff681e]

              ${
                mobile
                  ? 'text-[7px]'
                  : 'text-[12px]'
              }
            `}
          >
            Ver sede

            <ArrowRight
              size={mobile ? 10 : 15}
              className="text-[#ff681e]"
            />
          </button>

          <button
            type="button"
            onClick={() =>
              selectSite(site)
            }
            aria-label={`Ver ${site.name}`}
            className={`
              grid
              place-items-center
              rounded-full
              border-0
              bg-[linear-gradient(145deg,#ff5510,#ff7824)]
              text-white
              shadow-[0_12px_25px_-10px_rgba(255,91,18,.95)]
              transition
              hover:scale-105
              hover:brightness-110

              ${
                mobile
                  ? 'h-7 w-7'
                  : 'h-11 w-11'
              }
            `}
          >
            <ArrowRight
              size={mobile ? 13 : 20}
            />
          </button>
        </div>
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
  border = false,
}) {
  return (
    <div
      className={`
        flex
        min-h-[52px]
        min-w-0
        items-center
        justify-center
        gap-1
        px-1

        min-[390px]:gap-2
        min-[390px]:px-2

        sm:min-h-[70px]
        sm:gap-3
        sm:px-3

        lg:min-h-[72px]
        lg:gap-4
        lg:px-4

        ${
          border
            ? 'border-r border-[#d6e0ea]'
            : ''
        }
      `}
    >
      {/* ICONO */}

      <div
        className="
          flex
          h-8
          w-8
          shrink-0
          items-center
          justify-center

          min-[390px]:h-9
          min-[390px]:w-9

          sm:h-11
          sm:w-11

          lg:h-[58px]
          lg:w-[58px]
        "
      >
        <img
          src={image}
          alt=""
          className="
            h-full
            w-full
            object-contain
            drop-shadow-[0_4px_7px_rgba(0,0,0,.12)]
          "
        />
      </div>

      {/* TEXTO */}

      <div className="min-w-0">
        <strong
          className="
            block
            text-[14px]
            font-black
            leading-none
            text-black

            min-[390px]:text-[16px]

            sm:text-[20px]

            lg:text-[26px]
          "
        >
          {value}
        </strong>

        <span
          className="
            mt-1
            block
            max-w-[48px]
            text-[4.5px]
            font-black
            leading-[6px]
            text-black

            min-[390px]:max-w-[55px]
            min-[390px]:text-[5px]

            sm:max-w-[75px]
            sm:text-[7px]
            sm:leading-[9px]

            lg:max-w-none
            lg:whitespace-nowrap
            lg:text-[8px]
          "
        >
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
        minLength={2}
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="
          min-h-[44px]
          rounded-[13px]
          border
          border-[#1d4b70]
          bg-[#03111e]
          px-4
          text-sm
          text-white
          outline-none
          transition
          placeholder:text-[#60798e]
          focus:border-[#ff681e]
          focus:ring-4
          focus:ring-[#ff681e]/10
        "
      />
    </label>
  )
}

/* =========================================================
   CAMPO DESKTOP NORMAL
========================================================= */

function DesktopFormField({
  label,
  placeholder,
  value,
  icon,
  onChange,
}) {
  return (
    <label className="grid gap-2.5">
      <span
        className="
          text-[13px]
          font-black
          text-[#dce7f1]
        "
      >
        {label}
      </span>

      <div
        className="
          flex
          h-[58px]
          items-center
          gap-4
          rounded-[16px]
          border
          border-[#18557f]
          bg-[#031321]
          px-5
          transition
          focus-within:border-[#168fff]
        "
      >
        <span className="shrink-0 text-[#ff681e]">
          {icon}
        </span>

        <input
          required
          minLength={2}
          value={value}
          placeholder={placeholder}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="
            min-w-0
            flex-1
            border-0
            bg-transparent
            text-[14px]
            font-semibold
            text-white
            outline-none
            placeholder:text-[#667f95]
          "
        />
      </div>
    </label>
  )
}

/* =========================================================
   CAMPO DEL MODAL COMPACTO
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
      <span
        className="
          text-[11px]
          font-black
          text-[#dce7f1]
        "
      >
        {label}
      </span>

      <div
        className="
          flex
          h-[50px]
          items-center
          gap-3
          rounded-[14px]
          border
          border-[#18557f]
          bg-[#031321]
          px-4
          transition
          focus-within:border-[#168fff]
          focus-within:shadow-[0_0_0_3px_rgba(0,112,255,.08)]
        "
      >
        <span className="shrink-0 text-[#ff681e]">
          {icon}
        </span>

        <input
          required
          minLength={2}
          value={value}
          placeholder={placeholder}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="
            min-w-0
            flex-1
            border-0
            bg-transparent
            text-[13px]
            font-semibold
            text-white
            outline-none
            placeholder:text-[#667f95]
          "
        />
      </div>
    </label>
  )
}