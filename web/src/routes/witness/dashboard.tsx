import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { contributionsQuery, summaryQuery } from '@/lib/queries'
import { CONTRIBUTION_STATUS_LABEL, formatDateTime } from '@/lib/format'
import type { Contribution } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Stat } from '@/components/admin/Stat'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Board } from '@/components/witness/Board'
import { Schedule } from '@/components/witness/Schedule'
import { ContributionDetail } from '@/components/witness/ContributionDetail'
import { ContactLinks } from '@/components/witness/ContactLinks'
import { STATUS_TONE, isOpen, toMinutes } from '@/components/witness/contributions'

export const Route = createFileRoute('/witness/dashboard')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(contributionsQuery),
      context.queryClient.ensureQueryData(summaryQuery),
    ]),
  component: WitnessDashboard,
})

function WitnessDashboard() {
  const { data: contributions } = useSuspenseQuery(contributionsQuery)
  const { data: summary } = useSuspenseQuery(summaryQuery)
  const [selected, setSelected] = useState<Contribution | null>(null)
  const open = contributions.filter(isOpen).length
  const confirmed = contributions.filter((c) => c.status === 'confirmed')
  const scheduled = contributions.filter((c) => c.status !== 'rejected' && toMinutes(c.slotTime) !== null).length
  const minutes = confirmed.reduce((sum, c) => sum + c.durationMinutes, 0)

  return (
    <>
      <PageHeader title="Beiträge" description="Programmbeiträge der Gäste koordinieren." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Beiträge" value={contributions.length} />
        <Stat label="Offen" value={open} hint="neu oder mit Rückfrage" />
        <Stat label="Bestätigt" value={confirmed.length} hint={`${minutes} Min. Programm`} />
        <Stat label="Eingeplant" value={scheduled} hint={`von ${summary.attendeesAttending} Gästen mit Zusage`} />
      </div>

      <Tabs defaultValue="board" className="mt-8">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">Liste</TabsTrigger>
          <TabsTrigger value="schedule">Ablaufplan</TabsTrigger>
        </TabsList>
        <TabsContent value="board" className="mt-4">
          {contributions.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Beiträge.</p>
          ) : (
            <Board items={contributions} onOpen={setSelected} />
          )}
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <ContributionTable items={contributions} onOpen={setSelected} />
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <Schedule items={contributions} onOpen={setSelected} />
        </TabsContent>
      </Tabs>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {selected && <ContributionDetail id={selected.id} onClose={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ContributionTable({ items, onOpen }: { items: Contribution[]; onOpen: (c: Contribution) => void }) {
  if (items.length === 0) return <p className="text-muted-foreground">Noch keine Beiträge.</p>
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Beitrag</TableHead>
            <TableHead>Von</TableHead>
            <TableHead>Benötigt</TableHead>
            <TableHead>Uhrzeit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Eingereicht</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((c) => (
            <TableRow key={c.id} className="cursor-pointer" onClick={() => onOpen(c)}>
              <TableCell className="font-medium">{c.title || 'Ohne Titel'}</TableCell>
              <TableCell>
                {c.contactName}
                <ContactLinks phone={c.phone} messengers={c.messengers} className="mt-1" />
              </TableCell>
              <TableCell className="max-w-56 truncate text-muted-foreground">{c.needs || '–'}</TableCell>
              <TableCell className="tabular-nums">
                {c.slotTime || '–'}
                {c.durationMinutes > 0 && <span className="text-muted-foreground"> · {c.durationMinutes} Min.</span>}
              </TableCell>
              <TableCell>
                <span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_TONE[c.status])}>
                  {CONTRIBUTION_STATUS_LABEL[c.status]}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(c.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
