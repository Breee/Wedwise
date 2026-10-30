import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { contributionQuery, contributionsQuery, summaryQuery } from '@/lib/queries'
import { CONTRIBUTION_STATUS_LABEL, formatDateTime } from '@/lib/format'
import type { Contribution, ContributionStatus } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Stat } from '@/components/admin/Stat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const Route = createFileRoute('/witness/dashboard')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(contributionsQuery),
      context.queryClient.ensureQueryData(summaryQuery),
    ]),
  component: WitnessDashboard,
})

const STATUSES = Object.keys(CONTRIBUTION_STATUS_LABEL) as ContributionStatus[]

function WitnessDashboard() {
  const { data: contributions } = useSuspenseQuery(contributionsQuery)
  const { data: summary } = useSuspenseQuery(summaryQuery)
  const [selected, setSelected] = useState<Contribution | null>(null)
  const totalMinutes = contributions
    .filter((c) => c.status !== 'rejected')
    .reduce((sum, c) => sum + (c.durationMinutes || 0), 0)

  return (
    <>
      <PageHeader title="Beiträge" description="Programmbeiträge der Gäste koordinieren." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Beiträge" value={contributions.length} />
        <Stat label="Geplante Minuten" value={totalMinutes} hint="ohne abgelehnte" />
        <Stat label="Zusagen" value={summary.attendeesAttending} hint={`von ${summary.attendeesTotal}`} />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {contributions.length === 0 && <p className="text-muted-foreground">Noch keine Beiträge.</p>}
        {contributions.map((c) => (
          <Card key={c.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setSelected(c)}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-2xl">{c.title || 'Ohne Titel'}</h3>
                <Badge variant={c.status === 'confirmed' ? 'default' : 'secondary'}>
                  {CONTRIBUTION_STATUS_LABEL[c.status] ?? c.status}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {c.durationMinutes ? `${c.durationMinutes} Min.` : 'Dauer offen'}
                {c.preferredTime && ` · ${c.preferredTime}`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {selected && <ContributionDetail id={selected.id} onClose={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ContributionDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data, isPending } = useQuery(contributionQuery(id))
  const [note, setNote] = useState('')
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['contributions'] })
  }
  const onError = (e: unknown) => toast.error(errorMessage(e))

  const setStatus = useMutation({
    mutationFn: (status: ContributionStatus) => {
      const { id: _id, invitationId: _i, createdAt: _c, updatedAt: _u, notes: _n, ...rest } = data!
      return api.put(`/contributions/${id}`, { ...rest, status })
    },
    onSuccess: () => {
      invalidate()
      toast.success('Status aktualisiert.')
    },
    onError,
  })
  const addNote = useMutation({
    mutationFn: () => api.post(`/contributions/${id}/notes`, { text: note }),
    onSuccess: () => {
      setNote('')
      invalidate()
    },
    onError,
  })

  if (isPending || !data) return <p className="py-8 text-center text-muted-foreground">Lädt…</p>

  const rows: [string, string][] = [
    ['Kategorie', data.category === 'other' ? '' : data.category],
    ['Mitwirkende', data.participants],
    ['Dauer', data.durationMinutes ? `${data.durationMinutes} Minuten` : ''],
    ['Wunschzeit', data.preferredTime],
    ['Technik', data.technicalRequirements],
    ['Equipment', data.equipment],
    ['Kontakt', data.contactInformation],
  ]

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-3xl">{data.title || 'Ohne Titel'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Status</span>
          <Select value={data.status} onValueChange={(v) => setStatus.mutate(v as ContributionStatus)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CONTRIBUTION_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data.description && <p className="whitespace-pre-line">{data.description}</p>}
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="whitespace-pre-line">{v}</dd>
              </div>
            ))}
        </dl>
        <div>
          <h4 className="text-xl">Notizen</h4>
          <ul className="mt-2 space-y-2">
            {data.notes?.length === 0 && <li className="text-sm text-muted-foreground">Noch keine Notizen.</li>}
            {data.notes?.map((n) => (
              <li key={n.id} className="rounded-md bg-muted px-3 py-2 text-sm">
                <p className="whitespace-pre-line">{n.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (note.trim()) addNote.mutate()
            }}
          >
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz hinzufügen…" />
            <Button type="submit" disabled={addNote.isPending || !note.trim()}>
              Hinzufügen
            </Button>
          </form>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </div>
    </>
  )
}
