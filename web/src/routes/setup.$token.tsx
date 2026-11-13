import { useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api'
import { createKey, webauthnSupported } from '@/lib/webauthn'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_PASSWORD = 10

export const Route = createFileRoute('/setup/$token')({
  loader: ({ params }) => api.get<{ username: string; displayName: string }>(`/setup/${params.token}`),
  component: SetupPage,
  errorComponent: () => (
    <Shell title={t('Link ungültig')} description={t('Dieser Einrichtungslink ist abgelaufen oder wurde schon benutzt. Bittet um einen neuen.')} />
  ),
})

function Shell({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
    </div>
  )
}

function SetupPage() {
  const { token } = Route.useParams()
  const user = Route.useLoaderData()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const save = useMutation({ mutationFn: () => api.post(`/setup/${token}`, { password }) })
  const passkey = useMutation({
    mutationFn: async () => {
      const options = await api.post<{ publicKey: unknown }>(`/setup/${token}/passkey/begin`)
      const credential = await createKey(options)
      await api.post(`/setup/${token}/passkey`, { credential })
    },
  })
  const mismatch = repeat !== '' && repeat !== password

  if (save.isSuccess || passkey.isSuccess) {
    return (
      <Shell
        title={t('Geschafft')}
        description={
          passkey.isSuccess
            ? t('Euer Passkey ist eingerichtet. Ihr könnt euch jetzt damit anmelden.')
            : t('Euer Passwort ist gesetzt. Ihr könnt euch jetzt anmelden.')
        }
      >
        <Button asChild className="w-full">
          <Link to="/login">{t('Zur Anmeldung')}</Link>
        </Button>
      </Shell>
    )
  }

  return (
    <Shell
      title={t('Hallo {name}', { name: user.displayName || user.username })}
      description={t('Richtet den Zugang für das Konto „{user}“ ein.', { user: user.username })}
    >
      {webauthnSupported() && (
        <div className="mb-6 space-y-3">
          <Button className="w-full" disabled={passkey.isPending} onClick={() => passkey.mutate()}>
            {t('Mit Passkey einrichten')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('Anmelden per Face ID, Fingerabdruck oder Geräte-PIN – ganz ohne Passwort.')}
          </p>
          {passkey.isError && (
            <p className="text-sm text-destructive">{t('Der Passkey konnte nicht eingerichtet werden.')}</p>
          )}
          <p className="pt-2 text-center text-xs tracking-widest text-muted-foreground uppercase">
            {t('oder Passwort festlegen')}
          </p>
        </div>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (password === repeat) save.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="s-password">{t('Passwort (mind. {n} Zeichen)', { n: MIN_PASSWORD })}</Label>
          <Input
            id="s-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD}
            maxLength={200}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-repeat">{t('Passwort wiederholen')}</Label>
          <Input
            id="s-repeat"
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
            autoComplete="new-password"
            aria-invalid={mismatch}
          />
          {mismatch && <p className="text-sm text-destructive">{t('Die Passwörter stimmen nicht überein.')}</p>}
        </div>
        {save.isError && <p className="text-sm text-destructive">{errorMessage(save.error)}</p>}
        <Button
          type="submit"
          variant={webauthnSupported() ? 'outline' : 'default'}
          className="w-full"
          disabled={save.isPending || mismatch}
        >
          {t('Passwort speichern')}
        </Button>
      </form>
    </Shell>
  )
}
