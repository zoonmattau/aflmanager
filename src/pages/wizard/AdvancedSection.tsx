import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdvancedSectionProps {
  label?: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export function AdvancedSection({ label = 'Advanced Settings', children, defaultOpen = false }: AdvancedSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200',
          open && 'border-b border-zinc-800',
        )}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
      </button>
      {open && <div className="space-y-5 p-4">{children}</div>}
    </div>
  )
}
