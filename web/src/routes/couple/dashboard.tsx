import { createFileRoute } from '@tanstack/react-router'
import { t } from '@/lib/i18n'
import { useSuspenseQuery } from '@tanstack/react-query'
import { responsesQuery, summaryQuery } from '@/lib/queries'
import { DIET_LABEL } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { splitList } from '@/components/rsvp/music'
import { PageHeader } from '@/components/admin/PageHeader'
import { Stat } from '@/components/admin/Stat'
import { ResponsesTable } from '@/components/admin/ResponsesTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/couple/dashboard')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(summaryQuery),
      context.queryClient.ensureQueryData(responsesQuery),
    ]),
  component: CoupleDashboard,
})

function CoupleDashboard() {
  const { data: s } = useSuspenseQuery(summaryQuery)
  const { data: responses } = useSuspenseQuery(responsesQuery)
  const diets = Object.entries(s.dietCounts ?? {}).filter(([, n]) => n > 0)
  const genreCounts = new Map<string, number>()
  for (const r of responses) for (const g of splitList(r.musicGenres ?? '')) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)
  const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])
  const genreMax = genres[0]?.[1] ?? 1
  const songs = responses.filter((r) => r.musicSong).map((r) => ({ who: r.contactName, song: r.musicSong }))

  return (
    <>
      <PageHeader title={t('Übersicht')} description={t('Stand der Rückmeldungen auf einen Blick.')} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t('Rückmeldungen')} value={s.responses} />
        <Stat label={t('Zusagen')} value={s.statusCounts?.yes ?? 0} hint={t('{n} Absagen', { n: s.statusCounts?.no ?? 0 })} />
        <Stat label={t('Gäste')} value={s.attendeesAttending} hint={t('Personen mit Zusage')} />
        <Stat label={t('Kinder')} value={s.children} />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Ernährung')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {diets.length === 0 && <p className="text-sm text-muted-foreground">{t('Keine Angaben.')}</p>}
            {diets.map(([k, n]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span>{DIET_LABEL[k] ?? k}</span>
                <Badge variant="secondary">{n}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Allergien & Unverträglichkeiten')}</CardTitle>
          </CardHeader>
          <CardContent>
            {s.allergies?.length ? (
              <ul className="space-y-1 text-sm">
                {s.allergies.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.name}:</span> {a.allergies}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('Keine Angaben.')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Musikgeschmack')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {genres.length === 0 && <p className="text-sm text-muted-foreground">{t('Keine Angaben.')}</p>}
            {genres.map(([g, n]) => (
              <div key={g} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate">{g}</span>
                <div className="h-2.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(n / genreMax) * 100}%` }} />
                </div>
                <span className="text-right text-muted-foreground">{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Must-play-Songs')}</CardTitle>
          </CardHeader>
          <CardContent>
            {songs.length ? (
              <ul className="space-y-1 text-sm">
                {songs.map((x, i) => (
                  <li key={i}>
                    ♪ {x.song} <span className="text-muted-foreground">– {x.who}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('Keine Angaben.')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-12 text-3xl">{t('Rückmeldungen')}</h2>
      <div className="mt-4">
        <ResponsesTable responses={responses} />
      </div>
    </>
  )
}
