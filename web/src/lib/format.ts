import { locale, t } from '@/lib/i18n'

export function formatDate(value: string | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(locale(), opts ?? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function labels(source: Record<string, string>): Record<string, string> {
  return new Proxy(source, { get: (target, key: string) => (key in target ? t(target[key]) : undefined) })
}

export const RSVP_STATUS_LABEL = labels({
  yes: 'Zusage',
  no: 'Absage',
})

export const CONTRIBUTION_STATUS_LABEL = labels({
  new: 'Neu',
  needs_clarification: 'Rückfrage',
  planning: 'In Planung',
  confirmed: 'Bestätigt',
  rejected: 'Abgelehnt',
})

const DIETS: Record<string, string> = {
  none: 'Alles',
  vegetarian: 'Vegetarisch',
  vegan: 'Vegan',
  other: 'Sonstiges',
}

export const DIET_OPTIONS = Object.keys(DIETS).map((value) => ({
  value,
  get label() {
    return t(DIETS[value])
  },
}))

export const DIET_LABEL = labels(DIETS)
