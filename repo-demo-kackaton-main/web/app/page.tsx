'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function Home() {
  const router = useRouter()
  const { user, checking } = useAuth()

  useEffect(() => {
    if (checking) return
    router.replace(user ? '/retailers' : '/login')
  }, [checking, user, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-base">
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted">SCAPDER</span>
    </div>
  )
}