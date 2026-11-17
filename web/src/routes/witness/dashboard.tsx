import { useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { contributionsQuery, responsesQuery, summaryQuery } from '@/lib/queries'
import type { Contribution } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Stat } from '@/components/admin/Stat'
import { ResponsesTable } from '@/components/admin/ResponsesTable'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Board } from '@/components/witness/Board'
import { Schedule } from '@/components/witness/Schedule'
import { ContributionDetail } from '@/components/witness/ContributionDetail'
import { isOpen, toMinutes } from '@/components/witness/contributions'

export const Route = createFileRoute('/witness/dashboard')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(contributionsQuery),
      context.queryClient.ensureQueryData(summaryQuery),
      context.queryClient.ensureQueryData(responsesQuery),
    ]),
  component: WitnessDashboard,
})

function WitnessDashboard() {
  const { data: contributions } = useSuspenseQuery(contributionsQuery)
  const { data: summary } = useSuspenseQuery(summaryQuery)
  const { data: responses } = useSuspenseQuery(responsesQuery)
  const [selected, setSelected] = useState<Contribution | null>(null)
  const open = contributions.filter(isOpen).length
  const confirmed = contributions.filter((c) => c.status === 'confirmed')
  const scheduled = contributions.filter((c) => c.status !== 'rejected' && toMinutes(c.slotTime) !== null).length
  const minutes = confirmed.reduce((sum, c) => sum + c.durationMinutes, 0)

  return (
    <>
      <PageHeader title={t('Beiträge')} description={t('Programmbeiträge der Gäste koordinieren.')} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t('Beiträge')} value={contributions.length} />
        <Stat label={t('Offen')} value={open} hint={t('neu oder mit Rückfrage')} />
        <Stat label={t('Bestätigt')} value={confirmed.length} hint={t('{n} Min. Programm', { n: minutes })} />
        <Stat label={t('Eingeplant')} value={scheduled} hint={t('von {n} Gästen mit Zusage', { n: summary.attendeesAttending })} />
      </div>

      <Part title={t('Status')}>
        {contributions.length === 0 ? (
          <p className="text-muted-foreground">{t('Noch keine Beiträge.')}</p>
        ) : (
          <Board items={contributions} onOpen={setSelected} />
        )}
      </Part>
      <Part>
        <Schedule items={contributions} onOpen={setSelected} />
      </Part>
      <Part title={t('Rückmeldungen')}>
        <ResponsesTable responses={responses} />
      </Part>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {selected && <ContributionDetail id={selected.id} onClose={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Part({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      {title && <h2 className="mb-4 font-display text-2xl">{title}</h2>}
      {children}
    </section>
  )
}
