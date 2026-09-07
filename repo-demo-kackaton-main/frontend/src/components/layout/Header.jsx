import { ChevronDown, LogOut } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import logo from '../../assets/images/logo.png'

const navItems = [
  ['Empresas', '/empresas'],
  ['Sedes', 'site'],
  ['Analisis', 'analysis'],
  ['Historial', '/historial'],
  ['Resultados', 'results'],
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
      return matchesPathGroup(pathname, '/empresas', '/sedes', '/sites')
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
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#eceef3] bg-white/95 px-[clamp(16px,3vw,38px)] backdrop-blur max-[760px]:h-[64px]">
      <button className="flex items-center border-0 bg-transparent p-0" onClick={goHome} type="button">
        <img src={logo} alt="Scapder" className="h-auto w-[96px] object-contain" />
      </button>

      <nav className="hidden items-center gap-2 rounded-full bg-[#f4f5f7] p-1 md:flex">
        {navItems.map(([label, target]) => (
          <button
            aria-current={active(target) ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-[12px] font-black transition ${active(target) ? 'bg-[#ff5b12] text-white shadow-[0_14px_30px_-22px_rgba(255,91,18,.9)]' : 'text-[#7d8392] hover:text-[#151323]'}`}
            key={label}
            onClick={() => goTo(target)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <b className="block text-[12px] leading-none text-[#151323]">{user?.name || 'Admin'}</b>
          <span className="mt-1 block text-[10px] font-bold text-[#7d8392]">{site?.name || retailer?.name || 'SCAPDER'}</span>
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
