import { siSignal, siTelegram, siWhatsapp } from 'simple-icons'
import type { Messenger, MessengerKind } from './types'

const ICONS: Record<MessengerKind, { path: string; hex: string }> = {
  whatsapp: siWhatsapp,
  signal: siSignal,
  telegram: siTelegram,
}

export const MESSENGERS: { id: MessengerKind; label: string; handleHint: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', handleHint: 'Telefonnummer oder Benutzername' },
  { id: 'signal', label: 'Signal', handleHint: 'Telefonnummer oder Benutzername' },
  { id: 'telegram', label: 'Telegram', handleHint: 'Telefonnummer oder @benutzername' },
]

export function MessengerIcon({ kind, className }: { kind: MessengerKind; className?: string }) {
  const icon = ICONS[kind]
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill={`#${icon.hex}`}>
      <path d={icon.path} />
    </svg>
  )
}

function digits(phone: string) {
  const d = phone.replace(/[^\d+]/g, '')
  return d.startsWith('+') ? d : d.replace(/^00/, '+')
}

function isPhone(handle: string) {
  return /^[\d\s+()/-]+$/.test(handle)
}

export function messengerUrl(m: Messenger, phone: string) {
  const handle = m.handle || phone
  const p = digits(handle)
  switch (m.kind) {
    case 'whatsapp':
      return isPhone(handle) ? `https://wa.me/${p.replace('+', '')}` : `https://wa.me/${handle.replace(/^@/, '')}`
    case 'signal':
      return isPhone(handle) ? `https://signal.me/#p/${p}` : `https://signal.me/#eu/${handle.replace(/^@/, '')}`
    case 'telegram':
      return isPhone(handle) ? `https://t.me/${p}` : `https://t.me/${handle.replace(/^@/, '')}`
  }
}
