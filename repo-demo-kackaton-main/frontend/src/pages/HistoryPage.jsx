import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileVideo,
  LoaderCircle,
  Search,
  XCircle,
} from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import robotHistorial from '../assets/images/robot-historial.png'
import { listAnalyses } from '../services/analyses'

const ITEMS_PER_PAGE = 7

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : ''

const getStatus = (status) => {
  if (status === 'completed') {
    return {
      label: 'Completado',
      icon: CheckCircle2,
      styles:
        'border-emerald-200 bg-emerald-50 text-emerald-600',
    }
  }

  if (status === 'failed') {
    return {
      label: 'Con error',
      icon: XCircle,
      styles:
        'border-red-200 bg-red-50 text-red-500',
    }
  }

  return {
    label: 'Procesando',
    icon: LoaderCircle,
    styles:
      'border-sky-200 bg-sky-50 text-sky-500',
  }
}

export default function HistoryPage() {
  const navigate = useNavigate()

  const [analyses, setAnalyses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let active = true

    listAnalyses()
      .then((items) => {
        if (active) {
          setAnalyses(items || [])
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const filteredAnalyses = useMemo(() => {
    return analyses.filter((analysis) => {
      const filename = analysis.filename || ''

      const matchesSearch = filename
        .toLowerCase()
        .includes(search.toLowerCase())

      const matchesStatus =
        statusFilter === 'all' ||
        analysis.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [analyses, search, statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, statusFilter])

  const totalPages = Math.ceil(
    filteredAnalyses.length / ITEMS_PER_PAGE
  )

  const paginatedAnalyses = filteredAnalyses.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const firstVisibleItem =
    filteredAnalyses.length === 0
      ? 0
      : (currentPage - 1) * ITEMS_PER_PAGE + 1

  const lastVisibleItem = Math.min(
    currentPage * ITEMS_PER_PAGE,
    filteredAnalyses.length
  )

  return (
    <section className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-[#001426] text-white">

      {/* FONDO DECORATIVO */}
      <div className="pointer-events-none absolute -left-52 bottom-[-230px] h-[620px] w-[620px] rounded-full border-[55px] border-[#063a70]/40" />

      <div className="pointer-events-none absolute -right-52 top-[200px] h-[700px] w-[700px] rounded-full border-[60px] border-[#063a70]/45" />

      <div className="pointer-events-none absolute right-[1%] top-[330px] h-[600px] w-[600px] rounded-full border-2 border-[#ff5b12]/35" />

      <div className="pointer-events-none absolute right-[4%] top-[125px] h-3 w-3 rounded-full bg-[#ff5b12] shadow-[0_0_20px_#ff5b12]" />

      <div className="relative z-10 mx-auto w-full max-w-[1320px] px-5 pb-10 pt-8 sm:px-8 lg:pt-10">

        {/* HERO */}
        <div className="relative grid min-h-[245px] grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_540px]">

          {/* TÍTULO */}
          <div className="relative z-20">

            <span className="mb-4 block h-[6px] w-[62px] rounded-full bg-[#ff5b12]" />

            <h1 className="m-0 text-[clamp(48px,6vw,76px)] font-black leading-[0.88] tracking-[-0.05em] text-white">
              Historial
            </h1>

            <p className="mt-5 max-w-[460px] text-[17px] font-medium leading-7 text-[#c3d0df]">
              Consulta y gestiona todos los análisis
              <br className="hidden sm:block" />
              realizados en tus sedes.
            </p>

          </div>

          {/* ROBOT ESCRITORIO */}
          <div className="relative z-30 hidden h-[245px] lg:block">

            <div className="absolute left-0 top-[40px] z-30 rotate-[-3deg] text-center font-medium italic text-white">

              <p className="text-[22px] leading-[1.18]">
                Analiza el pasado
                <br />
                y descubre nuevas
                <br />
                oportunidades
              </p>

              <span className="mx-auto mt-3 block h-[4px] w-[125px] rotate-[-8deg] rounded-full bg-[#ff5b12]" />

            </div>

            <img
              src={robotHistorial}
              alt="Robot de Scapder"
              className="absolute bottom-[0px] right-[-5px] z-40 h-[275px] w-[330px] object-contain object-bottom drop-shadow-[0_20px_30px_rgba(0,0,0,.38)]"
            />

          </div>

          {/* ROBOT MÓVIL */}
          <div className="relative mt-3 flex min-h-[245px] items-end justify-center lg:hidden">

            <div className="absolute left-0 top-3 z-20 rotate-[-3deg] text-left font-medium italic text-white">

              <p className="text-[18px] leading-[1.18] sm:text-[20px]">
                Analiza el pasado
                <br />
                y descubre nuevas
                <br />
                oportunidades
              </p>

              <span className="mt-3 block h-[4px] w-[105px] rotate-[-8deg] rounded-full bg-[#ff5b12]" />

            </div>

            <img
              src={robotHistorial}
              alt="Robot de Scapder"
              className="relative z-10 mt-14 h-[215px] w-[260px] translate-x-7 object-contain object-bottom drop-shadow-[0_18px_24px_rgba(0,0,0,.35)] sm:h-[230px] sm:w-[280px]"
            />

          </div>

        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div
          className="
            relative
            z-20
            mt-0
            overflow-hidden
            rounded-[26px]
            border
            border-[#168ed6]
            bg-[#002341]
            shadow-[0_0_18px_rgba(20,166,255,.58),0_0_42px_rgba(0,129,255,.22),0_28px_70px_-30px_rgba(0,0,0,.85)]
          "
        >

          {/* BRILLO AZUL SUPERIOR */}
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#2cc5ff] to-transparent shadow-[0_0_14px_#2cc5ff]" />

          {/* BUSCADOR + FILTRO */}
          <div className="relative z-50 grid gap-4 rounded-t-[25px] border-b border-[#10466f] bg-[#002341] p-5 md:grid-cols-[1fr_260px]">

            <label className="flex h-[52px] items-center gap-3 rounded-[14px] border border-[#149fe8] bg-[#001b33] px-4 transition focus-within:border-[#38bdf8] focus-within:shadow-[0_0_15px_rgba(56,189,248,.28)]">

              <Search
                size={20}
                className="shrink-0 text-white"
              />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Buscar archivo..."
                className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-[#879bb2]"
              />

            </label>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="h-[52px] cursor-pointer rounded-[14px] border border-[#149fe8] bg-[#001b33] px-4 text-sm font-bold text-white outline-none transition focus:border-[#38bdf8]"
            >
              <option value="all">
                Todos los estados
              </option>

              <option value="completed">
                Completados
              </option>

              <option value="processing">
                Procesando
              </option>

              <option value="failed">
                Con error
              </option>
            </select>

          </div>

          {/* ERROR */}
          {error && (
            <div className="m-5 rounded-[14px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-300">
              {error}
            </div>
          )}

          {/* CARGANDO */}
          {loading ? (

            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-b-[25px] bg-white">

              <LoaderCircle
                size={38}
                className="animate-spin text-[#ff641f]"
              />

              <p className="mt-4 font-bold text-[#6b7280]">
                Cargando historial...
              </p>

            </div>

          ) : filteredAnalyses.length ? (

            /* TABLA */
            <div className="relative rounded-b-[25px] bg-white px-5 pb-5 pt-5">

              {/* CABECERA ESCRITORIO */}
              <div className="relative hidden grid-cols-[1.35fr_.8fr_.55fr_.5fr] rounded-[12px] border border-[#d7e9f5] bg-[#f2f7fb] px-5 py-4 text-xs font-black uppercase tracking-wide text-[#53657a] md:grid">

                <span>Archivo</span>
                <span>Fecha de análisis</span>
                <span>Estado</span>
                <span>Acciones</span>

              </div>

              {/* FILAS */}
              <div className="relative">

                {paginatedAnalyses.map((analysis) => {
                  const status = getStatus(analysis.status)
                  const StatusIcon = status.icon

                  return (
                    <div
                      key={analysis.id}
                      className="
                        group
                        grid
                        gap-4
                        border-b
                        border-[#e1edf5]
                        bg-white
                        px-3
                        py-5
                        transition
                        duration-200
                        hover:bg-[#f7fbff]
                        md:grid-cols-[1.35fr_.8fr_.55fr_.5fr]
                        md:items-center
                        md:px-5
                        md:py-4
                      "
                    >

                      {/* ARCHIVO */}
                      <div className="flex min-w-0 items-center gap-4">

                        <div className="flex h-[54px] w-[72px] shrink-0 items-center justify-center rounded-[11px] border border-[#cfe7f5] bg-[#eff8fd] transition group-hover:border-[#40bfff] group-hover:shadow-[0_0_12px_rgba(64,191,255,.18)]">

                          <FileVideo
                            size={25}
                            className="text-[#ff641f]"
                          />

                        </div>

                        <div className="min-w-0">

                          <h3 className="truncate text-[15px] font-black text-[#102033]">
                            {analysis.filename}
                          </h3>

                          <p className="mt-1 text-xs font-semibold text-[#8593a5]">
                            Archivo de análisis
                          </p>

                        </div>

                      </div>

                      {/* FECHA */}
                      <div className="flex items-center gap-2 text-sm font-bold text-[#415269]">

                        <Clock
                          size={17}
                          className="shrink-0 text-[#75869b]"
                        />

                        <span>
                          {formatDate(analysis.created_at)}
                        </span>

                      </div>

                      {/* ESTADO */}
                      <span
                        className={`inline-flex w-fit items-center gap-2 rounded-[12px] border px-4 py-2 text-xs font-black ${status.styles}`}
                      >

                        <StatusIcon
                          size={18}
                          className={
                            analysis.status === 'processing'
                              ? 'animate-spin'
                              : ''
                          }
                        />

                        {status.label}

                      </span>

                      {/* ACCIÓN */}
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/analyses/${analysis.id}`)
                        }
                        className="inline-flex h-[44px] w-fit min-w-[150px] items-center justify-center gap-3 rounded-[11px] bg-gradient-to-r from-[#ff5b12] to-[#ff7b31] px-5 text-sm font-black text-white shadow-[0_8px_20px_-8px_rgba(255,100,31,.8)] transition hover:-translate-y-0.5 hover:brightness-110"
                      >
                        Ver análisis

                        <ArrowRight size={17} />

                      </button>

                    </div>
                  )
                })}

              </div>

              {/* PIE */}
              <div className="relative flex flex-col gap-4 border-t border-[#edf1f5] pt-5 sm:flex-row sm:items-center sm:justify-between">

                <p className="text-sm font-semibold text-[#718096]">

                  {filteredAnalyses.length > ITEMS_PER_PAGE ? (
                    <>
                      Mostrando {firstVisibleItem} - {lastVisibleItem} de{' '}
                      {filteredAnalyses.length} archivos
                    </>
                  ) : (
                    <>
                      Mostrando {filteredAnalyses.length} de{' '}
                      {filteredAnalyses.length} archivos
                    </>
                  )}

                </p>

                {/* PAGINACIÓN SOLO SI HAY MÁS DE 7 */}
                {filteredAnalyses.length > ITEMS_PER_PAGE && (

                  <div className="flex flex-wrap items-center gap-2">

                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.max(page - 1, 1)
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#edf2f7] font-bold text-[#26364a] transition hover:bg-[#dfe7ef] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ‹
                    </button>

                    {Array.from(
                      { length: totalPages },
                      (_, index) => index + 1
                    ).map((page) => (

                      <button
                        key={page}
                        type="button"
                        onClick={() =>
                          setCurrentPage(page)
                        }
                        className={`flex h-10 w-10 items-center justify-center rounded-[10px] font-black transition ${
                          currentPage === page
                            ? 'bg-[#ff641f] text-white shadow-[0_0_18px_rgba(255,100,31,.35)]'
                            : 'bg-[#edf2f7] text-[#26364a] hover:bg-[#dfe7ef]'
                        }`}
                      >
                        {page}
                      </button>

                    ))}

                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() =>
                        setCurrentPage((page) =>
                          Math.min(page + 1, totalPages)
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#edf2f7] font-bold text-[#26364a] transition hover:bg-[#dfe7ef] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ›
                    </button>

                  </div>

                )}

              </div>

            </div>

          ) : (

            /* SIN ANÁLISIS */
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-b-[25px] bg-white px-6 text-center">

              <div className="mb-4 flex h-[70px] w-[70px] items-center justify-center rounded-[18px] border border-[#cce8f7] bg-[#f0f9ff]">

                <FileVideo
                  size={34}
                  className="text-[#ff641f]"
                />

              </div>

              <h2 className="text-xl font-black text-[#102033]">
                No hay análisis
              </h2>

              <p className="mt-2 max-w-[400px] text-sm leading-6 text-[#8593a5]">
                {search || statusFilter !== 'all'
                  ? 'No encontramos análisis con los filtros seleccionados.'
                  : 'Todavía no hay análisis registrados.'}
              </p>

            </div>

          )}

        </div>

        {/* VOLVER */}
        <button
          type="button"
          onClick={() => navigate('/inicio')}
          className="mt-5 rounded-[12px] border border-[#1c5f8c] bg-[#002341] px-5 py-3 text-sm font-black text-white transition hover:border-[#ff641f] hover:text-[#ff641f]"
        >
          Volver a inicio
        </button>

      </div>

    </section>
  )
}