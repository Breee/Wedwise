import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Copy, Globe, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { invitationsQuery } from '@/lib/queries'
import type { Invitation } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/couple/invitations')({
  loader: ({ context }) => context.queryClient.ensureQueryData(invitationsQuery),
  component: InvitationsPage,
})

function rsvpLink(inv: Invitation) {
  return inv.url ?? `${location.origin}/rsvp/${inv.token}`
}

function InvitationsPage() {
  const { data: invitations } = useSuspenseQuery(invitationsQuery)
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['invitations'] })
  const onError = (e: unknown) => toast.error(errorMessage(e))

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [maxGuests, setMaxGuests] = useState(2)

  const create = useMutation({
    mutationFn: () => api.post('/invitations', { name, maxGuests }),
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setName('')
      setMaxGuests(2)
      toast.success('Einladung erstellt.')
    },
    onError,
  })
  const toggleActive = useMutation({
    mutationFn: (inv: Invitation) =>
      api.put(`/invitations/${inv.id}`, { name: inv.name, maxGuests: inv.maxGuests, active: !inv.active }),
    onSuccess: invalidate,
    onError,
  })
  const regenerate = useMutation({
    mutationFn: (inv: Invitation) => api.post(`/invitations/${inv.id}/regenerate-token`),
    onSuccess: () => {
      invalidate()
      toast.success('Neuer Link erzeugt.')
    },
    onError,
  })
  const setPublic = useMutation({
    mutationFn: (inv: Invitation) => api.post(`/invitations/${inv.id}/set-public`, { public: !inv.isPublic }),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (inv: Invitation) => api.delete(`/invitations/${inv.id}`),
    onSuccess: () => {
      invalidate()
      toast.success('Einladung gelöscht.')
    },
    onError,
  })

  const copy = async (inv: Invitation) => {
    await navigator.clipboard.writeText(rsvpLink(inv))
    toast.success('Link kopiert.')
  }

  return (
    <>
      <PageHeader
        title="Einladungen"
        description="Jede Einladung hat einen eigenen Link für die Rückmeldung."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Neue Einladung
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neue Einladung</DialogTitle>
              </DialogHeader>
              <form
                id="create-invitation"
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  create.mutate()
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="inv-name">Name</Label>
                  <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Familie Müller" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-max">Max. Personen</Label>
                  <Input id="inv-max" type="number" min={1} max={20} value={maxGuests} onChange={(e) => setMaxGuests(Number(e.target.value))} required />
                </div>
              </form>
              <DialogFooter>
                <Button type="submit" form="create-invitation" disabled={create.isPending}>
                  Erstellen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {invitations.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Einladungen.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Personen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.name}</TableCell>
                  <TableCell>{inv.maxGuests}</TableCell>
                  <TableCell className="space-x-1">
                    <Badge variant={inv.active ? 'default' : 'outline'}>{inv.active ? 'Aktiv' : 'Inaktiv'}</Badge>
                    {inv.isPublic && <Badge variant="secondary">Öffentlich</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon-sm" title="Link kopieren" onClick={() => copy(inv)}>
                        <Copy className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title="Neuen Link erzeugen" onClick={() => regenerate.mutate(inv)}>
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title={inv.isPublic ? 'Nicht mehr öffentlich' : 'Als öffentliche Einladung setzen'} onClick={() => setPublic.mutate(inv)}>
                        <Globe className={inv.isPublic ? 'size-4 text-primary' : 'size-4'} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate(inv)}>
                        {inv.active ? 'Deaktivieren' : 'Aktivieren'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Löschen"
                        onClick={() => confirm(`„${inv.name}“ wirklich löschen?`) && remove.mutate(inv)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
