import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { CalendarDays, Lock, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { inviteLinkQuery, publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import type { GuestView } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Done, RsvpForm, RsvpHeader } from '@/components/rsvp/RsvpForm'
import { InviteIntro } from '@/components/rsvp/InviteIntro'

export const Route = createFileRoute('/rsvp/$link')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(inviteLinkQuery(params.link)),
  errorComponent: ({ error }) => (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <RsvpHeader />
      <Card className="text-center">
        <CardContent className="py-10 text-muted-foreground">
          {errorMessage(error, 'Dieser Einladungslink ist nicht gültig.')}
        </CardContent>
      </Card>
    </section>
  ),
  component: InviteLinkPage,
})

function InviteLinkPage() {
  const { link } = Route.useParams()
  const { data: status } = useSuspenseQuery(inviteLinkQuery(link))
  const [done, setDone] = useState<GuestView | null>(null)
  const [saved, setSaved] = useState<GuestView | null>(null)
  const [step, setStep] = useState<Step>('welcome')
  const go = (next: Step) => {
    setStep(next)
    window.scrollTo({ top: 0 })
  }
  const finish = (v: GuestView) => {
    setSaved(v)
    setDone(v)
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <InviteIntro />
      <RsvpHeader />
      {status.pinRequired && !status.unlocked ? (
        <PinGate link={link} />
      ) : done ? (
        <Done view={done} onEdit={() => setDone(null)} />
      ) : step === 'welcome' ? (
        <Welcome onNext={() => go('schedule')} />
      ) : step === 'schedule' ? (
        <ScheduleStep onBack={() => go('welcome')} onNext={() => go('form')} />
      ) : (
        <RsvpForm link={link} initial={saved ?? undefined} onDone={finish} />
      )}
    </section>
  )
}

type Step = 'welcome' | 'schedule' | 'form'

function Welcome({ onNext }: { onNext: () => void }) {
  const { data } = useQuery(publicContentQuery)
  const location = data?.content.location
  const address = [location?.name, location?.address].filter(Boolean).join(', ')
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <CardDescription>Schritt 1 von 3</CardDescription>
          <CardTitle className="text-3xl">Schön, dass ihr da seid</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {data?.content.introduction?.text
            .split(/\n{2,}/)
            .filter(Boolean)
            .map((t, i) => (
              <p key={i} className="whitespace-pre-line text-muted-foreground">
                {t}
              </p>
            ))}
          <ul className="space-y-2 rounded-lg bg-secondary/50 p-4 text-sm">
            {data?.event.date && (
              <li className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-primary" /> {formatDate(data.event.date)}
              </li>
            )}
            {address && (
              <li className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-primary" /> {address}
              </li>
            )}
          </ul>
          <Button className="w-full" size="lg" onClick={onNext}>
            Weiter zum Ablauf
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function ScheduleStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { data } = useQuery(publicContentQuery)
  const schedule = [...(data?.content.schedule ?? [])].sort((a, b) => a.order - b.order)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <CardDescription>Schritt 2 von 3</CardDescription>
          <CardTitle className="text-3xl">So läuft der Tag</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="space-y-4 border-l border-border pl-5">
            {schedule.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute top-2 -left-[25px] size-2 rounded-full bg-primary" />
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-xl text-primary">{entry.time}</span>
                  <span className="font-medium">{entry.title}</span>
                </p>
                {entry.description && <p className="text-sm text-muted-foreground">{entry.description}</p>}
              </li>
            ))}
          </ol>
          <div className="flex gap-3">
            <Button variant="outline" size="lg" onClick={onBack}>
              Zurück
            </Button>
            <Button className="flex-1" size="lg" onClick={onNext}>
              Weiter zur Rückmeldung
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function PinGate({ link }: { link: string }) {
  const queryClient = useQueryClient()
  const [pin, setPin] = useState('')
  const unlock = useMutation({
    mutationFn: () => api.post(`/rsvp/links/${encodeURIComponent(link)}/unlock`, { pin }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inviteLinkQuery(link).queryKey }),
    onError: (e) => toast.error(errorMessage(e, 'Die PIN ist leider nicht richtig.')),
  })

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(e) => {
        e.preventDefault()
        unlock.mutate()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-5 text-primary" /> PIN
          </CardTitle>
          <CardDescription>Die PIN findet ihr auf eurer Einladung.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Input value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" autoFocus autoComplete="off" inputMode="numeric" required />
          <Button type="submit" disabled={unlock.isPending || !pin.trim()}>
            Weiter
          </Button>
        </CardContent>
      </Card>
    </motion.form>
  )
}
