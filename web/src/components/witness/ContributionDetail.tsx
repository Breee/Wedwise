import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone } from 'lucide-react'
import { contributionQuery } from '@/lib/queries'
import { CONTRIBUTION_STATUS_LABEL, formatDateTime } from '@/lib/format'
import type { ContributionStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUSES, useContributionMutations } from './contributions'

export function ContributionDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isPending } = useQuery(contributionQuery(id))
  const { setStatus, setSchedule, addNote } = useContributionMutations()
  const [note, setNote] = useState('')

  if (isPending || !data) return <p className="py-8 text-center text-muted-foreground">Lädt…</p>

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-3xl">{data.title || 'Ohne Titel'}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {data.contactName} ·{' '}
          <a href={`tel:${data.phone}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
            <Phone className="size-3" />
            {data.phone}
          </a>
        </p>
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
        {data.description && <p className="whitespace-pre-line">{data.description}</p>}
        {data.needs && (
          <div className="text-sm">
            <p className="text-muted-foreground">Benötigt</p>
            <p className="whitespace-pre-line">{data.needs}</p>
          </div>
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
        {Number(duration) > 15 && <p className="text-xs text-amber-700">Länger als die empfohlenen 15 Minuten.</p>}
      </div>
    </form>
  )
}
