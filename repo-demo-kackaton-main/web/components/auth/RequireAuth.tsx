'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, checking } = useAuth()

  useEffect(() => {
    if (!checking && !user) router.replace('/login')
  }, [checking, user, router])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">SCAPDER</span>
      </div>
    )
  }

  if (!user) return null
  return <>{children}</>
}