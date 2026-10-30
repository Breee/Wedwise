import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle2, Clock, Copy, Minus, Music, Plus } from 'lucide-react'
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
const emptyContribution: ContributionRequest = { title: '', description: '', needs: '', phone: '' }

export function RsvpForm({ initial, link, onDone }: FormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [contactName, setContactName] = useState(initial?.contactName ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [status, setStatus] = useState<RsvpStatus>(initial?.status ?? 'yes')
  const [attendees, setAttendees] = useState<Attendee[]>(initial?.attendees?.length ? initial.attendees : [newAttendee()])
  const [message, setMessage] = useState(initial?.message ?? '')
  const [wantsContribution, setWantsContribution] = useState(Boolean(initial?.contribution))
  const [contribution, setContribution] = useState<ContributionRequest>(initial?.contribution ?? emptyContribution)

  const attending = status === 'yes'

  const submit = useMutation({
    mutationFn: () => {
      const body: RsvpSubmit = {
        contactName,
        email,
        phone,
        status,
        message,
        attendees: attending ? attendees.filter((a) => a.name.trim()).map(({ id: _id, ...a }) => a) : [],
        contribution: attending && wantsContribution ? { ...contribution, phone: contribution.phone || phone } : null,
      }
      return initial
        ? api.put<GuestView>(`/rsvp/${encodeURIComponent(initial.editToken)}`, body)
        : api.post<GuestView>(`/rsvp/links/${encodeURIComponent(link ?? '')}`, body)
    },
    onSuccess: (view) => {
      queryClient.setQueryData(rsvpQuery(view.editToken).queryKey, view)
      onDone(view)
      navigate({ to: '/rsvp', search: { token: view.editToken }, replace: true })
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
            <CardTitle>Wer antwortet?</CardTitle>
            <CardDescription>Eine Antwort pro Haushalt genügt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">Name</Label>
              <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} required autoComplete="name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
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
                    {attendees.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" title="Entfernen" onClick={() => setAttendees((l) => l.filter((_, k) => k !== i))}>
                        <Minus className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                      <Label htmlFor={`allergies-${i}`}>Allergien / Unverträglichkeiten</Label>
                      <Input id={`allergies-${i}`} value={a.allergies} onChange={(e) => updateAttendee(i, { allergies: e.target.value })} />
                    </div>
                  </div>
                  <Label className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox checked={a.isChild} onCheckedChange={(c) => updateAttendee(i, { isChild: c === true })} />
                    Kind
                  </Label>
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
              <CardTitle>Möchtet ihr einen Beitrag zum Programm leisten?</CardTitle>
              <CardDescription>Rede, Spiel, Musik, Überraschung – unsere Trauzeugen koordinieren alles und melden sich bei euch.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant={wantsContribution ? 'default' : 'outline'} onClick={() => setWantsContribution(true)}>
                  Ja, gern
                </Button>
                <Button type="button" variant={!wantsContribution ? 'default' : 'outline'} onClick={() => setWantsContribution(false)}>
                  Nein, diesmal nicht
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
                  <div className="space-y-2">
                    <Label htmlFor="c-needs">Was braucht ihr dafür? <span className="font-normal text-muted-foreground">(Technik, Platz, Beamer …)</span></Label>
                    <Textarea id="c-needs" rows={2} value={contribution.needs} onChange={(e) => setContribution({ ...contribution, needs: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-phone">Telefonnummer für die Trauzeugen</Label>
                    <Input id="c-phone" type="tel" value={contribution.phone || phone} onChange={(e) => setContribution({ ...contribution, phone: e.target.value })} required autoComplete="tel" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Nachricht an uns <span className="text-sm font-normal text-muted-foreground">(optional)</span>
            </CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Music className="size-3.5" /> Musikwünsche gern hier hinein.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={submit.isPending}>
          {submit.isPending ? 'Wird gesendet…' : initial ? 'Antwort aktualisieren' : 'Antwort absenden'}
        </Button>
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
