import { MessageCircle, Phone } from 'lucide-react'
import { MESSENGERS, matrixUrl, messengerUrl } from '@/lib/contact'
import { cn } from '@/lib/utils'
import type { Messenger } from '@/lib/types'

export function ContactLinks({
  phone,
  messengers,
  matrixId,
  className,
}: {
  phone: string
  messengers: string
  matrixId: string
  className?: string
}) {
  const active = messengers.split(',').filter(Boolean) as Messenger[]
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const chip = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted'
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <a href={`tel:${phone}`} onClick={stop} className={chip}>
        <Phone className="size-3" />
        {phone}
      </a>
      {MESSENGERS.filter((m) => active.includes(m.id)).map((m) => (
        <a key={m.id} href={messengerUrl(m.id, phone)} target="_blank" rel="noreferrer" onClick={stop} className={chip}>
          <MessageCircle className="size-3" />
          {m.label}
        </a>
      ))}
      {matrixId && (
        <a href={matrixUrl(matrixId)} target="_blank" rel="noreferrer" onClick={stop} className={chip} title={matrixId}>
          <MessageCircle className="size-3" />
          Matrix
        </a>
      )}
    </span>
  )
}
