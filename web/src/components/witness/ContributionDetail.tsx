import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { contributionQuery, publicContentQuery } from '@/lib/queries'
import { CONTRIBUTION_STATUS_LABEL, formatDateTime } from '@/lib/format'
import type { ContributionStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUSES, useContributionMutations } from './contributions'
import { ContactLinks } from './ContactLinks'

export function ContributionDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isPending } = useQuery(contributionQuery(id))
  const { setStatus, setSchedule, addNote, updateContent } = useContributionMutations()
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)

  if (isPending || !data) return <p className="py-8 text-center text-muted-foreground">Lädt…</p>

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-3xl">{data.title || 'Ohne Titel'}</DialogTitle>
        <p className="text-sm text-muted-foreground">{data.contactName}</p>
        <ContactLinks phone={data.phone} messengers={data.messengers} />
      </DialogHeader>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Status</span>
          <Select value={data.status} onValueChange={(v) => setStatus.mutate({ id, status: v as ContributionStatus })}>
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
        {editing ? (
          <ContentForm
            initial={data}
            pending={updateContent.isPending}
            onCancel={() => setEditing(false)}
            onSave={(content) =>
              updateContent.mutate(
                { id, ...content, phone: data.phone, messengers: data.messengers.map((m) => ({ ...m, handle: m.handle || data.phone })) },
                { onSuccess: () => setEditing(false) },
              )
            }
          />
        ) : (
          <>
            {data.description && <p className="whitespace-pre-line">{data.description}</p>}
            {data.needs && (
              <div className="text-sm">
                <p className="text-muted-foreground">Benötigt</p>
                <p className="whitespace-pre-line">{data.needs}</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Beitrag bearbeiten
            </Button>
          </>
        )}

        <ScheduleForm
          key={`${data.slotTime}-${data.durationMinutes}`}
          slotTime={data.slotTime}
          durationMinutes={data.durationMinutes}
          pending={setSchedule.isPending}
          onSave={(slotTime, durationMinutes) => setSchedule.mutate({ id, slotTime, durationMinutes })}
        />

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
              if (!note.trim()) return
              addNote.mutate({ id, text: note }, { onSuccess: () => setNote('') })
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

type Content = { title: string; description: string; needs: string }

function ContentForm({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial: Content
  pending: boolean
  onSave: (content: Content) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [needs, setNeeds] = useState(initial.needs)

  return (
    <form
      className="grid gap-3 rounded-lg border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title, description, needs })
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="e-title">Titel</Label>
        <Input id="e-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="e-description">Beschreibung</Label>
        <Textarea id="e-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="e-needs">Benötigt</Label>
        <Textarea id="e-needs" rows={2} value={needs} onChange={(e) => setNeeds(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={pending || !title.trim()}>
          Speichern
        </Button>
      </div>
    </form>
  )
}

function ScheduleForm({
  slotTime,
  durationMinutes,
  pending,
  onSave,
}: {
  slotTime: string
  durationMinutes: number
  pending: boolean
  onSave: (slotTime: string, durationMinutes: number) => void
}) {
  const [time, setTime] = useState(slotTime)
  const [duration, setDuration] = useState(durationMinutes ? String(durationMinutes) : '')
  const limit = useQuery(publicContentQuery).data?.event.contributionMinutes || 15
  const dirty = time !== slotTime || (Number(duration) || 0) !== durationMinutes

  return (
    <form
      className="rounded-lg border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(time, Number(duration) || 0)
      }}
    >
      <h4 className="text-xl">Ablaufplan</h4>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="slot-time">Uhrzeit</Label>
          <Input id="slot-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="duration">Dauer (Min.)</Label>
          <Input
            id="duration"
            type="number"
            min={0}
            max={120}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-28"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!dirty || pending}>
          Speichern
        </Button>
        {Number(duration) > limit && <p className="text-xs text-amber-700">Länger als die empfohlenen {limit} Minuten.</p>}
      </div>
    </form>
  )
}
