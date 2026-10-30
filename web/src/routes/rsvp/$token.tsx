import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle2, Minus, Music, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { rsvpQuery } from '@/lib/queries'
import { DIET_OPTIONS } from '@/lib/format'
import type { Attendee, ContributionRequest, RsvpStatus, RsvpView } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

export const Route = createFileRoute('/rsvp/$token')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(rsvpQuery(params.token)),
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-xl px-6 py-32 text-center">
      <h1 className="text-4xl">Einladung nicht gefunden</h1>
      <p className="mt-3 text-muted-foreground">{errorMessage(error, 'Der Link ist ungültig oder nicht mehr aktiv.')}</p>
    </section>
  ),
  component: RsvpPage,
})

const newAttendee = (name = ''): Attendee => ({ name, attending: true, isChild: false, diet: '', allergies: '', notes: '' })

const emptyContribution: ContributionRequest = {
  title: '',
  category: '',
  description: '',
  participants: '',
  durationMinutes: 10,
  technicalRequirements: '',
  equipment: '',
  preferredTime: '',
  contactInformation: '',
}

function RsvpPage() {
  const { token } = Route.useParams()
  const { data } = useSuspenseQuery(rsvpQuery(token))
  const queryClient = useQueryClient()

  const [status, setStatus] = useState<RsvpStatus>(data.status === 'pending' ? 'yes' : data.status)
  const [attendees, setAttendees] = useState<Attendee[]>(
    data.attendees.length ? data.attendees : [newAttendee(data.invitation.maxGuests === 1 ? data.invitation.name : '')],
  )
  const [message, setMessage] = useState(data.message)
  const [step, setStep] = useState<'form' | 'contribution' | 'done'>(data.submitted ? 'done' : 'form')
  const [wantsContribution, setWantsContribution] = useState<boolean | null>(null)
  const [contribution, setContribution] = useState<ContributionRequest>(emptyContribution)
  const [contributionSent, setContributionSent] = useState(false)

  const max = data.invitation.maxGuests
  const attending = status === 'yes' || status === 'maybe'

  const submit = useMutation({
    mutationFn: () =>
      api.put<RsvpView>(`/rsvp/${encodeURIComponent(token)}`, {
        status,
        message,
        attendees: attending
          ? attendees.filter((a) => a.name.trim()).map(({ id: _id, ...a }) => a)
          : [],
      }),
    onSuccess: (view) => {
      queryClient.setQueryData(rsvpQuery(token).queryKey, view)
      setStep(attending ? 'contribution' : 'done')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const sendContribution = useMutation({
    mutationFn: () => api.post(`/rsvp/${encodeURIComponent(token)}/contributions`, contribution),
    onSuccess: () => {
      setContributionSent(true)
      setStep('done')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateAttendee = (i: number, patch: Partial<Attendee>) =>
    setAttendees((list) => list.map((a, k) => (k === i ? { ...a, ...patch } : a)))

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-10 text-center">
        <p className="text-xs font-medium tracking-[0.35em] text-primary uppercase">Rückmeldung</p>
        <h1 className="mt-3 text-5xl">{data.invitation.name}</h1>
        <p className="mt-3 text-muted-foreground">
          Wir freuen uns auf eure Antwort.{max > 1 && ` Diese Einladung gilt für bis zu ${max} Personen.`}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {step === 'form' && (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault()
              submit.mutate()
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Seid ihr dabei?</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={status} onValueChange={(v) => setStatus(v as RsvpStatus)} className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['yes', 'Ja, wir kommen!'],
                      ['maybe', 'Noch unsicher'],
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
                          <Select value={a.diet || 'none'} onValueChange={(v) => updateAttendee(i, { diet: v === 'none' ? '' : v })}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DIET_OPTIONS.map((o) => (
                                <SelectItem key={o.value || 'none'} value={o.value || 'none'}>
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
                  {attendees.length < max && (
                    <Button type="button" variant="outline" onClick={() => setAttendees((l) => [...l, newAttendee()])}>
                      <Plus className="size-4" /> Person hinzufügen
                    </Button>
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
              {submit.isPending ? 'Wird gesendet…' : data.submitted ? 'Antwort aktualisieren' : 'Antwort absenden'}
            </Button>
          </motion.form>
        )}

        {step === 'contribution' && (
          <motion.div key="contribution" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-6">
            <Card className="border-primary/30 bg-accent/30">
              <CardContent className="flex items-center gap-3 pt-6">
                <CheckCircle2 className="size-6 text-primary" />
                <p>Danke, eure Antwort ist gespeichert.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Möchtet ihr einen Beitrag zum Programm leisten?</CardTitle>
                <CardDescription>Rede, Spiel, Musik, Überraschung – unsere Trauzeugen koordinieren alles.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button type="button" variant={wantsContribution === true ? 'default' : 'outline'} onClick={() => setWantsContribution(true)}>
                    Ja, gern
                  </Button>
                  <Button type="button" variant={wantsContribution === false ? 'default' : 'outline'} onClick={() => setWantsContribution(false)}>
                    Nein, diesmal nicht
                  </Button>
                </div>
                {wantsContribution === true && (
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      sendContribution.mutate()
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="c-title">Was habt ihr vor?</Label>
                      <Input id="c-title" value={contribution.title} onChange={(e) => setContribution({ ...contribution, title: e.target.value })} placeholder="z. B. Rede, Spiel, Lied" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-desc">Kurze Beschreibung</Label>
                      <Textarea id="c-desc" rows={3} value={contribution.description} onChange={(e) => setContribution({ ...contribution, description: e.target.value })} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="c-dur">Dauer (Minuten)</Label>
                        <Input id="c-dur" type="number" min={1} max={120} value={contribution.durationMinutes} onChange={(e) => setContribution({ ...contribution, durationMinutes: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="c-part">Wer macht mit?</Label>
                        <Input id="c-part" value={contribution.participants} onChange={(e) => setContribution({ ...contribution, participants: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-tech">Was braucht ihr? <span className="font-normal text-muted-foreground">(Technik, Platz, Equipment)</span></Label>
                      <Textarea id="c-tech" rows={2} value={contribution.technicalRequirements} onChange={(e) => setContribution({ ...contribution, technicalRequirements: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="c-contact">Wie erreichen euch die Trauzeugen?</Label>
                      <Input id="c-contact" value={contribution.contactInformation} onChange={(e) => setContribution({ ...contribution, contactInformation: e.target.value })} placeholder="Telefon oder E-Mail" />
                    </div>
                    <Button type="submit" className="w-full" disabled={sendContribution.isPending}>
                      {sendContribution.isPending ? 'Wird gesendet…' : 'Beitrag anmelden'}
                    </Button>
                  </form>
                )}
                {wantsContribution === false && (
                  <Button type="button" className="w-full" onClick={() => setStep('done')}>
                    Fertig
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
            <Card className="text-center">
              <CardContent className="space-y-4 py-12">
                <CheckCircle2 className="mx-auto size-12 text-primary" />
                <h2 className="text-4xl">Vielen Dank!</h2>
                <p className="text-muted-foreground">
                  {data.status === 'no'
                    ? 'Schade, dass ihr nicht dabei sein könnt. Wir denken an euch.'
                    : 'Eure Rückmeldung ist angekommen. Wir freuen uns riesig auf euch!'}
                </p>
                {contributionSent && <p className="text-sm text-muted-foreground">Euer Beitrag wurde an die Trauzeugen weitergeleitet.</p>}
                <Button variant="outline" onClick={() => setStep('form')}>
                  Antwort bearbeiten
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
