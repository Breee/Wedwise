import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { guestsQuery, invitationsQuery } from '@/lib/queries'
import type { Guest } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const Route = createFileRoute('/couple/guests')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(guestsQuery),
      context.queryClient.ensureQueryData(invitationsQuery),
    ]),
  component: GuestsPage,
})

type GuestForm = { displayName: string; email: string; invitationId: number; notes: string }
const empty: GuestForm = { displayName: '', email: '', invitationId: 0, notes: '' }

function GuestsPage() {
  const { data: guests } = useSuspenseQuery(guestsQuery)
  const { data: invitations } = useSuspenseQuery(invitationsQuery)
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['guests'] })
  const onError = (e: unknown) => toast.error(errorMessage(e))

  const [editing, setEditing] = useState<Guest | null | 'new'>(null)
  const [form, setForm] = useState<GuestForm>(empty)
  const invitationName = (id: number) => invitations.find((i) => i.id === id)?.name ?? '—'

  const openNew = () => {
    setForm({ ...empty, invitationId: invitations[0]?.id ?? 0 })
    setEditing('new')
  }
  const openEdit = (g: Guest) => {
    setForm({ displayName: g.displayName, email: g.email, invitationId: g.invitationId, notes: g.notes })
    setEditing(g)
  }

  const save = useMutation({
    mutationFn: () =>
      editing === 'new' || editing === null
        ? api.post('/guests', form)
        : api.put(`/guests/${editing.id}`, form),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      toast.success('Gespeichert.')
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (g: Guest) => api.delete(`/guests/${g.id}`),
    onSuccess: () => {
      invalidate()
      toast.success('Gast gelöscht.')
    },
    onError,
  })

  return (
    <>
      <PageHeader
        title="Gäste"
        description="Gästeliste mit Zuordnung zu Einladungen."
        action={
          <Button onClick={openNew} disabled={invitations.length === 0}>
            <Plus className="size-4" /> Gast hinzufügen
          </Button>
        }
      />
      {invitations.length === 0 && (
        <p className="mb-4 text-sm text-muted-foreground">Lege zuerst eine Einladung an, um Gäste zuzuordnen.</p>
      )}
      {guests.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Gäste.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Einladung</TableHead>
                <TableHead>Notizen</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.displayName}</TableCell>
                  <TableCell className="text-muted-foreground">{g.email || '—'}</TableCell>
                  <TableCell>{invitationName(g.invitationId)}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{g.notes || '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" title="Bearbeiten" onClick={() => openEdit(g)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Löschen"
                      onClick={() => confirm(`„${g.displayName}“ wirklich löschen?`) && remove.mutate(g)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Gast hinzufügen' : 'Gast bearbeiten'}</DialogTitle>
          </DialogHeader>
          <form
            id="guest-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="g-name">Name</Label>
              <Input id="g-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-email">E-Mail</Label>
              <Input id="g-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Einladung</Label>
              <Select value={String(form.invitationId)} onValueChange={(v) => setForm({ ...form, invitationId: Number(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Einladung wählen" />
                </SelectTrigger>
                <SelectContent>
                  {invitations.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="g-notes">Notizen</Label>
              <Textarea id="g-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </form>
          <DialogFooter>
            <Button type="submit" form="guest-form" disabled={save.isPending}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
