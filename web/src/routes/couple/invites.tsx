import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Copy, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { inviteLinksQuery } from '@/lib/queries'
import { formatDateTime } from '@/lib/format'
import type { InviteLink } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export const Route = createFileRoute('/couple/invites')({
  loader: ({ context }) => context.queryClient.ensureQueryData(inviteLinksQuery),
  component: InvitesPage,
})

const linkUrl = (token: string) => `${window.location.origin}/rsvp/${token}`

function InvitesPage() {
  const queryClient = useQueryClient()
  const { data: links } = useSuspenseQuery(inviteLinksQuery)
  const [pinTarget, setPinTarget] = useState<InviteLink | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: inviteLinksQuery.queryKey })
  const onError = (e: unknown) => toast.error(errorMessage(e))

  const create = useMutation({ mutationFn: () => api.post<InviteLink>('/invite-links'), onSuccess: refresh, onError })
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.put(`/invite-links/${id}/active`, { active }),
    onSuccess: refresh,
    onError,
  })
  const regenerate = useMutation({
    mutationFn: (id: number) => api.post(`/invite-links/${id}/regenerate`),
    onSuccess: () => {
      refresh()
      toast.success('Neuer Link erzeugt. Der alte Link funktioniert nicht mehr.')
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/invite-links/${id}`),
    onSuccess: refresh,
    onError,
  })

  const copy = (token: string) => navigator.clipboard.writeText(linkUrl(token)).then(() => toast.success('Link kopiert.'))

  return (
    <>
      <PageHeader
        title="Einladungslinks"
        description="Einen Link für alle oder mehrere Links für verschiedene Gruppen – optional mit PIN."
        action={
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="size-4" /> Neuer Link
          </Button>
        }
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Link</TableHead>
            <TableHead>PIN</TableHead>
            <TableHead>Antworten</TableHead>
            <TableHead>Erstellt</TableHead>
            <TableHead>Aktiv</TableHead>
            <TableHead className="text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                Noch keine Links. Erstellt einen und teilt ihn mit euren Gästen.
              </TableCell>
            </TableRow>
          )}
          {links.map((l) => (
            <TableRow key={l.id} className={l.active ? '' : 'opacity-60'}>
              <TableCell>
                <button type="button" onClick={() => copy(l.token)} className="flex items-center gap-2 font-mono text-xs hover:text-primary" title="Link kopieren">
                  {linkUrl(l.token)} <Copy className="size-3.5" />
                </button>
              </TableCell>
              <TableCell>{l.hasPin ? <Badge>PIN</Badge> : <span className="text-muted-foreground">–</span>}</TableCell>
              <TableCell>{l.responses}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(l.createdAt)}</TableCell>
              <TableCell>
                <Switch checked={l.active} onCheckedChange={(active) => setActive.mutate({ id: l.id, active })} aria-label="Aktiv" />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" title={l.hasPin ? 'PIN ändern' : 'PIN setzen'} onClick={() => setPinTarget(l)}>
                    <KeyRound className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Neuen Link erzeugen"
                    onClick={() => confirm('Der bisherige Link funktioniert danach nicht mehr. Fortfahren?') && regenerate.mutate(l.id)}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Löschen"
                    onClick={() => confirm('Link löschen? Bereits abgegebene Antworten bleiben erhalten.') && remove.mutate(l.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PinDialog link={pinTarget} onClose={() => setPinTarget(null)} onSaved={refresh} />
    </>
  )
}

function PinDialog({ link, onClose, onSaved }: { link: InviteLink | null; onClose: () => void; onSaved: () => void }) {
  const [pin, setPin] = useState('')
  const save = useMutation({
    mutationFn: (value: string) => api.put(`/invite-links/${link!.id}/pin`, { pin: value }),
    onSuccess: () => {
      onSaved()
      onClose()
      setPin('')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(pin)
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{link?.hasPin ? 'PIN ändern' : 'PIN setzen'}</DialogTitle>
            <DialogDescription>Gäste müssen die PIN eingeben, bevor sie antworten können. 4–64 Zeichen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value)} minLength={4} maxLength={64} required autoFocus autoComplete="off" />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {link?.hasPin ? (
              <Button type="button" variant="outline" onClick={() => save.mutate('')} disabled={save.isPending}>
                PIN entfernen
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={save.isPending || pin.length < 4}>
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
