import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { CheckCircle2, Clock, KeyRound, Minus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { meQuery, publicContentQuery, rsvpQuery } from '@/lib/queries'
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
import { GENRES, NEEDS_OPTIONS, genreIcon, SongSearch, formatNeeds, joinList, parseNeeds, splitList } from '@/components/rsvp/music'
import { MESSENGERS, MessengerIcon } from '@/lib/contact'
import { rememberToken } from '@/lib/remember'
import { createKey, webauthnSupported } from '@/lib/webauthn'
import { PasskeyHelp } from '@/components/PasskeyHelp'
import { InstallApp } from '@/components/public/InstallApp'
import { GuestNotifications, Option } from '@/components/public/Notifications'

const MAX_ATTENDEES = 10

export function RsvpHeader() {
  return (
    <div className="mb-10 hidden text-center sm:block">
      <p className="text-xs font-medium tracking-[0.35em] text-primary uppercase">{t('Rückmeldung')}</p>
      <h1 className="mt-3 text-5xl">{t('Seid ihr dabei?')}</h1>
      <p className="mt-3 text-muted-foreground">{t('Wir freuen uns auf eure Antwort.')}</p>
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

const req = <span aria-hidden className="text-destructive">*</span>

const newAttendee = (name = ''): Attendee => ({ name, isChild: false, age: 0, photoOk: true, diet: 'none', allergies: '' })
const emptyContribution: ContributionRequest = { title: '', description: '', needs: '', phone: '', messengers: [] }

export function RsvpForm({ initial, link, onDone }: FormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: site } = useQuery(publicContentQuery)
  const genreOptions: readonly string[] = site?.event.musicGenres?.length ? site.event.musicGenres : GENRES
  const minutes = site?.event.contributionMinutes || 15

  const [contactName, setContactName] = useState(initial?.contactName ?? '')
  const [status, setStatus] = useState<RsvpStatus>(initial?.status ?? 'yes')
  const [attendees, setAttendees] = useState<Attendee[]>(initial?.attendees?.length ? initial.attendees : [newAttendee()])
  const [message, setMessage] = useState(initial?.message ?? '')
  const [genres, setGenres] = useState<string[]>(splitList(initial?.musicGenres ?? ''))
  const [song, setSong] = useState(initial?.musicSong ?? '')
  const [wantsContribution, setWantsContribution] = useState(Boolean(initial?.contribution))
  const [contribution, setContribution] = useState<ContributionRequest>(initial?.contribution ?? emptyContribution)
  const [needs, setNeeds] = useState(() => parseNeeds(initial?.contribution?.needs ?? ''))

  const attending = status === 'yes'
  const pages = attending
    ? (['who', 'status', 'count', 'people', 'contribution', 'music', 'message'] as const)
    : (['who', 'status', 'message'] as const)
  const [index, setIndex] = useState(0)
  const at = Math.min(index, pages.length - 1)
  const page = pages[at]
  const last = at === pages.length - 1
  const formRef = useRef<HTMLFormElement>(null)
  // Brings the start of the form into view when it is scrolled away; never jumps to the page top.
  const reveal = () =>
    requestAnimationFrame(() => {
      const top = formRef.current?.getBoundingClientRect().top ?? 0
      if (top < 0) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  const go = (next: number) => {
    setIndex(next)
    reveal()
    requestAnimationFrame(() => {
      const title = formRef.current?.querySelector<HTMLElement>('[data-slot=card-title]')
      if (!title) return
      title.tabIndex = -1
      title.style.outline = 'none'
      title.focus({ preventScroll: true })
    })
  }
  const Step = (_: { n?: number }) => (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">
        {t('Schritt {n} von {count}', { n: at + 1, count: pages.length })}
      </p>
      <progress className="wed-progress" value={at + 1} max={pages.length} aria-hidden />
    </div>
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
        attendees: attending ? attendees
              .filter((a) => a.name.trim())
              .map((a) => ({
                name: a.name,
                isChild: a.isChild,
                age: a.age,
                photoOk: a.photoOk,
                diet: a.diet,
                allergies: a.allergies,
              }))
          : [],
        contribution: attending && wantsContribution ? { ...contribution, needs: formatNeeds(needs.selected, needs.other) } : null,
      }
      return initial
        ? api.put<GuestView>(`/rsvp/${encodeURIComponent(initial.editToken)}`, body)
        : api.post<GuestView>(`/rsvp/links/${encodeURIComponent(link ?? '')}`, body)
    },
    onSuccess: (view) => {
      queryClient.setQueryData(rsvpQuery(view.editToken).queryKey, view)
      onDone(view)
      queryClient.invalidateQueries({ queryKey: ['rsvp', 'mine'] })
      queryClient.invalidateQueries({ queryKey: meQuery.queryKey })
      if (initial && !link) navigate({ to: '/rsvp', search: { token: view.editToken }, replace: true })
      reveal()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateAttendee = (i: number, patch: Partial<Attendee>) =>
    setAttendees((list) => list.map((a, k) => (k === i ? { ...a, ...patch } : a)))

  return (
    <>
      <motion.form
        ref={formRef}
        key={page}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex min-h-[calc(100svh-2rem)] flex-col gap-6 sm:min-h-0"
        onSubmit={(e) => {
          e.preventDefault()
          if (page === 'contribution' && wantsContribution && contribution.messengers.length === 0) {
            toast.error(t('Bitte mindestens einen Messenger auswählen.'))
            return
          }
          if (last) submit.mutate()
          else go(at + 1)
        }}
      >
        {page === 'who' && <Card>
          <CardHeader>
            {Step({ n: 1 })}
            <CardTitle>{t('Wer antwortet?')}</CardTitle>
            <CardDescription>{t('Eine Antwort pro Haushalt genügt.')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">{t('Name')} {req}</Label>
              <Input id="contactName" placeholder={t('z. B. Familie Müller oder Anna & Ben')} autoCapitalize="words" value={contactName} onChange={(e) => setContactName(e.target.value)} required autoComplete="name" enterKeyHint="next" />
            </div>
          </CardContent>
        </Card>}

        {page === 'status' && <Card>
          <CardHeader>
            {Step({ n: 2 })}
            <CardTitle>{t('Kommt ihr?')}</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={status} onValueChange={(v) => setStatus(v as RsvpStatus)} className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['yes', t('Ja, wir kommen!')],
                  ['no', t('Leider nicht')],
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
        </Card>}

        {page === 'count' && (
          <Card>
            <CardHeader>
              {Step({})}
              <CardTitle>{t('Wie viele seid ihr?')}</CardTitle>
              <CardDescription>{t('Bitte alle mitzählen, auch Kinder.')}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center gap-6">
              <Button type="button" variant="outline" size="icon" className="size-12 rounded-full" aria-label={t('Eine Person weniger')} disabled={attendees.length <= 1} onClick={() => setAttendees((l) => l.slice(0, -1))}>
                <Minus className="size-5" />
              </Button>
              <output className="w-16 text-center font-display text-5xl tabular-nums" aria-live="polite">{attendees.length}</output>
              <Button type="button" variant="outline" size="icon" className="size-12 rounded-full" aria-label={t('Eine Person mehr')} disabled={attendees.length >= MAX_ATTENDEES} onClick={() => setAttendees((l) => [...l, newAttendee()])}>
                <Plus className="size-5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {page === 'people' && (
          <Card>
            <CardHeader>
              {Step({ n: 3 })}
              <CardTitle>{t('Wer kommt?')}</CardTitle>
              <CardDescription>{t('Bitte alle Personen eintragen, auch Kinder.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {attendees.map((a, i) => (
                <div key={i} className="space-y-3 rounded-lg border bg-background/60 p-4">
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <Label htmlFor={`name-${i}`}>{t('{n}. Person', { n: i + 1 })} {req}</Label>
                    {attendees.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="-my-3 -mr-2 size-11 text-muted-foreground sm:size-9" title={t('Entfernen')} aria-label={t('Entfernen')} onClick={() => setAttendees((l) => l.filter((_, k) => k !== i))}>
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <Input id={`name-${i}`} placeholder={t('Name')} value={a.name} onChange={(e) => updateAttendee(i, { name: e.target.value })} required autoCapitalize="words" enterKeyHint="done" />
                  <PersonDetails attendee={a} index={i} update={(patch) => updateAttendee(i, patch)} />
                </div>
              ))}
              {attendees.length < MAX_ATTENDEES && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const next = attendees.length
                    setAttendees((l) => [...l, newAttendee()])
                    requestAnimationFrame(() => document.getElementById(`name-${next}`)?.focus())
                  }}
                >
                  <Plus className="size-4" /> {t('Person hinzufügen')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {page === 'contribution' && (
          <Card>
            <CardHeader>
              {Step({ n: 4 })}
              <CardTitle>{t('Möchtet ihr einen Beitrag zum Programm leisten?')}</CardTitle>
              <CardDescription>{t('Rede, Spiel, Musik, Überraschung – unsere Trauzeugen koordinieren alles und melden sich bei euch.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant={wantsContribution ? 'default' : 'outline'} onClick={() => setWantsContribution(true)}>
                  {t('Ja, gern')}
                </Button>
                <Button type="button" variant={!wantsContribution ? 'default' : 'outline'} onClick={() => setWantsContribution(false)}>
                  {t('Nein')}
                </Button>
              </div>
              {wantsContribution && (
                <div className="space-y-4">
                  <p className="flex items-start gap-2 rounded-md bg-accent/50 px-3 py-2 text-sm">
                    <Clock className="mt-0.5 size-4 shrink-0 text-primary" />
                    {t('Bitte plant maximal ca. {minutes} Minuten ein, damit alle Beiträge Platz finden.', { minutes })}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="c-title">{t('Was habt ihr vor?')} {req}</Label>
                    <Input id="c-title" value={contribution.title} onChange={(e) => setContribution({ ...contribution, title: e.target.value })} placeholder={t('z. B. Rede, Spiel, Lied')} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-desc">{t('Kurze Beschreibung')} <span className="font-normal text-muted-foreground">{t('(optional)')}</span></Label>
                    <Textarea id="c-desc" rows={3} value={contribution.description} onChange={(e) => setContribution({ ...contribution, description: e.target.value })} />
                  </div>
                  <div className="space-y-3">
                    <Label>{t('Was braucht ihr dafür?')}</Label>
                    <div className="flex flex-wrap gap-2">
                      {NEEDS_OPTIONS.map((o) => {
                        const on = needs.selected.includes(o)
                        return (
                          <Button
                            key={o}
                            type="button"
                            size="sm"
                            variant={on ? 'default' : 'outline'}
                            className="rounded-full border border-primary/60"
                            aria-pressed={on}
                            onClick={() => setNeeds((n) => ({ ...n, selected: on ? n.selected.filter((x) => x !== o) : [...n.selected, o] }))}
                          >
                            {t(o)}
                          </Button>
                        )
                      })}
                    </div>
                    <Input placeholder={t('Sonstiges …')} value={needs.other} onChange={(e) => setNeeds((n) => ({ ...n, other: e.target.value }))} />
                  </div>
                  <div className="space-y-3">
                    <Label>{t('Wie erreichen euch die Trauzeugen?')} {req}</Label>
                    <div className="flex flex-wrap gap-2">
                      {MESSENGERS.map((m) => {
                        const on = contribution.messengers.some((x) => x.kind === m.id)
                        return (
                          <Button
                            key={m.id}
                            type="button"
                            size="sm"
                            variant={on ? 'default' : 'outline'}
                            className="rounded-full border border-primary/60"
                            aria-pressed={on}
                            onClick={() =>
                              setContribution({
                                ...contribution,
                                messengers: on
                                  ? contribution.messengers.filter((x) => x.kind !== m.id)
                                  : [...contribution.messengers, { kind: m.id, handle: '' }],
                              })
                            }
                          >
                            <MessengerIcon kind={m.id} className={on ? 'size-4 [&>path]:fill-current' : 'size-4'} />
                            {m.label}
                          </Button>
                        )
                      })}
                    </div>
                    {contribution.messengers.map((m) => {
                      const meta = MESSENGERS.find((x) => x.id === m.kind)!
                      return (
                        <div key={m.kind} className="flex items-center gap-2">
                          <MessengerIcon kind={m.kind} className="size-5 shrink-0" />
                          <Input
                            aria-label={`${meta.label}: ${t(meta.handleHint)}`}
                            placeholder={t(meta.handleHint)}
                            value={m.handle}
                            required
                            onChange={(e) =>
                              setContribution({
                                ...contribution,
                                messengers: contribution.messengers.map((x) => (x.kind === m.kind ? { ...x, handle: e.target.value } : x)),
                              })
                            }
                          />
                        </div>
                      )
                    })}
                    {contribution.messengers.length === 0 && (
                      <p className="text-sm text-muted-foreground">{t('Bitte mindestens einen Messenger auswählen.')}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {page === 'music' && (
          <Card>
            <CardHeader>
              {Step({ n: 5 })}
              <CardTitle>{t('Musikwünsche')}</CardTitle>
              <CardDescription>{t('Was bringt euch auf die Tanzfläche?')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-1.5">
                {genreOptions.map((g) => {
                  const on = genres.includes(g)
                  return (
                    <Button
                      key={g}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      className="min-h-10 rounded-full border border-primary/60 px-2.5 sm:min-h-0"
                      aria-pressed={on}
                      onClick={() => setGenres((l) => (on ? l.filter((x) => x !== g) : [...l, g]))}
                    >
                      <span aria-hidden>{genreIcon(g)}</span> {g}
                    </Button>
                  )
                })}
              </div>
              <div className="space-y-2">
                <Label>{t('Euer Must-play-Song')} <span className="font-normal text-muted-foreground">{t('(optional)')}</span></Label>
                <SongSearch value={song} onChange={setSong} />
              </div>
            </CardContent>
          </Card>
        )}

        {page === 'message' && <Card>
          <CardHeader>
            {Step({ n: 6 })}
            <CardTitle className="flex items-center gap-2">
              {t('Nachricht an uns')} <span className="text-sm font-normal text-muted-foreground">{t('(optional)')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </CardContent>
        </Card>}

        <div className="sticky bottom-0 z-10 -mx-4 mt-auto bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:pt-2 sm:backdrop-blur-none">
          <div className="flex gap-3">
            {at > 0 && (
              <Button type="button" size="lg" variant="outline" onClick={() => go(at - 1)}>
                {t('Zurück')}
              </Button>
            )}
            <Button type="submit" size="lg" className="flex-1 shadow-lg sm:shadow-none" disabled={submit.isPending}>
              {!last ? t('Weiter') : submit.isPending ? t('Wird gesendet…') : initial ? t('Antwort aktualisieren') : t('Antwort absenden')}
            </Button>
          </div>
          {last && <p className="mt-2 text-center text-xs text-muted-foreground">{t('Eure Angaben sehen nur wir und unsere Trauzeugen.')}</p>}
        </div>
      </motion.form>
    </>
  )
}

const check = 'flex min-h-10 items-center gap-3 font-normal sm:min-h-8'

function PersonDetails({ attendee: a, index: i, update }: { attendee: Attendee; index: number; update: (patch: Partial<Attendee>) => void }) {
  const hasFood = (a.diet || 'none') !== 'none' || a.allergies.trim() !== ''
  const [open, setOpen] = useState(hasFood)
  const food = open || hasFood
  return (
    <>
      <div>
        <Label className={check}>
          <Checkbox checked={a.isChild} onCheckedChange={(c) => update({ isChild: c === true, photoOk: c !== true })} />
          {t('Kind')}
        </Label>
        <Label className={check}>
          <Checkbox
            checked={food}
            onCheckedChange={(c) => {
              if (c !== true) update({ diet: 'none', allergies: '' })
              setOpen(c === true)
            }}
          />
          {t('Besondere Ernährung oder Allergien')}
        </Label>
      </div>
      {a.isChild && (
        <div className="space-y-3 rounded-lg bg-secondary/40 p-3">
          <div className="flex items-center gap-3">
            <Label htmlFor={`age-${i}`}>{t('Alter')}</Label>
            <Input
              id={`age-${i}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={17}
              className="w-20"
              value={a.age || ''}
              onChange={(e) => update({ age: Math.min(17, Math.max(0, Number(e.target.value) || 0)) })}
            />
            <span className="text-sm text-muted-foreground">{t('Jahre')}</span>
          </div>
          <Label className="flex items-start gap-2 text-sm leading-snug font-normal">
            <Checkbox className="mt-0.5" checked={a.photoOk} onCheckedChange={(c) => update({ photoOk: c === true })} />
            <span>
              {t('Unsere Fotografin oder unser Fotograf darf {name} mit aufs Bild nehmen.', { name: a.name || t('euer Kind') })}
              <span className="mt-1 block text-muted-foreground">
                {t('Die Fotos bleiben eine private Erinnerung für uns und werden nicht veröffentlicht. Wenn ihr das lieber nicht möchtet, ist das völlig in Ordnung – lasst das Häkchen einfach weg.')}
              </span>
            </span>
          </Label>
        </div>
      )}
      {food && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>{t('Ernährung')}</Label>
            <Select value={a.diet || 'none'} onValueChange={(v) => update({ diet: v as Attendee['diet'] })}>
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
            <Label htmlFor={`allergies-${i}`}>{t('Allergien')}</Label>
            <Input id={`allergies-${i}`} value={a.allergies} onChange={(e) => update({ allergies: e.target.value })} />
          </div>
        </div>
      )}
    </>
  )
}

export function Done({ view, onEdit }: { view: GuestView; onEdit: () => void }) {
  useEffect(() => rememberToken(view.editToken), [view.editToken])
  const signedIn = useQuery(meQuery).data?.authenticated === true
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <Card>
        <CardContent className="space-y-6 py-10">
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto size-12 text-primary" />
            <h2 className="text-4xl">{t('Vielen Dank!')}</h2>
            <p className="text-muted-foreground">
              {view.status === 'no'
                ? t('Schade, dass ihr nicht dabei sein könnt. Wir denken an euch.')
                : t('Eure Rückmeldung ist angekommen. Wir freuen uns riesig auf euch!')}
            </p>
            {view.contribution && <p className="text-sm text-muted-foreground">{t('Euer Beitrag wurde an die Trauzeugen weitergeleitet.')}</p>}
          </div>
          <Button asChild size="lg" className="w-full">
            <Link to="/">{t('Alle Infos zur Hochzeit ansehen')}</Link>
          </Button>
          <div>
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{t('Wenn ihr mögt')}</p>
            <ul className="divide-y">
              <GuestNotifications compact />
              <InstallApp compact />
              {signedIn && <SavePasskey />}
            </ul>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {t('Etwas vertippt?')}{' '}
            <button type="button" className="font-medium text-primary underline underline-offset-4" onClick={onEdit}>
              {t('Antwort bearbeiten')}
            </button>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export function SavePasskey() {
  const queryClient = useQueryClient()
  const keys = useQuery({
    queryKey: ['account', '2fa'],
    queryFn: () => api.get<{ keys: unknown[] }>('/account/2fa'),
    retry: false,
  })
  const save = useMutation({
    mutationFn: async () => {
      const options = await api.post<{ publicKey: unknown }>('/account/2fa/keys/begin')
      const credential = await createKey(options)
      await api.post('/account/2fa/keys', { name: 'Passkey', credential })
    },
    onSuccess: () => {
      toast.success(t('Gesichert'))
      queryClient.invalidateQueries({ queryKey: ['account', '2fa'] })
    },
    onError: (e) => toast.error(errorMessage(e, t('Der Passkey konnte nicht gespeichert werden.'))),
  })
  if (!webauthnSupported() || !keys.data || keys.data.keys.length > 0) return null
  return (
    <>
      <Option icon={<KeyRound className="size-5" />} title={t('Mit Passkey sichern')} hint={t('Auf jedem Gerät ohne Passwort anmelden.')}>
        <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
          {t('Sichern')}
        </Button>
      </Option>
      {save.isError && (
        <li className="pb-3">
          <PasskeyHelp />
        </li>
      )}
    </>
  )
}
