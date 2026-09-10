import { AlertCircle, LogOut, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import introMascot from '../../assets/images/download.gif'
import logo from '../../assets/images/logo.png'
import robotGuide from '../../assets/images/robot-chistoso.png'

const navItems = [
  ['01', 'Empresas', '/empresas'],
  ['02', 'Sedes', 'site'],
  ['03', 'Analisis', 'analysis'],
  ['04', 'Resultados', 'results'],
  ['05', 'Recomendaciones', 'insights'],
  ['06', 'Historial general', '/historial'],
]

const matchesPathGroup = (pathname, ...groups) => groups.some((group) => pathname === group || pathname.startsWith(`${group}/`))

const instructionsBySection = {
  companies: {
    title: 'Empresas',
    badge: 'Paso 1',
    intro: 'Aqui creas o eliges la empresa que contiene tus sedes, analisis y configuraciones.',
    now: 'Selecciona una empresa para ver sus sedes o crea una nueva si estas empezando.',
    steps: ['Crear o buscar empresa', 'Entrar a sus sedes', 'Mantener cada negocio separado'],
  },
  sites: {
    title: 'Sedes',
    badge: 'Paso 2',
    intro: 'Cada sede guarda su propia camara, plano y gondolas. Esa configuracion se reutiliza en videos nuevos.',
    now: 'Elige una sede. Si ya esta configurada, podras ir al historial o subir un nuevo video con esa configuracion.',
    steps: ['Crear o elegir sede', 'Revisar estado de configuracion', 'Entrar al pipeline de analisis'],
  },
  dashboard: {
    title: 'Panel de sede',
    badge: 'Resumen',
    intro: 'Este panel muestra si la sede ya tiene pipeline activo y sus analisis recientes.',
    now: 'Si la sede esta configurada, puedes subir video directo. Si no, entra a configurar camara y gondolas.',
    steps: ['Ver estado de camara', 'Abrir historial', 'Subir video o configurar sede'],
  },
  upload: {
    title: 'Pipeline de analisis',
    badge: 'Analisis por sede',
    intro: 'Primero sube el video MP4 de la sede. Despues pasas a configurar zonas y dibujar el planograma.',
    now: 'Selecciona el archivo y avanza a "Configurar zonas".',
    steps: ['Subir MP4', 'Configurar zona de analisis', 'Dibujar gondolas', 'Analizar video'],
  },
  area: {
    title: 'Zona de analisis',
    badge: 'Recorte opcional',
    intro: 'Puedes analizar todo el video o marcar un area especifica para enfocar el procesamiento.',
    now: 'Selecciona el area si solo quieres medir una parte del local; si no, continua con todo el frame.',
    steps: ['Elegir modo', 'Marcar zona si aplica', 'Guardar y analizar'],
  },
  capture: {
    title: 'Captura de frame',
    badge: 'Frame base',
    intro: 'El frame es una foto tomada del video. Esa imagen se usa para marcar el piso.',
    now: 'Pausa el video donde se vea bien el piso y presiona "Capturar frame".',
    steps: ['Elegir momento claro', 'Capturar frame', 'Continuar a calibracion'],
  },
  calibration: {
    title: 'Calibracion de camara',
    badge: 'Camara por sede',
    intro: 'Aqui le dices al sistema como convertir el video en medidas del plano.',
    now: 'Ubica P1, P2, P3 y P4 en las esquinas visibles del piso y guarda.',
    steps: ['Mover puntos P1-P4', 'Guardar calibracion', 'Revisar alineacion'],
  },
  planogram: {
    title: 'Plano y gondolas',
    badge: 'Configuracion guardada',
    intro: 'Las gondolas quedan asociadas a esta sede para reutilizarlas en futuros videos.',
    now: 'Ajusta las gondolas y presiona "Guardar plano".',
    steps: ['Dibujar gondolas', 'Guardar plano', 'Ver 3D'],
  },
  history: {
    title: 'Historial de analisis',
    badge: 'Analisis anteriores',
    intro: (site) => site ? `Estas revisando los analisis de ${site.name}.` : 'Aqui puedes revisar analisis anteriores.',
    now: 'Abre un analisis anterior o sube un video nuevo desde la sede.',
    steps: ['Buscar archivo', 'Abrir resultados', 'Subir otro video'],
  },
  results: {
    title: 'Resultados',
    badge: 'Informe generado',
    intro: 'Esta vista muestra el resultado del video procesado.',
    now: 'Cambia de metrica y selecciona una gondola para ver detalle.',
    steps: ['Ver video con overlay', 'Cambiar metrica', 'Revisar 3D y pick-ups'],
  },
  insights: {
    title: 'Recomendaciones e Informe',
    badge: 'Paso 5',
    intro: 'Claude interpreta las metricas y los frames ya calculados para darte hallazgos accionables, con evidencia visual citada.',
    now: 'Genera las recomendaciones con IA y descarga el informe en Word para compartirlo.',
    steps: ['Generar recomendaciones con IA', 'Revisar evidencia por frame', 'Exportar el informe en Word'],
  },
  default: {
    title: 'Guia de uso',
    badge: 'Ruta recomendada',
    intro: 'SCAPDER trabaja por sede: configuras una vez y luego analizas videos nuevos.',
    now: 'Elige empresa y sede para empezar.',
    steps: ['Empresa y sede', 'Configuracion de camara', 'Videos y resultados'],
  },
}

const getInstructionKey = (pathname) => {
  if (pathname === '/empresas') return 'companies'
  if (pathname.match(/^\/empresas\/[^/]+\/sedes$/) || pathname.match(/^\/retailers\/[^/]+\/sites$/)) return 'sites'
  if (pathname.match(/^\/sites\/[^/]+$/) || pathname.match(/^\/sedes\/[^/]+$/)) return 'dashboard'
  if (pathname.includes('/analisis/nuevo/area')) return 'area'
  if (pathname.includes('/analisis/nuevo') || pathname.includes('/video')) return 'upload'
  if (pathname.includes('/captura')) return 'capture'
  if (pathname.includes('/calibracion')) return 'calibration'
  if (pathname.includes('/planograma')) return 'planogram'
  if (pathname.includes('/historial')) return 'history'
  if (pathname.includes('/recomendaciones')) return 'insights'
  if (pathname.includes('/analyses')) return 'results'
  return 'default'
}

const instructionBySection = (pathname, site) => {
  const section = instructionsBySection[getInstructionKey(pathname)] ?? instructionsBySection.default
  return {
    ...section,
    intro: typeof section.intro === 'function' ? section.intro(site) : section.intro,
  }
}

export default function Header({ user, logout, retailer, site, job, goHome }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [tourHintVisible, setTourHintVisible] = useState(false)
  const instructions = instructionBySection(pathname, site)

  useEffect(() => {
    const showTimer = window.setTimeout(() => setTourHintVisible(true), retailer ? 900 : 12400)
    const hideTimer = window.setTimeout(() => setTourHintVisible(false), retailer ? 10900 : 22400)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [retailer])

  const goTo = (target) => {
    if (target === 'site') {
      navigate(retailer ? `/empresas/${retailer.id}/sedes` : '/empresas')
      return
    }
    if (target === 'analysis') {
      if (!site) {
        navigate('/empresas')
        return
      }
      navigate(`/sedes/${site.id}`)
      return
    }
    if (target === 'results') {
      if (job?.result && job?.id) {
        navigate(`/analyses/${job.id}`)
        return
      }
      navigate(site ? `/sedes/${site.id}` : '/empresas')
      return
    }
    if (target === 'insights') {
      if (job?.result && job?.id) {
        navigate(`/analyses/${job.id}/recomendaciones`)
        return
      }
      navigate(site ? `/sedes/${site.id}` : '/empresas')
      return
    }
    navigate(target)
  }

  const active = (target) => {
    if (target === 'site') {
      return pathname.includes('/sedes') || matchesPathGroup(pathname, '/sedes', '/sites')
    }
    if (target === 'analysis') {
      return matchesPathGroup(pathname, '/sedes', '/sites') && (
        pathname.includes('/analisis/') || pathname.includes('/captura') || pathname.includes('/video')
      )
    }
    if (target === 'results') {
      return matchesPathGroup(pathname, '/analyses') && !pathname.includes('/recomendaciones')
    }
    if (target === 'insights') {
      return matchesPathGroup(pathname, '/analyses') && pathname.includes('/recomendaciones')
    }
    return pathname === target
  }

  const startTour = () => {
    setInstructionsOpen(false)
    setTourHintVisible(false)
    window.dispatchEvent(new Event('scapder:start-tour'))
  }

  return (
    <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b bg-[#202021] px-[clamp(16px,3vw,38px)] shadow-[0_14px_38px_-34px_rgba(18,22,33,.65)] backdrop-blur max-[760px]:h-[64px]">
      <button className="flex items-center border-0 bg-transparent p-0" onClick={goHome} type="button" data-tour="brand">
        <img src={logo} alt="Scapder" className="h-auto w-[112px] object-contain max-[760px]:w-[96px]" />
      </button>

      {retailer && (
        <nav className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-[#111827] p-1.5 md:flex" data-tour="navigation">
          {navItems.map(([step, label, target]) => (
            <button
              aria-current={active(target) ? 'page' : undefined}
              className={`flex min-h-[46px] items-center gap-2 rounded-xl px-3 py-2 text-left transition lg:px-4 ${active(target) ? 'bg-[#ff7a1a] text-white shadow-[0_14px_34px_-24px_rgba(255,122,26,.85)]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              key={label}
              onClick={() => goTo(target)}
              type="button"
            >
              <span className={`text-[18px] font-black leading-none ${active(target) ? 'text-[#071d25]' : 'text-[#ff7a1a]'}`}>{step}</span>
              <span className="text-[12px] font-black leading-none">{label}</span>
            </button>
          ))}
        </nav>
      )}

      {!retailer && (
        <div className="pointer-events-none absolute left-[118px] top-1/2 z-20 hidden -translate-y-1/2 md:block" aria-hidden="true">
          <div className="relative h-[92px] w-[118px] overflow-visible">
            <span className="header-intro-glow absolute left-1/2 top-1/2 h-20 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff7a1a]/20 blur-2xl" />
            <img
              src={introMascot}
              alt=""
              className="header-intro-mascot relative h-[92px] w-auto object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,.35)]"
            />
          </div>
        </div>
      )}

      <div className="relative flex items-center gap-3">
        <div className="hidden text-right sm:block" data-tour="workspace">
          <b className="block text-[12px] leading-none text-white">{user?.name || 'Admin'}</b>
          <span className="mt-1 block text-[10px] font-bold text-[#ff7a1a]">{site?.name || retailer?.name || 'SCAPDER'}</span>
        </div>
        {tourHintVisible && (
          <button
            className="absolute right-[88px] top-[52px] z-50 hidden w-[430px] animate-[tour-bounce-in_.8s_cubic-bezier(.2,1.45,.4,1)_both] items-center gap-4 rounded-[24px] border-2 border-[#ff7a1a] bg-white p-4 text-left text-[#071d25] shadow-[0_28px_78px_-34px_rgba(255,91,18,.9)] transition hover:-translate-y-1 hover:scale-[1.01] md:flex"
            onClick={startTour}
            type="button"
            aria-label="Iniciar recorrido guiado"
          >
            <span className="relative grid h-20 w-20 shrink-0 animate-[tour-avatar-pulse_1.35s_ease-in-out_infinite] place-items-center overflow-hidden rounded-full bg-[#fff1eb] ring-4 ring-[#ff7a1a]">
              <span className="absolute inset-[-8px] rounded-full border-2 border-[#ff7a1a]/30" />
              <img src={robotGuide} alt="" className="h-full w-full object-cover object-top" />
            </span>
            <span className="min-w-0">
              <b className="block text-[18px] font-black leading-5">Si eres nuevo, puedo guiarte</b>
              <span className="mt-2 block text-[13px] font-bold leading-5 text-[#667085]">Haz clic aqui o en el boton naranja para iniciar el recorrido de la app.</span>
              <span className="mt-3 inline-flex rounded-full bg-[#ff7a1a] px-3 py-1.5 text-[11px] font-black uppercase text-white">Iniciar tour</span>
            </span>
          </button>
        )}
        <button className="grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-[#ff5b12] text-white shadow-[0_0_24px_rgba(255,91,18,.35)] transition hover:-translate-y-px hover:bg-[#e94d08]" onClick={() => setInstructionsOpen(true)} type="button" aria-label="Ver instrucciones de esta seccion" title="Instrucciones" data-tour="help">
          <AlertCircle size={19} strokeWidth={2.5} />
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-full border border-[#eceef3] bg-white text-[#ff5b12] transition hover:border-[#ff5b12]" onClick={logout} type="button" aria-label="Cerrar sesion">
          <LogOut size={16} />
        </button>
      </div>
      {instructionsOpen && createPortal(
        <InstructionModal instructions={instructions} onClose={() => setInstructionsOpen(false)} onStartTour={startTour} />,
        document.body,
      )}
    </header>
  )
}

function InstructionModal({ instructions, onClose, onStartTour }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#071d25]/60 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="section-instructions-title">
      <section className="relative grid max-h-[calc(100dvh-32px)] w-full max-w-[1060px] overflow-hidden rounded-[24px] bg-white text-[#151323] shadow-[0_34px_90px_-42px_rgba(7,29,37,.95)] md:grid-cols-[380px_1fr]">
        <button className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full border border-[#d6e3f2] bg-white/95 text-[#071d25] shadow-[0_16px_38px_-28px_rgba(7,29,37,.8)] transition hover:border-[#ff5b12] hover:text-[#ff5b12]" onClick={onClose} type="button" aria-label="Cerrar instrucciones">
          <X size={18} />
        </button>
        <div className="relative isolate min-h-[310px] overflow-hidden bg-[linear-gradient(180deg,#07182a_0%,#0b2338_35%,#0f324b_72%,#123f5b_100%)] p-6 text-white md:min-h-[520px] md:p-8">
          <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full border-[16px] border-[#ff7a1a]" />
          <div className="pointer-events-none absolute -right-20 bottom-10 h-48 w-48 rounded-full border-[22px] border-[#ff7a1a]/35" />
          <div className="pointer-events-none absolute left-[18%] top-[18%] h-32 w-32 rounded-full bg-[#42b8ff]/20 blur-3xl" />
          <div className="pointer-events-none absolute right-[-20px] top-[22%] h-40 w-40 rounded-full bg-[#ff7a1a]/15 blur-3xl" />
          <img src={robotGuide} alt="" className="absolute bottom-0 left-1/2 w-[210px] -translate-x-1/2 object-contain drop-shadow-[0_24px_38px_rgba(0,0,0,.42)] sm:w-[250px] md:w-[330px]" />
          <div className="relative z-10 flex min-h-[260px] max-w-[280px] flex-col md:min-h-[455px]">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-black uppercase text-[#8fd3ff]">
              <AlertCircle size={15} /> {instructions.badge}
            </span>
            <div className="mt-5">
              <p className="text-[10px] font-black uppercase tracking-[.28em] text-white/55">Guia de uso</p>
              <h2 className="mt-3 text-[clamp(34px,7vw,46px)] font-black leading-[.9] text-white">{instructions.title}</h2>
            </div>
          </div>
        </div>
        <div className="overflow-y-auto p-6 pt-16 sm:p-8 sm:pt-16 md:p-10">
          <div className="mb-6">
            <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#fff1eb] px-3 py-1 text-[10px] font-black uppercase text-[#ff5b12]">
              <AlertCircle size={14} />
              Instrucciones
            </span>
            <h2 id="section-instructions-title" className="text-[clamp(28px,4vw,42px)] font-black leading-none text-[#071d25]">{instructions.title}</h2>
            <p className="mt-3 max-w-[520px] text-sm font-semibold leading-6 text-[#58708f]">{instructions.intro}</p>
          </div>
          <div className="rounded-2xl border border-[#ffd7c4] bg-[#fff7f2] p-4">
            <b className="block text-sm font-black text-[#ff5b12]">Accion recomendada</b>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#334155]">{instructions.now}</p>
          </div>
          <div className="mt-4 grid gap-2">
            {instructions.steps.map((step, index) => (
              <div className="flex min-h-[58px] items-center gap-3 rounded-2xl border border-[#d6e3f2] bg-[#f8fafc] p-3" key={step}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#17a964] text-sm font-black text-white">{index + 1}</span>
                <p className="text-sm font-bold leading-5 text-[#475569]">{step}</p>
              </div>
            ))}
          </div>
          <button className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#ff5b12] px-5 text-sm font-black text-white shadow-[0_18px_42px_-24px_rgba(255,91,18,.95)] transition hover:-translate-y-px hover:bg-[#e94d08]" onClick={onStartTour} type="button">
            Iniciar recorrido guiado <AlertCircle size={16} />
          </button>
        </div>
      </section>
    </div>
  )
}
