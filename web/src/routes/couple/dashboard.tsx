import { createFileRoute } from '@tanstack/react-router'
import { t } from '@/lib/i18n'
import { useSuspenseQuery } from '@tanstack/react-query'
import { publicContentQuery, responsesQuery, summaryQuery } from '@/lib/queries'
import { Copy, Download } from 'lucide-react'
import { copyText } from '@/lib/clipboard'
import { djText, download, genreRanking, guestCsv, songWishes, venueText } from '@/lib/handover'
import { Button } from '@/components/ui/button'
import { DIET_LABEL } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { genreIcon } from '@/components/rsvp/music'
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
  const genres = genreRanking(responses)
  const genreMax = genres[0]?.[1] ?? 1
  const songs = songWishes(responses)
  const title = useSuspenseQuery(publicContentQuery).data.event.title
  const copy = (text: string) => copyText(text, t('Kopiert.'))

  return (
    <>
      <PageHeader title={t('Übersicht')} description={t('Stand der Rückmeldungen auf einen Blick.')} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t('Rückmeldungen')} value={s.responses} />
        <Stat label={t('Zusagen')} value={s.statusCounts?.yes ?? 0} hint={t('{n} Absagen', { n: s.statusCounts?.no ?? 0 })} />
        <Stat label={t('Gäste')} value={s.attendeesAttending} hint={t('Personen mit Zusage')} />
        <Stat label={t('Kinder')} value={s.children} />
      </div>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t('Weitergeben')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('Fertige Zusammenfassungen zum Einfügen in eine Mail oder Nachricht – ohne Kontaktdaten und Nachrichten der Gäste.')}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copy(venueText(title, responses))}>
            <Copy /> {t('Für die Location kopieren')}
          </Button>
          <Button variant="outline" onClick={() => copy(djText(title, responses))}>
            <Copy /> {t('Für den DJ kopieren')}
          </Button>
          <Button variant="outline" onClick={() => download('gaeste.csv', guestCsv(responses), 'text/csv;charset=utf-8')}>
            <Download /> {t('Gästeliste als Tabelle (CSV)')}
          </Button>
        </CardContent>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
              <div key={g} className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate">{genreIcon(g)} {g}</span>
                <progress className="wed-progress" value={n} max={genreMax} aria-hidden />
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
