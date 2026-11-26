import { t } from '@/lib/i18n'
import { DIET_LABEL } from '@/lib/format'
import { splitList } from '@/components/rsvp/music'
import type { ResponseWithAttendees } from '@/lib/types'

const guests = (responses: ResponseWithAttendees[]) =>
  responses.filter((r) => r.status === 'yes').flatMap((r) => r.attendees.map((a) => ({ ...a, contact: r.contactName })))

export function genreRanking(responses: ResponseWithAttendees[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const r of responses) for (const g of splitList(r.musicGenres ?? '')) counts.set(g, (counts.get(g) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

// The same song wished by several guests counts once, with everyone who asked for it.
export function songWishes(responses: ResponseWithAttendees[]) {
  const wishes = new Map<string, { song: string; who: string[] }>()
  for (const r of responses) {
    const song = (r.musicSong ?? '').trim().replace(/\s+/g, ' ')
    if (!song) continue
    const wish = wishes.get(song.toLowerCase()) ?? { song, who: [] }
    wish.who.push(r.contactName)
    wishes.set(song.toLowerCase(), wish)
  }
  return [...wishes.values()].sort((a, b) => b.who.length - a.who.length)
}

export function venueText(title: string, responses: ResponseWithAttendees[]): string {
  const all = guests(responses)
  const children = all.filter((a) => a.isChild)
  const diets = new Map<string, number>()
  for (const a of all) diets.set(a.diet || 'none', (diets.get(a.diet || 'none') ?? 0) + 1)
  const allergies = all.filter((a) => a.allergies.trim())
  const lines = [
    title,
    '',
    `${t('Gäste gesamt')}: ${all.length}`,
    `${t('Erwachsene')}: ${all.length - children.length}`,
    `${t('Kinder')}: ${children.length}${children.some((c) => c.age) ? ` (${t('Alter')}: ${children.map((c) => c.age || '?').join(', ')})` : ''}`,
    '',
    `${t('Ernährung')}:`,
    ...[...diets.entries()].map(([k, n]) => `- ${DIET_LABEL[k] ?? k}: ${n}`),
    '',
    `${t('Allergien & Unverträglichkeiten')}:`,
    ...(allergies.length ? allergies.map((a) => `- ${a.name}: ${a.allergies.trim()}`) : [`- ${t('Keine Angaben.')}`]),
  ]
  return lines.join('\n')
}

export function djText(title: string, responses: ResponseWithAttendees[]): string {
  const genres = genreRanking(responses)
  const songs = songWishes(responses)
  const none = [`- ${t('Keine Angaben.')}`]
  return [
    title,
    '',
    `${t('Musikgeschmack')} (${t('Stimmen')}):`,
    ...(genres.length ? genres.map(([g, n]) => `- ${g}: ${n}`) : none),
    '',
    `${t('Must-play-Songs')}:`,
    ...(songs.length ? songs.map((s) => `- ${s.song}${s.who.length > 1 ? ` (${s.who.length}×)` : ''}`) : none),
  ].join('\n')
}

const cell = (value: string | number) => {
  const text = String(value)
  // A leading =, +, - or @ would run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function guestCsv(responses: ResponseWithAttendees[]): string {
  const head = [t('Name'), t('Rückmeldung von'), t('Kind'), t('Alter'), t('Ernährung'), t('Allergien')]
  const rows = guests(responses).map((a) => [
    a.name,
    a.contact,
    a.isChild ? t('Ja') : t('Nein'),
    a.isChild && a.age ? a.age : '',
    DIET_LABEL[a.diet || 'none'] ?? a.diet,
    a.allergies.trim(),
  ])
  return [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
}

export function download(name: string, text: string, type: string) {
  // The byte order mark makes Excel read the file as UTF-8.
  const url = URL.createObjectURL(new Blob(['\ufeff', text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
