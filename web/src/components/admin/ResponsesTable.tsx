import { useState } from 'react'
import { t } from '@/lib/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { DIET_LABEL, DIET_OPTIONS, RSVP_STATUS_LABEL, formatDateTime } from '@/lib/format'
import type { Attendee, Diet, ResponseWithAttendees, RsvpStatus } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

const MAX_ATTENDEES = 10

const emptyAttendee = (): Attendee => ({ name: '', isChild: false, age: 0, photoOk: true, diet: 'none', allergies: '' })

function useResponseMutations(onDone: () => void) {
  const queryClient = useQueryClient()
  const refresh = () => {
    for (const key of ['responses', 'rsvp-summary', 'contributions']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
    onDone()
  }
  const save = useMutation({
    mutationFn: (r: ResponseWithAttendees) =>
      api.put(`/responses/${r.id}`, {
        contactName: r.contactName,
        email: r.email,
        phone: r.phone,
        status: r.status,
        message: r.message,
        musicGenres: r.musicGenres,
        musicSong: r.musicSong,
        attendees: r.status === 'yes' ? r.attendees.map(({ name, isChild, age, photoOk, diet, allergies }) => ({ name, isChild, age, photoOk, diet, allergies })) : [],
        contribution: null,
      }),
    onSuccess: () => {
      toast.success(t('Rückmeldung gespeichert.'))
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/responses/${id}`),
    onSuccess: () => {
      toast.success(t('Rückmeldung gelöscht.'))
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return { save, remove }
}

function EditForm({ initial, onClose }: { initial: ResponseWithAttendees; onClose: () => void }) {
  const [draft, setDraft] = useState(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { save, remove } = useResponseMutations(onClose)
  const busy = save.isPending || remove.isPending

  const setAttendee = (i: number, patch: Partial<Attendee>) =>
    setDraft((d) => ({ ...d, attendees: d.attendees.map((a, j) => (j === i ? { ...a, ...patch } : a)) }))

  const setStatus = (status: RsvpStatus) =>
    setDraft((d) => ({
      ...d,
      status,
      attendees: status === 'yes' && d.attendees.length === 0 ? [{ ...emptyAttendee(), name: d.contactName }] : d.attendees,
    }))

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(draft)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="r-name">{t('Kontakt')}</Label>
          <Input id="r-name" required value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="r-status">{t('Status')}</Label>
          <Select value={draft.status} onValueChange={(v) => setStatus(v as RsvpStatus)}>
            <SelectTrigger id="r-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">{RSVP_STATUS_LABEL.yes}</SelectItem>
              <SelectItem value="no">{RSVP_STATUS_LABEL.no}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {draft.status === 'yes' && (
        <div className="space-y-3">
          <Label>{t('Personen')}</Label>
          {draft.attendees.map((a, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Input aria-label={t('Name Person {n}', { n: i + 1 })} required placeholder={t('Name')} value={a.name} onChange={(e) => setAttendee(i, { name: e.target.value })} />
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <Checkbox checked={a.isChild} onCheckedChange={(v) => setAttendee(i, { isChild: v === true, photoOk: v !== true })} />
                  {t('Kind')}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('Person {n} entfernen', { n: i + 1 })}
                  disabled={draft.attendees.length === 1}
                  onClick={() => setDraft({ ...draft, attendees: draft.attendees.filter((_, j) => j !== i) })}
                >
                  <X className="size-4" />
                </Button>
              </div>
              {a.isChild && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Input aria-label={t('Alter Person {n}', { n: i + 1 })} type="number" min={0} max={17} placeholder={t('Alter')} className="w-20" value={a.age || ''} onChange={(e) => setAttendee(i, { age: Math.min(17, Math.max(0, Number(e.target.value) || 0)) })} />
                  <label className="flex items-center gap-2">
                    <Checkbox checked={a.photoOk} onCheckedChange={(v) => setAttendee(i, { photoOk: v === true })} />
                    {t('Fotos erlaubt')}
                  </label>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Select value={a.diet || 'none'} onValueChange={(v) => setAttendee(i, { diet: v as Diet })}>
                  <SelectTrigger aria-label={t('Essen Person {n}', { n: i + 1 })} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIET_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input aria-label={t('Allergien Person {n}', { n: i + 1 })} placeholder={t('Allergien')} value={a.allergies} onChange={(e) => setAttendee(i, { allergies: e.target.value })} />
              </div>
            </div>
          ))}
          {draft.attendees.length < MAX_ATTENDEES && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, attendees: [...draft.attendees, emptyAttendee()] })}>
              <Plus className="size-4" /> {t('Person hinzufügen')}
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="r-message">{t('Nachricht')}</Label>
        <Textarea id="r-message" rows={3} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('Wirklich löschen?')}</span>
            <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => remove.mutate(draft.id)}>
              {t('Ja, löschen')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              {t('Abbrechen')}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> {t('Löschen')}
          </Button>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Schließen')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('Speichern')}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

export function ResponsesTable({ responses }: { responses: ResponseWithAttendees[] }) {
  const [editing, setEditing] = useState<ResponseWithAttendees | null>(null)

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table className="block sm:table">
          <TableHeader className="hidden sm:table-header-group">
            <TableRow>
              <TableHead>{t('Kontakt')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Personen')}</TableHead>
              <TableHead>{t('Musik')}</TableHead>
              <TableHead>{t('Nachricht')}</TableHead>
              <TableHead className="text-right">{t('Eingegangen')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className="block sm:table-row-group">
            {responses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t('Noch keine Rückmeldungen.')}
                </TableCell>
              </TableRow>
            )}
            {responses.map((r) => (
              <TableRow key={r.id} className="relative flex flex-col gap-1 p-3 pr-24 whitespace-normal sm:table-row sm:p-0">
                <TableCell className="p-0 whitespace-normal sm:p-2 align-top font-medium">
                  {r.contactName}
                  {(r.email || r.phone) && (
                    <div className="text-xs font-normal text-muted-foreground">{[r.email, r.phone].filter(Boolean).join(' · ')}</div>
                  )}
                </TableCell>
                <TableCell className="p-0 whitespace-normal sm:p-2 align-top">
                  <Badge variant={r.status === 'yes' ? 'default' : 'secondary'}>{RSVP_STATUS_LABEL[r.status] ?? r.status}</Badge>
                </TableCell>
                <TableCell className="p-0 whitespace-normal sm:p-2 align-top">
                  <ul className="space-y-1 text-sm">
                    {r.attendees.map((a, i) => (
                      <li key={a.id ?? i}>
                        {a.name}
                        {a.isChild && <span className="text-muted-foreground"> ({t('Kind')}{a.age ? t(', {n} J.', { n: a.age }) : ''})</span>}
                        {a.isChild && !a.photoOk && <span className="font-medium text-destructive">{t(' · keine Fotos')}</span>}
                        <span className="text-muted-foreground">
                          {a.diet && a.diet !== 'none' ? ` · ${DIET_LABEL[a.diet] ?? a.diet}` : ''}
                          {a.allergies ? ` · ${a.allergies}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </TableCell>
                <TableCell className="p-0 whitespace-normal sm:p-2 max-w-xs align-top text-sm text-muted-foreground">
                  {r.musicGenres && <div>{r.musicGenres}</div>}
                  {r.musicSong && <div className="text-foreground">♪ {r.musicSong}</div>}
                </TableCell>
                <TableCell className="p-0 sm:p-2 max-w-xs align-top text-sm whitespace-pre-line text-muted-foreground">{r.message}</TableCell>
                <TableCell className="p-0 whitespace-normal sm:p-2 text-left align-top sm:text-right text-xs text-muted-foreground">{formatDateTime(r.submittedAt)}</TableCell>
                <TableCell className="absolute top-2 right-2 flex p-0 sm:static sm:p-2 align-top">
                  {r.editToken && <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 sm:size-9"
                    aria-label={t('Bearbeitungslink von {name} kopieren', { name: r.contactName })}
                    title={t('Bearbeitungslink kopieren')}
                    onClick={() =>
                      navigator.clipboard
                        .writeText(`${window.location.origin}/rsvp?token=${r.editToken}`)
                        .then(() => toast.success(t('Bearbeitungslink kopiert.')))
                    }
                  >
                    <Link2 className="size-4" />
                  </Button>}
                  <Button variant="ghost" size="icon" className="size-10 sm:size-9" aria-label={t('{name} bearbeiten', { name: r.contactName })} onClick={() => setEditing(r)}>
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('Rückmeldung bearbeiten')}</DialogTitle>
          </DialogHeader>
          {editing && <EditForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
