import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { AuthProvider } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'SCAPDER',
  description: 'Auditoría visual de espacios de valor con IA',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-base text-ink">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}