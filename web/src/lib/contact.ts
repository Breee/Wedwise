import type { Messenger } from './types'

export const MESSENGERS: { id: Messenger; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'signal', label: 'Signal' },
  { id: 'telegram', label: 'Telegram' },
]

function digits(phone: string) {
  const d = phone.replace(/[^\d+]/g, '')
  return d.startsWith('+') ? d : d.replace(/^00/, '+')
}

export function messengerUrl(m: Messenger, phone: string) {
  const p = digits(phone)
  switch (m) {
    case 'whatsapp':
      return `https://wa.me/${p.replace('+', '')}`
    case 'signal':
      return `https://signal.me/#p/${p}`
    case 'telegram':
      return `https://t.me/${p}`
  }
}

export function matrixUrl(id: string) {
  return `https://matrix.to/#/${id}`
}
