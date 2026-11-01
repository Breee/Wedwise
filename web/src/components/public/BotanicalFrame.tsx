import { cn } from '@/lib/utils'

function Sprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 190 C 40 150, 70 110, 130 60" />
      <path d="M30 165 C 25 145, 35 130, 55 125 C 50 145, 42 158, 30 165 Z" />
      <path d="M48 142 C 60 125, 78 120, 95 128 C 78 136, 62 142, 48 142 Z" />
      <path d="M68 118 C 62 100, 70 84, 88 78 C 86 96, 80 110, 68 118 Z" />
      <path d="M88 98 C 102 85, 120 84, 135 94 C 118 100, 102 101, 88 98 Z" />
      <path d="M106 78 C 102 62, 110 48, 126 42 C 126 58, 118 70, 106 78 Z" />
      <path d="M124 62 C 138 52, 156 54, 168 66 C 152 70, 136 69, 124 62 Z" />
      <path d="M40 180 C 70 165, 100 160, 150 150" />
      <circle cx="150" cy="150" r="2.2" />
      <circle cx="140" cy="146" r="1.6" />
      <circle cx="134" cy="155" r="1.6" />
    </svg>
  )
}

export function BotanicalFrame({ className }: { className?: string }) {
  const sprig = 'absolute h-40 w-40 text-sage/70 sm:h-56 sm:w-56 md:h-72 md:w-72'
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <Sprig className={cn(sprig, '-bottom-6 -left-6')} />
      <Sprig className={cn(sprig, '-top-6 -right-6 rotate-180')} />
      <Sprig className={cn(sprig, '-top-6 -left-6 rotate-90 opacity-60')} />
      <Sprig className={cn(sprig, '-right-6 -bottom-6 -rotate-90 opacity-60')} />
    </div>
  )
}
