import BrandLogo from '../components/ui/BrandLogo'
import { Outlet } from 'react-router-dom'

export default function AppLayout({ user, retailer, site, onHome, onLogout, children }) {
  return (
    <main className="min-h-screen bg-[#07100e] text-slate-100">
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-white/10 bg-[#07100e]/90 px-4 backdrop-blur md:px-8 lg:px-16">
        <button className="border-0 bg-transparent p-0" onClick={onHome} type="button">
          <BrandLogo />
        </button>
        <nav className="hidden items-center gap-3 font-mono text-xs text-slate-400 md:flex">
          <button className="bg-transparent text-slate-300" onClick={onHome} type="button">Retailers</button>
          {retailer && <><span className="text-slate-600">/</span><span>{retailer.name}</span></>}
          {site && <><span className="text-slate-600">/</span><span>{site.name}</span></>}
        </nav>
        <div className="flex items-center gap-3 text-right text-xs">
          <span className="hidden sm:block">{user.name}<small className="block font-mono text-[9px] uppercase text-teal-300">{user.role}</small></span>
          <button className="grid h-9 w-9 place-items-center border border-white/10 text-slate-300" onClick={onLogout} aria-label="Cerrar sesion" type="button">x</button>
        </div>
      </header>
      {children || <Outlet />}
    </main>
  )
}
