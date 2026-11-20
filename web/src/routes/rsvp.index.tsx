import { useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { meQuery, myResponseQuery, rsvpQuery } from '@/lib/queries'
import { forgetToken, rememberedToken } from '@/lib/remember'
import type { GuestView } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Done, PasskeyLogin, RsvpForm, RsvpHeader } from '@/components/rsvp/RsvpForm'

export const Route = createFileRoute('/rsvp/')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' && search.token ? search.token : undefined,
  }),
  component: EditResponsePage,
})

function EditResponsePage() {
  const { token: fromUrl } = Route.useSearch()
  const [deleted, setDeleted] = useState(false)
  const signedIn = useQuery(meQuery).data?.authenticated === true
  const own = useQuery({ ...myResponseQuery, enabled: signedIn && !fromUrl })
  const token = deleted ? undefined : (fromUrl ?? own.data?.editToken ?? rememberedToken() ?? undefined)
  const [done, setDone] = useState<GuestView | null>(null)
  const navigate = useNavigate()

  const waiting = signedIn && !fromUrl && own.isPending
  if (!waiting && !deleted && !done && !token && !signedIn) {
    return (
      <section className="mx-auto flex min-h-[70svh] max-w-sm flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
          <KeyRound className="size-6" />
        </span>
        <h1 className="mt-6 font-display text-4xl text-primary">{t('Meine Antwort')}</h1>
        <p className="mt-3 text-muted-foreground">{t('Meldet euch an, um eure Antwort zu sehen oder zu ändern.')}</p>
        <div className="mt-8 w-full">
          <PasskeyLogin onDone={(view) => navigate({ to: '/rsvp', search: { token: view.editToken }, replace: true })} />
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          {t('Noch nicht geantwortet? Öffnet den Link aus eurer Einladung.')}
        </p>
        <a href="/" className="mt-3 text-sm text-primary underline underline-offset-4">{t('Zur Hochzeitsseite')}</a>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <RsvpHeader />
      {waiting ? (
        <p className="text-center text-muted-foreground">{t('Lädt…')}</p>
      ) : deleted ? (
        <Notice text={t('Eure Antwort wurde gelöscht.')} />
      ) : done ? (
        <Done view={done} onEdit={() => setDone(null)} />
      ) : token ? (
        <ExistingResponse token={token} onDone={setDone} onDeleted={() => setDeleted(true)} />
      ) : (
        <Notice text={t('Zum Antworten braucht ihr den Einladungslink aus eurer Einladung.')} />
      )}
    </section>
  )
}

function ExistingResponse({
  token,
  onDone,
  onDeleted,
}: {
  token: string
  onDone: (view: GuestView) => void
  onDeleted: () => void
}) {
  const { data, isPending, error } = useQuery(rsvpQuery(token))
  const remove = useMutation({
    mutationFn: () => api.delete(`/rsvp/${encodeURIComponent(token)}`),
    onSuccess: () => {
      forgetToken()
      onDeleted()
    },
    onError: (err) => toast.error(errorMessage(err, t('Löschen fehlgeschlagen.'))),
  })
  if (isPending) return <p className="text-center text-muted-foreground">{t('Lädt…')}</p>
  if (error || !data) return <Notice text={errorMessage(error, t('Dieser Bearbeitungslink ist ungültig.'))} />
  return (
    <>
      <RsvpForm initial={data} onDone={onDone} />
      <div className="mt-8 text-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(t('Eure Antwort wirklich löschen? Das kann nicht rückgängig gemacht werden.'))) remove.mutate()
          }}
        >
          {t('Antwort löschen')}
        </Button>
      </div>
    </>
  )
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
