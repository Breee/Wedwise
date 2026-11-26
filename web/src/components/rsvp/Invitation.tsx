import { useState } from 'react'
import { t } from '@/lib/i18n'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { inviteLinkQuery, meQuery, myResponseQuery } from '@/lib/queries'
import { greeting } from '@/lib/format'
import type { GuestView } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Done, RsvpForm, RsvpHeader } from '@/components/rsvp/RsvpForm'
import { InviteStory } from '@/components/rsvp/InviteStory'

// The invitation pages and the reply form of one invite link. `lit` means the
// opening already showed the couple's names, so they do not appear again.
export function Invitation({ link, lit }: { link: string; lit?: boolean }) {
  const { data: status } = useSuspenseQuery(inviteLinkQuery(link))
  const [done, setDone] = useState<GuestView | null>(null)
  const [saved, setSaved] = useState<GuestView | null>(null)
  const signedIn = useQuery(meQuery).data?.authenticated === true
  const own = useQuery({ ...myResponseQuery, enabled: signedIn })
  const finish = (v: GuestView) => {
    setSaved(v)
    setDone(v)
  }

  const locked = status.pinRequired && !status.unlocked
  return (
    <>
      {!locked && !done && <InviteStory target="antwort" name={greeting(status.guests, status.salutation)} lit={lit} />}
      <section id="antwort" className="mx-auto min-h-svh max-w-2xl snap-start snap-always px-4 py-4 sm:px-6 sm:py-16">
        <RsvpHeader />
        {locked ? (
          <PinGate link={link} />
        ) : done ? (
          <Done view={done} onEdit={() => setDone(null)} />
        ) : (
          <RsvpForm key={own.data?.id ?? 0} link={link} guests={status.guests} initial={saved ?? own.data ?? undefined} onDone={finish} />
        )}
      </section>
    </>
  )
}

function PinGate({ link }: { link: string }) {
  const queryClient = useQueryClient()
  const [pin, setPin] = useState('')
  const unlock = useMutation({
    mutationFn: () => api.post(`/rsvp/links/${encodeURIComponent(link)}/unlock`, { pin }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inviteLinkQuery(link).queryKey }),
    onError: (e) => toast.error(errorMessage(e, t('Die PIN ist leider nicht richtig.'))),
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
          <CardDescription>{t('Die PIN findet ihr auf eurer Einladung.')}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Input value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" autoFocus autoComplete="off" inputMode="numeric" required />
          <Button type="submit" disabled={unlock.isPending || !pin.trim()}>
            {t('Weiter')}
          </Button>
        </CardContent>
      </Card>
    </motion.form>
  )
}
