import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-[#e9eef8] text-[#2c3a61] border-[#cbd8ea]',
  success: 'bg-[#eaf1f8] text-[#5d8796] border-[#b8c8df]',
  warning: 'bg-[#edf4fb] text-[#65728a] border-[#cbd8ea]',
  danger: 'bg-[#f1e8ef] text-[#9f4d61] border-[#d8c4d2]',
  muted: 'bg-[#e9eef8] text-slate-600 border-[#d8e2ef]',
}

export function Badge({ children, variant = 'default', className }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', variants[variant], className)}>
      {children}
    </span>
  )
}
