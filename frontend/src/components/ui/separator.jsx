import { cn } from '@/lib/utils'

export function Separator({ className, orientation = 'horizontal' }) {
  return (
    <div className={cn(
      'bg-[#d8e2ef] shrink-0',
      orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full',
      className
    )} />
  )
}
