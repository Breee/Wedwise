export function formatDate(value: string | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('de-DE', opts ?? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const RSVP_STATUS_LABEL: Record<string, string> = {
  yes: 'Zusage',
  no: 'Absage',
  maybe: 'Unsicher',
  pending: 'Offen',
}

export const CONTRIBUTION_STATUS_LABEL: Record<string, string> = {
  new: 'Neu',
  needs_clarification: 'Rückfrage',
  planning: 'In Planung',
  confirmed: 'Bestätigt',
  rejected: 'Abgelehnt',
}

export const DIET_OPTIONS = [
  { value: '', label: 'Keine Angabe' },
  { value: 'omnivore', label: 'Alles' },
  { value: 'vegetarian', label: 'Vegetarisch' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescetarian', label: 'Pescetarisch' },
  { value: 'other', label: 'Sonstiges' },
]

export const DIET_LABEL: Record<string, string> = Object.fromEntries(
  DIET_OPTIONS.map((o) => [o.value, o.label]),
)
