import { useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { errorMessage } from '@/lib/api'
import { rsvpQuery } from '@/lib/queries'
import { rememberedToken } from '@/lib/remember'
import type { GuestView } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Done, RsvpForm, RsvpHeader } from '@/components/rsvp/RsvpForm'

export const Route = createFileRoute('/rsvp/')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' && search.token ? search.token : undefined,
  }),
  component: EditResponsePage,
})

function EditResponsePage() {
  const { token: fromUrl } = Route.useSearch()
  const token = fromUrl ?? rememberedToken() ?? undefined
  const [done, setDone] = useState<GuestView | null>(null)

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <RsvpHeader />
      {done ? (
        <Done view={done} onEdit={() => setDone(null)} />
      ) : token ? (
        <ExistingResponse token={token} onDone={setDone} />
      ) : (
        <Notice text={t('Zum Antworten braucht ihr den Einladungslink aus eurer Einladung.')} />
      )}
    </section>
  )
}

function ExistingResponse({ token, onDone }: { token: string; onDone: (view: GuestView) => void }) {
  const { data, isPending, error } = useQuery(rsvpQuery(token))
  if (isPending) return <p className="text-center text-muted-foreground">{t('Lädt…')}</p>
  if (error || !data) return <Notice text={errorMessage(error, t('Dieser Bearbeitungslink ist ungültig.'))} />
  return <RsvpForm initial={data} onDone={onDone} />
}

function Notice({ text }: { text: string }) {
  return (
    <Card className="text-center">
      <CardContent className="py-10 text-muted-foreground">
        {text}
        <a href="/" className="mt-4 block text-primary underline underline-offset-4">{t('Zur Hochzeitsseite')}</a>
      </CardContent>
    </Card>
  )
}
