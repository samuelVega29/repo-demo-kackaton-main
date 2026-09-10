import { AlertCircle, ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import avatarChat from '../assets/images/avatar-chat.png'

const STORAGE_KEY = 'scapder:onboarding-tour:v1'
const FORCE_TOUR_PARAM = 'tour'

const sharedSteps = [
  {
    target: '[data-tour="brand"]',
    title: 'Inicio rapido',
    body: 'Desde el logo vuelves al flujo principal para elegir empresa, sede y analisis.',
  },
  {
    target: '[data-tour="help"]',
    title: 'Ayuda por seccion',
    body: 'Este boton abre instrucciones especificas segun la pantalla actual. Tambien permite repetir este recorrido.',
  },
]

const toursByPage = {
  companies: [
    {
      target: '[data-tour="companies-hero"]',
      title: 'Empresas',
      body: 'Esta pantalla es el punto de partida. Aqui agrupas cada negocio con sus sedes, videos y resultados.',
    },
    {
      target: '[data-tour="companies-create"]',
      title: 'Crear empresa',
      body: 'Usa este boton para registrar una empresa nueva. Te pedira nombre y NIT para identificarla rapido.',
    },
    {
      target: '[data-tour="companies-filters"]',
      title: 'Buscar y filtrar',
      body: 'Cuando tengas varias empresas, busca por nombre, sector o ubicacion, y filtra por estado.',
    },
    {
      target: '[data-tour="companies-list"]',
      title: 'Tarjetas de empresas',
      body: 'Cada tarjeta abre sus sedes. Tambien muestra estado, cantidad de sedes y acceso para eliminar si necesitas limpiar datos.',
    },
  ],
  sites: [
    {
      target: '[data-tour="sites-hero"]',
      title: 'Sedes',
      body: 'Una sede representa un local fisico. Cada una guarda su camara, plano, gondolas e historial.',
    },
    {
      target: '[data-tour="sites-create"]',
      title: 'Crear sede',
      body: 'Registra una sede con ciudad y camara principal. Esa informacion sera la base para configurar el analisis.',
    },
    {
      target: '[data-tour="sites-search"]',
      title: 'Buscar sede',
      body: 'Filtra las sedes de esta empresa por nombre o ciudad para encontrar rapido el local correcto.',
    },
    {
      target: '[data-tour="sites-list"]',
      title: 'Elegir sede',
      body: 'Abre una sede para ver su panel, revisar configuracion o iniciar un nuevo analisis.',
    },
  ],
  dashboard: [
    {
      target: '[data-tour="dashboard-hero"]',
      title: 'Panel de sede',
      body: 'Este encabezado confirma la sede activa y te da accesos directos para nuevo analisis o historial.',
    },
    {
      target: '[data-tour="dashboard-config"]',
      title: 'Estado de configuracion',
      body: 'Aqui ves si la sede ya tiene camara, calibracion y gondolas listas para reutilizar.',
    },
    {
      target: '[data-tour="dashboard-metrics"]',
      title: 'Indicadores rapidos',
      body: 'Estos datos resumen analisis, zonas calientes, gondolas guardadas y eventos del ultimo procesamiento.',
    },
    {
      target: '[data-tour="dashboard-history"]',
      title: 'Actividad reciente',
      body: 'Consulta los ultimos videos analizados y entra a sus resultados sin salir de la sede.',
    },
  ],
  upload: [
    {
      target: '[data-tour="upload-stepper"]',
      title: 'Paso del pipeline',
      body: 'El indicador muestra en que etapa estas dentro del flujo de analisis.',
    },
    {
      target: '[data-tour="upload-panel"]',
      title: 'Video de la sede',
      body: 'Carga un MP4 de la camara fija. El sistema usara este archivo para detectar comportamiento y zonas.',
    },
    {
      target: '[data-tour="upload-config"]',
      title: 'Configuracion guardada',
      body: 'Si la sede ya tiene plano, revisa que coincida con el video antes de continuar.',
    },
    {
      target: '[data-tour="upload-history"]',
      title: 'Historial cercano',
      body: 'Este panel te ayuda a comparar con videos anteriores de la misma sede.',
    },
  ],
  area: [
    {
      target: '[data-tour="content"]',
      title: 'Zona de analisis',
      body: 'En esta pantalla defines si analizaras todo el video o solo un area especifica del local.',
    },
  ],
  results: [
    {
      target: '[data-tour="content"]',
      title: 'Resultados',
      body: 'Explora metricas, overlays, zonas y evidencia generada a partir del video procesado.',
    },
  ],
  insights: [
    {
      target: '[data-tour="content"]',
      title: 'Recomendaciones',
      body: 'Aqui generas hallazgos accionables y puedes preparar el informe para compartir.',
    },
  ],
  history: [
    {
      target: '[data-tour="content"]',
      title: 'Historial',
      body: 'Revisa analisis anteriores, estados de procesamiento y accesos rapidos a resultados.',
    },
  ],
  default: [
    {
      target: '[data-tour="navigation"]',
      title: 'Ruta de trabajo',
      body: 'La barra superior te permite moverte por empresas, sedes, analisis, resultados, recomendaciones e historial.',
    },
    {
      target: '[data-tour="content"]',
      title: 'Area de trabajo',
      body: 'Esta zona cambia segun la pestaña y concentra las acciones principales de cada flujo.',
    },
  ],
}

function getTourKey(pathname) {
  if (pathname === '/empresas') return 'companies'
  if (pathname.match(/^\/empresas\/[^/]+\/sedes$/)) return 'sites'
  if (pathname.match(/^\/sedes\/[^/]+$/)) return 'dashboard'
  if (pathname.includes('/sedes/') && pathname.includes('/analisis/nuevo/area')) {
    return 'area'
  }
  if (pathname.includes('/analisis/nuevo') || pathname.includes('/video')) {
    return 'upload'
  }
  if (pathname.includes('/analyses') && pathname.includes('/recomendaciones')) {
    return 'insights'
  }
  if (pathname.includes('/analyses')) {
    return 'results'
  }
  if (pathname.includes('/historial')) {
    return 'history'
  }
  return 'default'
}

function getTargetRect(selector) {
  const element = document.querySelector(selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export default function OnboardingTour() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const steps = useMemo(() => {
    const pageSteps = toursByPage[getTourKey(pathname)] ?? toursByPage.default
    return [...pageSteps, ...sharedSteps]
  }, [pathname])
  const step = steps[index] ?? steps[0]

  const close = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'done')
    setOpen(false)
    setIndex(0)
  }, [])

  const start = useCallback(() => {
    setIndex(0)
    setOpen(true)
  }, [])

  useEffect(() => {
    const onStart = () => start()
    window.addEventListener('scapder:start-tour', onStart)
    return () => window.removeEventListener('scapder:start-tour', onStart)
  }, [start])

  useEffect(() => {
    const tourParam = new URLSearchParams(window.location.search).get(FORCE_TOUR_PARAM)
    if (tourParam === 'reset') {
      localStorage.removeItem(STORAGE_KEY)
    }
    if (tourParam === '1' || tourParam === 'true' || tourParam === 'reset') {
      const timeout = window.setTimeout(() => setOpen(true), 250)
      return () => window.clearTimeout(timeout)
    }
    if (localStorage.getItem(STORAGE_KEY) === 'done') return undefined
    const timeout = window.setTimeout(() => setOpen(true), 650)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const updateRect = () => setRect(getTargetRect(step.target))
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [open, step.target])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close()
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(value + 1, steps.length - 1))
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(value - 1, 0))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, open, steps.length])

  if (!open) return null

  const padding = 10
  const safeRect = rect ?? {
    height: Math.min(360, window.innerHeight - 160),
    left: 20,
    top: 110,
    width: window.innerWidth - 40,
  }
  const highlight = {
    bottom: clamp(safeRect.top + safeRect.height + padding, 0, window.innerHeight),
    left: clamp(safeRect.left - padding, 8, window.innerWidth - 24),
    right: clamp(safeRect.left + safeRect.width + padding, 24, window.innerWidth - 8),
    top: clamp(safeRect.top - padding, 8, window.innerHeight - 24),
  }
  const tooltipWidth = Math.min(390, window.innerWidth - 32)
  const tooltipLeft = clamp(highlight.left, 16, window.innerWidth - tooltipWidth - 16)
  const belowTop = highlight.bottom + 16
  const tooltipTop = belowTop + 230 < window.innerHeight ? belowTop : Math.max(16, highlight.top - 246)

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="fixed left-0 top-0 bg-[#071d25]/72 backdrop-blur-[1px]" style={{ height: highlight.top, right: 0 }} />
      <div className="fixed left-0 bg-[#071d25]/72 backdrop-blur-[1px]" style={{ bottom: window.innerHeight - highlight.bottom, top: highlight.top, width: highlight.left }} />
      <div className="fixed bg-[#071d25]/72 backdrop-blur-[1px]" style={{ bottom: window.innerHeight - highlight.bottom, left: highlight.right, right: 0, top: highlight.top }} />
      <div className="fixed bottom-0 left-0 right-0 bg-[#071d25]/72 backdrop-blur-[1px]" style={{ top: highlight.bottom }} />
      <div
        className="pointer-events-none fixed rounded-[18px] border-2 border-[#ff7a1a] shadow-[0_0_0_9999px_rgba(7,29,37,.04),0_0_32px_rgba(255,122,26,.75)]"
        style={{
          height: highlight.bottom - highlight.top,
          left: highlight.left,
          top: highlight.top,
          width: highlight.right - highlight.left,
        }}
      />
      <section
        className="fixed overflow-hidden rounded-2xl border border-[#ffd7c4] bg-white text-[#071d25] shadow-[0_30px_80px_-36px_rgba(7,29,37,.9)]"
        style={{ left: tooltipLeft, top: tooltipTop, width: tooltipWidth }}
      >
        <div className="flex items-start gap-3 border-b border-[#eef2f7] p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#ff7a1a] bg-[#fff1eb] shadow-[0_12px_28px_-18px_rgba(255,91,18,.95)]">
            <img src={avatarChat} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff5b12]">Recorrido {index + 1} de {steps.length}</p>
            <h2 id="tour-title" className="mt-1 text-xl font-black leading-tight">{step.title}</h2>
          </div>
          <button className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#d6e3f2] text-[#58708f] transition hover:border-[#ff5b12] hover:text-[#ff5b12]" onClick={close} type="button" aria-label="Cerrar recorrido">
            <X size={17} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm font-semibold leading-6 text-[#58708f]">{step.body}</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#eaf1f8]">
            <div className="h-full rounded-full bg-[#ff7a1a] transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#d6e3f2] bg-white px-4 text-sm font-black text-[#58708f] transition hover:border-[#071d25] hover:text-[#071d25] disabled:cursor-not-allowed disabled:opacity-40" disabled={index === 0} onClick={() => setIndex((value) => Math.max(value - 1, 0))} type="button">
              <ArrowLeft size={16} /> Atras
            </button>
            {index === steps.length - 1 ? (
              <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#17a964] px-4 text-sm font-black text-white shadow-[0_16px_34px_-22px_rgba(23,169,100,.95)] transition hover:-translate-y-px" onClick={close} type="button">
                Entendido <Check size={16} />
              </button>
            ) : (
              <button className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#ff5b12] px-4 text-sm font-black text-white shadow-[0_16px_34px_-22px_rgba(255,91,18,.95)] transition hover:-translate-y-px" onClick={() => setIndex((value) => Math.min(value + 1, steps.length - 1))} type="button">
                Siguiente <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
