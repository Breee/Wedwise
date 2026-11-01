import { Phone } from 'lucide-react'
import { MESSENGERS, MessengerIcon, messengerUrl } from '@/lib/contact'
import { cn } from '@/lib/utils'
import type { Messenger } from '@/lib/types'

export function ContactLinks({ phone, messengers, className }: { phone: string; messengers: Messenger[]; className?: string }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs hover:bg-muted'
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <a href={`tel:${phone}`} onClick={stop} className={chip}>
        <Phone className="size-3" />
        {phone}
      </a>
      {messengers.map((m) => {
        const label = MESSENGERS.find((x) => x.id === m.kind)?.label ?? m.kind
        return (
          <a key={m.kind} href={messengerUrl(m, phone)} target="_blank" rel="noreferrer" onClick={stop} className={chip} title={label}>
            <MessengerIcon kind={m.kind} className="size-3.5" />
            {m.handle || label}
          </a>
        )
      })}
    </span>
  )
}
