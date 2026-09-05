'use client'

import type { ReactNode } from 'react'
import RequireAuth from '@/components/auth/RequireAuth'
import AppHeader from '@/components/layout/AppHeader'

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <main className="min-h-screen bg-base text-ink">
        <AppHeader />
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 md:px-8 md:py-10">
          {children}
        </div>
      </main>
    </RequireAuth>
  )
}