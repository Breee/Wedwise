import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Copy, KeyRound, Plus, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { requireRole } from '@/lib/auth'
import { meQuery, usersQuery } from '@/lib/queries'
import type { Role, User } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const Route = createFileRoute('/admin/users')({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ['admin']),
  loader: ({ context }) => context.queryClient.ensureQueryData(usersQuery),
  component: UsersPage,
})

const ROLE_LABEL: Record<Role, string> = { couple: 'Brautpaar', witness: 'Trauzeug:in', admin: 'Admin' }

function UsersPage() {
  const queryClient = useQueryClient()
  const { data: users } = useSuspenseQuery(usersQuery)
  const { data: me } = useSuspenseQuery(meQuery)
  const [creating, setCreating] = useState(false)
  const [link, setLink] = useState<{ user: string; url: string } | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: usersQuery.queryKey })
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => api.put(`/users/${id}/active`, { active }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  })

  const newLink = useMutation({
    mutationFn: (u: User) =>
      api.post<{ setupUrl: string }>(`/users/${u.id}/setup-link`, {}).then((r) => ({ user: u.username, url: r.setupUrl })),
    onSuccess: setLink,
    onError: (e) => toast.error(errorMessage(e)),
  })

  const resetTwoFactor = useMutation({
    mutationFn: (u: User) => api.delete(`/two-factor/${u.id}`),
    onSuccess: () => toast.success('Zwei-Faktor-Anmeldung zurückgesetzt.'),
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader
        title="Benutzer"
        description="Wer sich anmelden darf – Brautpaar, Trauzeug:innen und Admins."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Neuer Benutzer
          </Button>
        }
      />
      <Table className="block sm:table">
        <TableHeader className="hidden sm:table-header-group">
          <TableRow>
            <TableHead>Benutzername</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Rolle</TableHead>
            <TableHead>Aktiv</TableHead>
            <TableHead className="text-right">Zugang</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="block sm:table-row-group">
          {users.map((u) => (
            <TableRow
              key={u.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 p-3 sm:table-row sm:p-0 ${u.active ? '' : 'opacity-60'}`}
            >
              <TableCell className="w-full p-0 font-medium sm:w-auto sm:p-2">{u.username}</TableCell>
              <TableCell className="p-0 text-muted-foreground sm:p-2">{u.displayName || '–'}</TableCell>
              <TableCell className="p-0 sm:p-2">
                <Badge variant="secondary">{ROLE_LABEL[u.role] ?? u.role}</Badge>
              </TableCell>
              <TableCell className="p-0 sm:p-2">
                <Switch
                  checked={u.active}
                  disabled={u.id === me.id}
                  onCheckedChange={(active) => setActive.mutate({ id: u.id, active })}
                  aria-label={`${u.username} aktiv`}
                />
              </TableCell>
              <TableCell className="ml-auto p-0 text-right sm:p-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 sm:size-9"
                  onClick={() => newLink.mutate(u)}
                  aria-label={`Einrichtungslink für ${u.username} erzeugen`}
                >
                  <KeyRound className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 sm:size-9"
                  onClick={() => {
                    if (window.confirm(`Zwei-Faktor-Anmeldung von ${u.username} zurücksetzen?`)) resetTwoFactor.mutate(u)
                  }}
                  aria-label={`Zwei-Faktor-Anmeldung von ${u.username} zurücksetzen`}
                >
                  <ShieldOff className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          {creating && (
            <CreateForm
              onDone={(created) => {
                setCreating(false)
                setLink(created)
                refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!link} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>{link && <SetupLink user={link.user} url={link.url} />}</DialogContent>
      </Dialog>
    </div>
  )
}

function CreateForm({ onDone }: { onDone: (created: { user: string; url: string }) => void }) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('witness')
  const create = useMutation({
    mutationFn: () => api.post<User & { setupUrl: string }>('/users', { username, displayName, role }),
    onSuccess: (u) => onDone({ user: u.username, url: u.setupUrl }),
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>Neuer Benutzer</DialogTitle>
        <DialogDescription>
          Ihr bekommt einen Einrichtungslink. Darüber legt die Person ihr Passwort selbst fest.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="u-username">Benutzername</Label>
        <Input id="u-username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={100} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="u-name">Name (optional)</Label>
        <Input id="u-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="u-role">Rolle</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger id="u-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={create.isPending}>
          Anlegen
        </Button>
      </DialogFooter>
    </form>
  )
}

function SetupLink({ user, url }: { user: string; url: string }) {
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Einrichtungslink für {user}</DialogTitle>
        <DialogDescription>
          Gebt den Link persönlich weiter. Er gilt 7 Tage und nur einmal – wir zeigen ihn nicht noch einmal an.
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label="Einrichtungslink" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Link kopieren"
          onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link kopiert.'))}
        >
          <Copy className="size-4" />
        </Button>
      </div>
    </div>
  )
}
