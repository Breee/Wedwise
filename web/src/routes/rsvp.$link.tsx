import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { inviteLinkQuery } from '@/lib/queries'
import type { GuestView } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Done, RsvpForm, RsvpHeader } from '@/components/rsvp/RsvpForm'

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
  const finish = (v: GuestView) => {
    setSaved(v)
    setDone(v)
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <RsvpHeader />
      {status.pinRequired && !status.unlocked ? (
        <PinGate link={link} />
      ) : done ? (
        <Done view={done} onEdit={() => setDone(null)} />
      ) : (
        <RsvpForm link={link} initial={saved ?? undefined} onDone={finish} />
      )}
    </section>
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
