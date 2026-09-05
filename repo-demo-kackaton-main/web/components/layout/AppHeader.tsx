'use client'

import BrandLogo from '@/components/ui/BrandLogo'
import { useAuth } from '@/lib/auth'

export default function AppHeader({ onHome, onAudit }) {
  const { user, logout } = useAuth()

  const handleHome = () => {
    if (typeof onHome === 'function') onHome()
    else window.location.href = '/retailers'
  }

  const handleAudit = () => {
    if (typeof onAudit === 'function') onAudit()
    else window.location.href = '/retailers'
  }

  return (
    <header className="flex items-center gap-4 border-b border-line bg-base/80 px-5 py-4 backdrop-blur">
      <div onClick={handleHome} className="flex cursor-pointer select-none items-center gap-3">
        <span className="inline-block h-8 w-8 rotate-45 border border-acid bg-transparent" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-bold tracking-[0.2em] text-ink">SCAPDER</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-muted">
            re-imagining retail audit
          </span>
        </div>
      </div>

      <nav className="ml-auto flex items-center gap-6">
        <button
          onClick={handleHome}
          className="bg-transparent p-0 font-mono text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-acid"
        >
          Inicio
        </button>
        <button
          onClick={handleAudit}
          className="bg-transparent p-0 font-mono text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-acid"
        >
          Nueva auditoría
        </button>
        {user && (
          <span className="hidden font-mono text-xs text-muted md:inline">{user?.email}</span>
        )}
        <button
          onClick={logout}
          className="border border-line px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:border-acid hover:text-acid"
        >
          Salir
        </button>
      </nav>
    </header>
  )
}