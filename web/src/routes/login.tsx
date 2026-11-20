import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { t } from '@/lib/i18n'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { ApiError, api, errorMessage } from '@/lib/api'
import { autofillSupported, createKey, signWithKey, webauthnSupported } from '@/lib/webauthn'
import { meQuery } from '@/lib/queries'
import { dashboardFor } from '@/lib/auth'
import type { Me } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/login')({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } =>
    typeof s.redirect === 'string' ? { redirect: s.redirect } : {},
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me.authenticated) throw redirect({ to: dashboardFor(me.role) })
  },
  component: LoginPage,
})

const OFFERED = 'wedwise:passkey-offered'

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const queryClient = useQueryClient()

  const [needsCode, setNeedsCode] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  // The account has only keys, no authenticator app: no code field, just the key button.
  const [keyOnly, setKeyOnly] = useState(false)
  const [offer, setOffer] = useState(false)
  const [explain, setExplain] = useState(false)

  const enter = async () => {
    const me = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
    navigate({ to: search.redirect ?? dashboardFor(me.role) })
  }

  const login = useMutation({
    mutationFn: (body: { username: string; password: string; code?: string; assertion?: unknown }) =>
      api.post<Me>('/auth/login', body),
    onError: (e, body) => {
      if (!(e instanceof ApiError && (e.code === 'two_factor_required' || e.code === 'security_key_required'))) return
      setNeedsCode(true)
      setKeyOnly(e.code === 'security_key_required')
      if (!webauthnSupported()) return
      api
        .post('/auth/webauthn/begin', { username: body.username, password: body.password })
        .then(() => setHasKey(true))
        .catch(() => setHasKey(false))
    },
    onSuccess: async () => {
      // Signed in with a password: offer a passkey once, when the account has none.
      if (webauthnSupported() && !localStorage.getItem(OFFERED)) {
        const status = await api.get<{ keys: unknown[] }>('/account/2fa').catch(() => null)
        if (status && status.keys.length === 0) return setOffer(true)
      }
      await enter()
    },
  })

  const form = useForm({
    defaultValues: { username: '', password: '', code: '' },
    onSubmit: ({ value }) => login.mutateAsync(value).catch(() => {}),
  })

  const withKey = useMutation({
    mutationFn: async () => {
      const { username, password } = form.state.values
      const options = await api.post<{ publicKey: unknown }>('/auth/webauthn/begin', { username, password })
      const assertion = await signWithKey(options)
      return login.mutateAsync({ username, password, assertion })
    },
  })

  const passkey = useMutation({
    mutationFn: async (autofill: boolean = false) => {
      const { id, options } = await api.post<{ id: string; options: { publicKey: unknown } }>('/auth/passkey/begin')
      const assertion = await signWithKey(options, autofill)
      await api.post('/auth/passkey', { id, assertion })
      await enter()
    },
  })

  // Saved passkeys show up in the username field's suggestions.
  const offerInField = passkey.mutate
  useEffect(() => {
    autofillSupported().then((ok) => ok && offerInField(true, { onError: () => passkey.reset() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const create = useMutation({
    mutationFn: async () => {
      const options = await api.post<{ publicKey: unknown }>('/account/2fa/keys/begin')
      const credential = await createKey(options)
      await api.post('/account/2fa/keys', { name: t('Passkey'), credential })
    },
    onSuccess: () => enter(),
  })

  if (offer)
    return (
      <section className="mx-auto flex max-w-md flex-col px-6 py-24">
        <Card>
          <CardHeader className="text-center">
            <KeyRound className="mx-auto size-8 text-primary" aria-hidden />
            <CardTitle className="text-2xl">{t('Nächstes Mal ohne Passwort?')}</CardTitle>
            <CardDescription>
              {t('Erstellt einen Passkey. Dann meldet ihr euch so an, wie ihr euer Gerät entsperrt.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>
              {t('Passkey erstellen')}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                localStorage.setItem(OFFERED, '1')
                enter()
              }}
            >
              {t('Später')}
            </Button>
            {create.isError && (
              <p className="text-sm text-destructive" role="alert">
                {t('Der Passkey konnte nicht eingerichtet werden.')}
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    )

  return (
    <section className="mx-auto flex max-w-md flex-col px-6 py-24">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">{t('Anmelden')}</CardTitle>
          <CardDescription>{t('Bereich für Brautpaar und Trauzeugen.')}</CardDescription>
        </CardHeader>
        <CardContent>
          {webauthnSupported() && !needsCode && (
            <div className="mb-5 space-y-3 border-b pb-5">
              <Button type="button" className="w-full" disabled={passkey.isPending && !passkey.variables} onClick={() => passkey.mutate(false)}>
                <KeyRound aria-hidden /> {t('Mit Passkey anmelden')}
              </Button>
              {passkey.isError && (
                <p className="text-sm text-destructive" role="alert">
                  {passkey.error instanceof ApiError ? errorMessage(passkey.error) : t('Die Anmeldung mit Passkey hat nicht geklappt.')}
                </p>
              )}
              <button type="button" className="mx-auto block text-xs text-muted-foreground underline" aria-expanded={explain} onClick={() => setExplain(!explain)}>
                {t('Was ist ein Passkey?')}
              </button>
              {explain && (
                <p className="text-xs text-muted-foreground">
                  {t('Ein Passkey ersetzt das Passwort. Er liegt auf eurem Gerät, in eurem Passwortmanager oder auf einem Sicherheitsschlüssel und wird so freigegeben, wie ihr das Gerät entsperrt.')}
                </p>
              )}
              <p className="text-center text-xs text-muted-foreground">{t('oder mit Passwort')}</p>
            </div>
          )}
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
          >
            <form.Field name="username">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>{t('Benutzername')}</Label>
                  <Input
                    id={field.name}
                    autoComplete="username webauthn"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>{t('Passwort')}</Label>
                  <Input
                    id={field.name}
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                  />
                </div>
              )}
            </form.Field>
            {needsCode && !keyOnly && (
              <form.Field name="code">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>{t('Code')}</Label>
                    <Input
                      id={field.name}
                      autoComplete="one-time-code"
                      autoFocus
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required={!hasKey}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('6-stelliger Code aus eurer Authenticator-App oder ein Wiederherstellungscode.')}
                    </p>
                  </div>
                )}
              </form.Field>
            )}
            {login.isError &&
              !(login.error instanceof ApiError && (login.error.code === 'two_factor_required' || login.error.code === 'security_key_required')) && (
              <p className="text-sm text-destructive" role="alert">
                {login.error instanceof ApiError && login.error.code === 'invalid_code'
                  ? t('Der Code stimmt nicht.')
                  : login.error instanceof ApiError && login.error.status === 401
                    ? t('Benutzername oder Passwort stimmt nicht.')
                    : errorMessage(login.error, t('Anmeldung fehlgeschlagen.'))}
              </p>
            )}
            {!keyOnly && (
              <Button type="submit" variant={webauthnSupported() && !needsCode ? 'outline' : 'default'} className="w-full" disabled={login.isPending}>
                {login.isPending ? t('Wird geprüft…') : t('Anmelden')}
              </Button>
            )}
            {needsCode && hasKey && (
              <Button
                type="button"
                variant={keyOnly ? 'default' : 'outline'}
                className="h-auto min-h-9 w-full py-2 whitespace-normal"
                disabled={withKey.isPending || login.isPending}
                onClick={() => withKey.mutate()}
              >
                {t('Mit Passkey bestätigen')}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
