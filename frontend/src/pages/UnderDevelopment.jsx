import { Construction } from 'lucide-react'

export default function UnderDevelopment() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <Construction size={40} className="text-[#2c3a61]" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Under Development</h2>
        <p className="text-sm text-[var(--color-muted-fg)]">This module is coming soon.</p>
      </div>
    </div>
  )
}
