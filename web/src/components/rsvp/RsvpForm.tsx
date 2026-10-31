import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle2, Clock, Copy, Minus, Plus, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { rsvpQuery } from '@/lib/queries'
import { DIET_OPTIONS } from '@/lib/format'
import type { Attendee, ContributionRequest, GuestView, RsvpStatus, RsvpSubmit } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { GENRES, NEEDS_OPTIONS, SongSearch, formatNeeds, joinList, parseNeeds, splitList } from '@/components/rsvp/music'
import { MESSENGERS } from '@/lib/contact'

const MAX_ATTENDEES = 10

export function RsvpHeader() {
  return (
    <div className="mb-10 text-center">
      <p className="text-xs font-medium tracking-[0.35em] text-primary uppercase">Rückmeldung</p>
      <h1 className="mt-3 text-5xl">Seid ihr dabei?</h1>
      <p className="mt-3 text-muted-foreground">Wir freuen uns auf eure Antwort.</p>
    </div>
  )
}

export type FormProps = {
  /** Existing response to edit. */
  initial?: GuestView
  /** Invite link token used for new responses. */
  link?: string
  onDone: (view: GuestView) => void
}

const newAttendee = (name = ''): Attendee => ({ name, isChild: false, diet: 'none', allergies: '' })
const emptyContribution: ContributionRequest = { title: '', description: '', needs: '', phone: '', messengers: [], matrixId: '' }

