// Builds a calendar entry (timed when the schedule has a start time, else all-day) and returns a downloadable data URL.
export function icsUrl({
  title,
  date,
  location,
  url,
  schedule = [],
}: {
  title: string
  date: string
  location: string
  url: string
  schedule?: { time: string; title: string }[]
}): string {
  const day = date.replaceAll('-', '')
  const times = schedule.map((s) => s.time.match(/(\d{1,2})[:.](\d{2})/)).filter((m): m is RegExpMatchArray => m !== null)
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n')
  const stamp = (m: RegExpMatchArray) => `${day}T${m[1].padStart(2, '0')}${m[2]}00`

  let when: string[]
  if (times.length > 0) {
    // Ends at midnight at the earliest; later if the schedule runs past it.
    const last = times[times.length - 1]
    const lastHour = Number(last[1])
    const next = new Date(`${date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    const nextDay = next.toISOString().slice(0, 10).replaceAll('-', '')
    const end = lastHour >= 22 ? `${nextDay}T020000` : `${nextDay}T000000`
    when = [`DTSTART;TZID=Europe/Berlin:${stamp(times[0])}`, `DTEND;TZID=Europe/Berlin:${end}`]
  } else {
    const next = new Date(`${date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    when = [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replaceAll('-', '')}`]
  }

  const description = [
    ...schedule.map((s) => `${s.time} ${s.title}`),
    schedule.length ? '' : null,
    `Alle Infos & Rückmeldung: ${url}`,
  ].filter((l): l is string => l !== null)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wedwise//DE',
    'BEGIN:VEVENT',
    `UID:${day}@wedwise`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    ...when,
    `SUMMARY:${esc(title)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(description.join('\n'))}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`
}
