import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { CheckCircle2, Clock, Copy, Minus, Plus, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { publicContentQuery, rsvpQuery } from '@/lib/queries'
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
import { MESSENGERS, MessengerIcon } from '@/lib/contact'
import { rememberToken } from '@/lib/remember'
import { InstallApp } from '@/components/public/InstallApp'
import { GuestNotifications } from '@/components/public/Notifications'

const MAX_ATTENDEES = 10

export function RsvpHeader() {
  return (
    <div className="mb-10 text-center">
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
  const stepCount = attending ? 6 : 3
  const Step = ({ n }: { n: number }) => (
    <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">
      {t('Schritt {n} von {count}', { n, count: stepCount })}
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
            <CardTitle>{t('Wer antwortet?')}</CardTitle>
            <CardDescription>{t('Eine Antwort pro Haushalt genügt.')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">{t('Name')}</Label>
              <Input id="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} required autoComplete="name" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Step n={2} />
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
        </Card>

        {attending && (
          <Card>
            <CardHeader>
              <Step n={3} />
              <CardTitle>{t('Wer kommt?')}</CardTitle>
              <CardDescription>{t('Bitte alle Personen eintragen, auch Kinder.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {attendees.map((a, i) => (
                <div key={i} className="space-y-4">
                  {i > 0 && <Separator />}
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`name-${i}`}>{t('Name')}</Label>
                      <Input id={`name-${i}`} value={a.name} onChange={(e) => updateAttendee(i, { name: e.target.value })} required />
                    </div>
                    <Label className="flex h-9 items-center gap-2 text-sm font-normal">
                      <Checkbox checked={a.isChild} onCheckedChange={(c) => updateAttendee(i, { isChild: c === true, photoOk: c !== true })} />
                      {t('Kind')}
                    </Label>
                    {attendees.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" title={t('Entfernen')} onClick={() => setAttendees((l) => l.filter((_, k) => k !== i))}>
                        <Minus className="size-4" />
                      </Button>
                    )}
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
                          onChange={(e) => updateAttendee(i, { age: Math.min(17, Math.max(0, Number(e.target.value) || 0)) })}
                        />
                        <span className="text-sm text-muted-foreground">{t('Jahre')}</span>
                      </div>
                      <Label className="flex items-start gap-2 text-sm leading-snug font-normal">
                        <Checkbox className="mt-0.5" checked={a.photoOk} onCheckedChange={(c) => updateAttendee(i, { photoOk: c === true })} />
                        <span>
                          {t('Unsere Fotografin oder unser Fotograf darf {name} mit aufs Bild nehmen.', { name: a.name || t('euer Kind') })}
                          <span className="mt-1 block text-muted-foreground">
                            {t('Die Fotos bleiben eine private Erinnerung für uns und werden nicht veröffentlicht. Wenn ihr das lieber nicht möchtet, ist das völlig in Ordnung – lasst das Häkchen einfach weg.')}
                          </span>
                        </span>
                      </Label>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('Ernährung')}</Label>
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
                      <Label htmlFor={`allergies-${i}`}>{t('Allergien')}</Label>
                      <Input id={`allergies-${i}`} value={a.allergies} onChange={(e) => updateAttendee(i, { allergies: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              {attendees.length < MAX_ATTENDEES && (
                <Button type="button" variant="outline" onClick={() => setAttendees((l) => [...l, newAttendee()])}>
                  <Plus className="size-4" /> {t('Person hinzufügen')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {attending && (
          <Card>
            <CardHeader>
              <Step n={4} />
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
                    <Label htmlFor="c-title">{t('Was habt ihr vor?')}</Label>
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
                            className="rounded-full"
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
                    <Label>{t('Wie erreichen euch die Trauzeugen?')}</Label>
                    <div className="flex flex-wrap gap-2">
                      {MESSENGERS.map((m) => {
                        const on = contribution.messengers.some((x) => x.kind === m.id)
                        return (
                          <Button
                            key={m.id}
                            type="button"
                            size="sm"
                            variant={on ? 'default' : 'outline'}
                            className="rounded-full"
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

        {attending && (
          <Card>
            <CardHeader>
              <Step n={5} />
              <CardTitle>{t('Musikwünsche')}</CardTitle>
              <CardDescription>{t('Was bringt euch auf die Tanzfläche?')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {genreOptions.map((g) => {
                  const on = genres.includes(g)
                  return (
                    <Button
                      key={g}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      className="min-h-10 rounded-full sm:min-h-0"
                      onClick={() => setGenres((l) => (on ? l.filter((x) => x !== g) : [...l, g]))}
                    >
                      {g}
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

        <Card>
          <CardHeader>
            <Step n={attending ? 6 : 3} />
            <CardTitle className="flex items-center gap-2">
              {t('Nachricht an uns')} <span className="text-sm font-normal text-muted-foreground">{t('(optional)')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-6 pb-4 sm:static sm:mx-0 sm:bg-none sm:p-0">
          <Button type="submit" size="lg" className="w-full shadow-lg sm:shadow-none" disabled={submit.isPending}>
            {submit.isPending ? t('Wird gesendet…') : initial ? t('Antwort aktualisieren') : t('Antwort absenden')}
          </Button>
        </div>
      </motion.form>
    </AnimatePresence>
  )
}

export function Done({ view, onEdit }: { view: GuestView; onEdit: () => void }) {
  useEffect(() => rememberToken(view.editToken), [view.editToken])
  const editUrl = `${window.location.origin}/rsvp?token=${encodeURIComponent(view.editToken)}`
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <Card className="text-center">
        <CardContent className="space-y-4 py-12">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <h2 className="text-4xl">{t('Vielen Dank!')}</h2>
          <p className="text-muted-foreground">
            {view.status === 'no'
              ? t('Schade, dass ihr nicht dabei sein könnt. Wir denken an euch.')
              : t('Eure Rückmeldung ist angekommen. Wir freuen uns riesig auf euch!')}
          </p>
          {view.contribution && <p className="text-sm text-muted-foreground">{t('Euer Beitrag wurde an die Trauzeugen weitergeleitet.')}</p>}
          <div className="mx-auto max-w-md space-y-2 pt-4 text-left">
            <Label className="text-xs text-muted-foreground">{t('Mit diesem Link könnt ihr eure Antwort später ändern:')}</Label>
            <div className="flex gap-2">
              <Input readOnly value={editUrl} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={t('Link kopieren')}
                onClick={() => navigator.clipboard.writeText(editUrl).then(() => toast.success(t('Link kopiert.')))}
              >
                <Copy className="size-4" />
              </Button>
              {typeof navigator.share === 'function' && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title={t('Link teilen')}
                  onClick={() => navigator.share({ title: t('Unsere Rückmeldung'), url: editUrl }).catch(() => undefined)}
                >
                  <Share2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <InstallApp />
          <GuestNotifications />
          <div className="flex flex-col items-center gap-3 pt-2">
            <Button asChild size="lg">
              <Link to="/">{t('Alle Infos zur Hochzeit ansehen')}</Link>
            </Button>
            <p className="text-sm text-muted-foreground">{t('Ablauf, Anreise und Unterkünfte findet ihr dort jederzeit wieder.')}</p>
            <Button variant="outline" onClick={onEdit}>
              {t('Antwort bearbeiten')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
