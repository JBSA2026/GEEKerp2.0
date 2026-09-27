import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-[#2c3a61] hover:bg-[#202b49] text-white',
  ghost: 'hover:bg-[#e9eef8] text-slate-600 hover:text-[#26324f]',
  outline: 'border border-[#d8e2ef] bg-white hover:bg-[#edf4fb] text-slate-700',
}
const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  icon: 'p-2',
}

export function Button({ children, variant = 'default', size = 'md', className, ...props }) {
  return (
    <button
      className={cn('inline-flex items-center gap-2 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50', variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  )
}
