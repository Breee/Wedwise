import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { summaryQuery } from '@/lib/queries'
import { DIET_LABEL, RSVP_STATUS_LABEL } from '@/lib/format'
import { PageHeader } from '@/components/admin/PageHeader'
import { Stat } from '@/components/admin/Stat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/couple/dashboard')({
  loader: ({ context }) => context.queryClient.ensureQueryData(summaryQuery),
  component: CoupleDashboard,
})

function CoupleDashboard() {
  const { data: s } = useSuspenseQuery(summaryQuery)
  const statuses = Object.entries(s.statusCounts ?? {})
  const diets = Object.entries(s.dietCounts ?? {}).filter(([, n]) => n > 0)

  return (
    <>
      <PageHeader title="Übersicht" description="Stand der Rückmeldungen auf einen Blick." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Einladungen" value={s.invitations} hint={`${s.activeInvitations} aktiv`} />
        <Stat
          label="Rückmeldungen"
          value={s.respondedInvitations}
          hint={s.invitations ? `${Math.round((s.respondedInvitations / s.invitations) * 100)} % beantwortet` : undefined}
        />
        <Stat label="Zusagen" value={s.attendeesAttending} hint={`von ${s.attendeesTotal} Personen`} />
        <Stat label="Kinder" value={s.children} />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statuses.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Rückmeldungen.</p>}
            {statuses.map(([k, n]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span>{RSVP_STATUS_LABEL[k] ?? k}</span>
                <Badge variant="secondary">{n}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
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
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {s.allergies.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Keine Angaben.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
