import { ChevronDown, LogOut } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import logo from '../../assets/images/logo.png'

const navItems = [
  ['01', 'Empresas', '/empresas'],
  ['02', 'Sedes', 'site'],
  ['03', 'Analisis', 'analysis'],
  ['04', 'Historial', '/historial'],
  ['05', 'Resultados', 'results'],
]

const matchesPathGroup = (pathname, ...groups) => groups.some((group) => pathname === group || pathname.startsWith(`${group}/`))

export default function Header({ user, logout, retailer, site, job, goHome }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

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
      navigate(`/sedes/${site.id}/analisis/entrada`)
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
      return matchesPathGroup(pathname, '/analyses')
    }
    return pathname === target
  }

  return (
    <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b  bg-[#202021] px-[clamp(16px,3vw,38px)] shadow-[0_14px_38px_-34px_rgba(18,22,33,.65)] backdrop-blur max-[760px]:h-[64px]">
      <button className="flex items-center border-0 bg-transparent p-0" onClick={goHome} type="button">
        <img src={logo} alt="Scapder" className="h-auto w-[112px] object-contain max-[760px]:w-[96px]" />
      </button>

      <nav className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-[#111827] p-1.5 md:flex">
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

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <b className="block text-[12px] leading-none text-white">{user?.name || 'Admin'}</b>
          <span className="mt-1 block text-[10px] font-bold text-[#ff7a1a]">{site?.name || retailer?.name || 'SCAPDER'}</span>
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-full border border-[#eceef3] bg-white text-[#151323]" type="button">
          <ChevronDown size={16} />
        </button>
        <button className="grid h-9 w-9 place-items-center rounded-full border border-[#eceef3] bg-white text-[#ff5b12] transition hover:border-[#ff5b12]" onClick={logout} type="button" aria-label="Cerrar sesion">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
