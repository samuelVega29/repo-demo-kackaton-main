'use client'

import type { ReactNode } from 'react'

export default function FlowStep({
  index,
  title,
  active,
  done,
  children,
}: {
  index: number
  title: string
  active?: boolean
  done?: boolean
  children?: ReactNode
}) {
  const label = done ? '✓' : String(index + 1).padStart(2, '0')
  return (
    <div
      className={`flex flex-col gap-3 border-l-2 pl-5 ${
        active ? 'border-acid' : done ? 'border-mint' : 'border-line'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] ${
            active || done ? 'bg-acid text-base' : 'border border-muted text-muted'
          }`}
        >
          {label}
        </span>
        <span
          className={`font-mono text-xs uppercase tracking-[0.18em] ${
            active || done ? 'text-ink' : 'text-muted'
          }`}
        >
          {title}
        </span>
      </div>
      {children && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  )
}