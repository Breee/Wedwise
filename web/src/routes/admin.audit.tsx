import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { requireRole } from '@/lib/auth'
import { formatDateTime } from '@/lib/format'
import { auditLogQuery } from '@/lib/queries'
import { PageHeader } from '@/components/admin/PageHeader'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const Route = createFileRoute('/admin/audit')({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ['admin']),
  loader: ({ context }) => context.queryClient.ensureQueryData(auditLogQuery),
  component: AuditPage,
})

// Known actions get a readable name; anything else shows as recorded.
const LABELS: [RegExp, string][] = [
  [/^login$/, 'Anmeldung'],
  [/^login\.failed$/, 'Anmeldung fehlgeschlagen'],
  [/^logout$/, 'Abmeldung'],
  [/^link\.copy$/, 'Link kopiert'],
  [/^PUT \/api\/responses\/\{id\}$/, 'Rückmeldung bearbeitet'],
  [/^DELETE \/api\/responses\/\{id\}$/, 'Rückmeldung gelöscht'],
  [/^POST \/api\/responses\/delete$/, 'Rückmeldungen gelöscht'],
  [/^POST \/api\/responses\/?$/, 'Rückmeldung angelegt'],
  [/^POST \/api\/invite-links\/?$/, 'Einladungslink erstellt'],
  [/^DELETE \/api\/invite-links\//, 'Einladungslink gelöscht'],
  [/^POST \/api\/invite-links\/\{id\}\/regenerate$/, 'Einladungslink neu erzeugt'],
  [/^PUT \/api\/invite-links\//, 'Einladungslink geändert'],
  [/^POST \/api\/users\/?$/, 'Benutzer angelegt'],
  [/^DELETE \/api\/users\//, 'Benutzer gelöscht.'],
  [/^(PUT|POST) \/api\/users\//, 'Benutzer geändert'],
  [/^PUT \/api\/content/, 'Inhalte geändert'],
  [/^POST \/api\/push\/broadcast$/, 'Nachricht gesendet'],
  [/^DELETE \/api\/messages\//, 'Nachricht gelöscht'],
  [/^(PUT|POST) \/api\/contributions/, 'Beitrag geändert'],
  [/\/api\/account\/password/, 'Eigenes Passwort geändert'],
  [/\/api\/(account\/2fa|two-factor)/, 'Zwei-Faktor geändert'],
  [/^POST \/api\/uploads$/, 'Bild hochgeladen'],
]

function label(action: string) {
  const known = LABELS.find(([pattern]) => pattern.test(action))
  return known ? t(known[1]).replace(/\.$/, '') : action
}

function AuditPage() {
  const { data: entries } = useSuspenseQuery(auditLogQuery)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader
        title={t('Protokoll')}
        description={t('Wer hat wann was geändert oder gelöscht. Inhalte werden nicht gespeichert.')}
      />
      {entries.length === 0 ? (
        <p className="text-muted-foreground">{t('Noch keine Einträge.')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Zeit')}</TableHead>
                <TableHead>{t('Benutzer')}</TableHead>
                <TableHead>{t('Aktion')}</TableHead>
                <TableHead>{t('Ziel')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.at)}</TableCell>
                  <TableCell className="font-medium">{e.username || '–'}</TableCell>
                  <TableCell title={e.action}>{label(e.action)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.target}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
