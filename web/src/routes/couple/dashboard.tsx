import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { responsesQuery, summaryQuery } from '@/lib/queries'
import { DIET_LABEL, RSVP_STATUS_LABEL, formatDateTime } from '@/lib/format'
import { PageHeader } from '@/components/admin/PageHeader'
import { Stat } from '@/components/admin/Stat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

  return (
    <>
      <PageHeader title="Übersicht" description="Stand der Rückmeldungen auf einen Blick." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Rückmeldungen" value={s.responses} />
        <Stat label="Zusagen" value={s.statusCounts?.yes ?? 0} hint={`${s.statusCounts?.no ?? 0} Absagen`} />
        <Stat label="Gäste" value={s.attendeesAttending} hint="Personen mit Zusage" />
        <Stat label="Kinder" value={s.children} />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ernährung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {diets.length === 0 && <p className="text-sm text-muted-foreground">Keine Angaben.</p>}
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
            <CardTitle>Allergien & Unverträglichkeiten</CardTitle>
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
              <p className="text-sm text-muted-foreground">Keine Angaben.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-12 text-3xl">Rückmeldungen</h2>
      <div className="mt-4 rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kontakt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Personen</TableHead>
              <TableHead>Nachricht</TableHead>
              <TableHead className="text-right">Eingegangen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Noch keine Rückmeldungen.
                </TableCell>
              </TableRow>
            )}
            {responses.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="align-top">
                  <div className="font-medium">{r.contactName}</div>
                  <div className="text-xs text-muted-foreground">{[r.email, r.phone].filter(Boolean).join(' · ')}</div>
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant={r.status === 'yes' ? 'default' : 'secondary'}>{RSVP_STATUS_LABEL[r.status] ?? r.status}</Badge>
                </TableCell>
                <TableCell className="align-top">
                  <ul className="space-y-0.5 text-sm">
                    {r.attendees?.map((a) => (
                      <li key={a.id}>
                        {a.name}
                        {a.isChild && <span className="text-muted-foreground"> (Kind)</span>}
                        <span className="text-muted-foreground">
                          {a.diet && a.diet !== 'none' ? ` · ${DIET_LABEL[a.diet] ?? a.diet}` : ''}
                          {a.allergies ? ` · ${a.allergies}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </TableCell>
                <TableCell className="max-w-xs align-top text-sm whitespace-pre-line text-muted-foreground">{r.message}</TableCell>
                <TableCell className="text-right align-top text-xs text-muted-foreground">{formatDateTime(r.submittedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