export function RsvpForm({ initial, link, onDone }: FormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [contactName, setContactName] = useState(initial?.contactName ?? '')
  const [status, setStatus] = useState<RsvpStatus>(initial?.status ?? 'yes')
  const [attendees, setAttendees] = useState<Attendee[]>(initial?.attendees?.length ? initial.attendees : [newAttendee()])
  const [message, setMessage] = useState(initial?.message ?? '')
  const [genres, setGenres] = useState<string[]>(splitList(initial?.musicGenres ?? ''))
  const [song, setSong] = useState(initial?.musicSong ?? '')
  const [wantsContribution, setWantsContribution] = useState(Boolean(initial?.contribution))
  const [contribution, setContribution] = useState<ContributionRequest>(initial?.contribution ?? emptyContribution)
  const [needs, setNeeds] = useState(() => parseNeeds(initial?.contribution?.needs ?? ''))

  const [moreContact, setMoreContact] = useState(Boolean(initial?.contribution?.matrixId))

  const attending = status === 'yes'
  const stepCount = attending ? 6 : 3
  const Step = ({ n }: { n: number }) => (
    <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">
      Schritt {n} von {stepCount}
    </p>
  )

  const submit = useMutation({
    mutationFn: () => {
      const body: RsvpSubmit = {
        contactName,
        email: initial?.email ?? '',
        phone: initial?.phone ?? '',
        status,
        message,
        musicGenres: attending ? joinList(genres) : '',
        musicSong: attending ? song : '',
        attendees: attending ? attendees.filter((a) => a.name.trim()).map(({ id: _id, ...a }) => a) : [],
        contribution: attending && wantsContribution ? { ...contribution, needs: formatNeeds(needs.selected, needs.other) } : null,
      }
      return initial
        ? api.put<GuestView>(`/rsvp/${encodeURIComponent(initial.editToken)}`, body)
        : api.post<GuestView>(`/rsvp/links/${encodeURIComponent(link ?? '')}`, body)
    },
    onSuccess: (view) => {
      queryClient.setQueryData(rsvpQuery(view.editToken).queryKey, view)
      onDone(view)
      if (initial) navigate({ to: '/rsvp', search: { token: view.editToken }, replace: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateAttendee = (i: number, patch: Partial<Attendee>) =>
    setAttendees((list) => list.map((a, k) => (k === i ? { ...a, ...patch } : a)))

  return (
    <AnimatePresence mode="wait">
      <motion.form
        key="form"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
      >
        <Card>
          <CardHeader>
            <Step n={1} />
            <CardTitle>Wer antwortet?</CardTitle>
            <CardDescription>Eine Antwort pro Haushalt genügt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">Name</Label>
              <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} required autoComplete="name" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Step n={2} />
            <CardTitle>Kommt ihr?</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={status} onValueChange={(v) => setStatus(v as RsvpStatus)} className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['yes', 'Ja, wir kommen!'],
                  ['no', 'Leider nicht'],
                ] as const
              ).map(([v, label]) => (
                <Label
                  key={v}
                  htmlFor={`status-${v}`}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60"
                >
                  <RadioGroupItem id={`status-${v}`} value={v} />
                  {label}
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {attending && (
          <Card>
            <CardHeader>
              <Step n={3} />
              <CardTitle>Wer kommt?</CardTitle>
              <CardDescription>Bitte alle Personen eintragen, auch Kinder.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {attendees.map((a, i) => (
                <div key={i} className="space-y-4">
                  {i > 0 && <Separator />}
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`name-${i}`}>Name</Label>
                      <Input id={`name-${i}`} value={a.name} onChange={(e) => updateAttendee(i, { name: e.target.value })} required />
                    </div>
                    <Label className="flex h-9 items-center gap-2 text-sm font-normal">
                      <Checkbox checked={a.isChild} onCheckedChange={(c) => updateAttendee(i, { isChild: c === true })} />
                      Kind
                    </Label>
                    {attendees.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" title="Entfernen" onClick={() => setAttendees((l) => l.filter((_, k) => k !== i))}>
                        <Minus className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Ernährung</Label>
                      <Select value={a.diet || 'none'} onValueChange={(v) => updateAttendee(i, { diet: v as Attendee['diet'] })}>
                        <SelectTrigger className="w-full">
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
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`allergies-${i}`}>Allergien</Label>
                      <Input id={`allergies-${i}`} value={a.allergies} onChange={(e) => updateAttendee(i, { allergies: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              {attendees.length < MAX_ATTENDEES && (
                <Button type="button" variant="outline" onClick={() => setAttendees((l) => [...l, newAttendee()])}>
                  <Plus className="size-4" /> Person hinzufügen
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {attending && (
          <Card>
            <CardHeader>
              <Step n={4} />
              <CardTitle>Möchtet ihr einen Beitrag zum Programm leisten?</CardTitle>
              <CardDescription>Rede, Spiel, Musik, Überraschung – unsere Trauzeugen koordinieren alles und melden sich bei euch.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant={wantsContribution ? 'default' : 'outline'} onClick={() => setWantsContribution(true)}>
                  Ja, gern
                </Button>
                <Button type="button" variant={!wantsContribution ? 'default' : 'outline'} onClick={() => setWantsContribution(false)}>
                  Nein
                </Button>
              </div>
              {wantsContribution && (
                <div className="space-y-4">
                  <p className="flex items-start gap-2 rounded-md bg-accent/50 px-3 py-2 text-sm">
                    <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
                    Bitte plant maximal ca. 15 Minuten ein, damit alle Beiträge Platz finden.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="c-title">Was habt ihr vor?</Label>
                    <Input id="c-title" value={contribution.title} onChange={(e) => setContribution({ ...contribution, title: e.target.value })} placeholder="z. B. Rede, Spiel, Lied" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-desc">Kurze Beschreibung <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Textarea id="c-desc" rows={3} value={contribution.description} onChange={(e) => setContribution({ ...contribution, description: e.target.value })} />
                  </div>
                  <div className="space-y-3">
                    <Label>Was braucht ihr dafür?</Label>
                    <div className="flex flex-wrap gap-2">
                      {NEEDS_OPTIONS.map((o) => {
                        const on = needs.selected.includes(o)
                        return (
                          <Button
                            key={o}
                            type="button"
                            size="sm"
                            variant={on ? 'default' : 'outline'}
                            className="rounded-full"
                            aria-pressed={on}
                            onClick={() => setNeeds((n) => ({ ...n, selected: on ? n.selected.filter((x) => x !== o) : [...n.selected, o] }))}
                          >
                            {o}
                          </Button>
                        )
                      })}
                    </div>
                    <Input placeholder="Sonstiges …" value={needs.other} onChange={(e) => setNeeds((n) => ({ ...n, other: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-phone">Telefonnummer für die Trauzeugen</Label>
                    <Input id="c-phone" type="tel" value={contribution.phone} onChange={(e) => setContribution({ ...contribution, phone: e.target.value })} required autoComplete="tel" />
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                      {MESSENGERS.map((m) => (
                        <Label key={m.id} className="flex items-center gap-2 font-normal">
                          <Checkbox
                            checked={contribution.messengers.includes(m.id)}
                            onCheckedChange={(v) =>
                              setContribution({
                                ...contribution,
                                messengers: v ? [...contribution.messengers, m.id] : contribution.messengers.filter((x) => x !== m.id),
                              })
                            }
                          />
                          {m.label}
                        </Label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Unter dieser Nummer erreichbar per …</p>
                  </div>
                  {moreContact ? (
                    <div className="space-y-2">
                      <Label htmlFor="c-matrix">Matrix (optional)</Label>
                      <Input id="c-matrix" value={contribution.matrixId} onChange={(e) => setContribution({ ...contribution, matrixId: e.target.value })} placeholder="@name:matrix.org" />
                    </div>
                  ) : (
                    <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setMoreContact(true)}>
                      Weitere Kontaktmöglichkeit (Matrix)
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {attending && (
          <Card>
            <CardHeader>
              <Step n={5} />
              <CardTitle>Musikwünsche</CardTitle>
              <CardDescription>Was bringt euch auf die Tanzfläche?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => {
                  const on = genres.includes(g)
                  return (
                    <Button
                      key={g}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      className="rounded-full"
                      onClick={() => setGenres((l) => (on ? l.filter((x) => x !== g) : [...l, g]))}
                    >
                      {g}
                    </Button>
                  )
                })}
              </div>
              <div className="space-y-2">
                <Label>Euer Must-play-Song <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <SongSearch value={song} onChange={setSong} />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <Step n={attending ? 6 : 3} />
            <CardTitle className="flex items-center gap-2">
              Nachricht an uns <span className="text-sm font-normal text-muted-foreground">(optional)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-6 pb-4 sm:static sm:mx-0 sm:bg-none sm:p-0">
          <Button type="submit" size="lg" className="w-full shadow-lg sm:shadow-none" disabled={submit.isPending}>
            {submit.isPending ? 'Wird gesendet…' : initial ? 'Antwort aktualisieren' : 'Antwort absenden'}
          </Button>
        </div>
      </motion.form>
    </AnimatePresence>
  )
}

export function Done({ view, onEdit }: { view: GuestView; onEdit: () => void }) {
  const editUrl = `${window.location.origin}/rsvp?token=${encodeURIComponent(view.editToken)}`
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <Card className="text-center">
        <CardContent className="space-y-4 py-12">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <h2 className="text-4xl">Vielen Dank!</h2>
          <p className="text-muted-foreground">
            {view.status === 'no'
              ? 'Schade, dass ihr nicht dabei sein könnt. Wir denken an euch.'
              : 'Eure Rückmeldung ist angekommen. Wir freuen uns riesig auf euch!'}
          </p>
          {view.contribution && <p className="text-sm text-muted-foreground">Euer Beitrag wurde an die Trauzeugen weitergeleitet.</p>}
          <div className="mx-auto max-w-md space-y-2 pt-4 text-left">
            <Label className="text-xs text-muted-foreground">Mit diesem Link könnt ihr eure Antwort später ändern:</Label>
            <div className="flex gap-2">
              <Input readOnly value={editUrl} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Link kopieren"
                onClick={() => navigator.clipboard.writeText(editUrl).then(() => toast.success('Link kopiert.'))}
              >
                <Copy className="size-4" />
              </Button>
              {typeof navigator.share === 'function' && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Link teilen"
                  onClick={() => navigator.share({ title: 'Unsere Rückmeldung', url: editUrl }).catch(() => undefined)}
                >
                  <Share2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={onEdit}>
            Antwort bearbeiten
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
