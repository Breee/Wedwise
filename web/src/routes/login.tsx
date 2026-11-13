import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { ApiError, api, errorMessage } from '@/lib/api'
import { signWithKey, webauthnSupported } from '@/lib/webauthn'
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

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const queryClient = useQueryClient()

  const [needsCode, setNeedsCode] = useState(false)
  const [hasKey, setHasKey] = useState(false)

  const login = useMutation({
    mutationFn: (body: { username: string; password: string; code?: string; assertion?: unknown }) =>
      api.post<Me>('/auth/login', body),
    onError: (e, body) => {
      if (!(e instanceof ApiError && e.code === 'two_factor_required')) return
      setNeedsCode(true)
      if (!webauthnSupported()) return
      api
        .post('/auth/webauthn/begin', { username: body.username, password: body.password })
        .then(() => setHasKey(true))
        .catch(() => setHasKey(false))
    },
    onSuccess: async () => {
      const me = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
      navigate({ to: search.redirect ?? dashboardFor(me.role) })
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
    mutationFn: async () => {
      const { id, options } = await api.post<{ id: string; options: { publicKey: unknown } }>('/auth/passkey/begin')
      const assertion = await signWithKey(options)
      await api.post('/auth/passkey', { id, assertion })
      const me = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
      navigate({ to: search.redirect ?? dashboardFor(me.role) })
    },
  })

  return (
    <section className="mx-auto flex max-w-md flex-col px-6 py-24">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Anmelden</CardTitle>
          <CardDescription>Bereich für Brautpaar und Trauzeugen.</CardDescription>
        </CardHeader>
        <CardContent>
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
                  <Label htmlFor={field.name}>Benutzername</Label>
                  <Input
                    id={field.name}
                    autoComplete="username"
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
                  <Label htmlFor={field.name}>Passwort</Label>
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
            {needsCode && (
              <form.Field name="code">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Code</Label>
                    <Input
                      id={field.name}
                      autoComplete="one-time-code"
                      autoFocus
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      required={!hasKey}
                    />
                    <p className="text-xs text-muted-foreground">
                      6-stelliger Code aus eurer Authenticator-App oder ein Wiederherstellungscode.
                    </p>
                  </div>
                )}
              </form.Field>
            )}
            {login.isError && !(login.error instanceof ApiError && login.error.code === 'two_factor_required') && (
              <p className="text-sm text-destructive" role="alert">
                {login.error instanceof ApiError && login.error.code === 'invalid_code'
                  ? 'Der Code stimmt nicht.'
                  : login.error instanceof ApiError && login.error.status === 401
                    ? 'Benutzername oder Passwort stimmt nicht.'
                    : errorMessage(login.error, 'Anmeldung fehlgeschlagen.')}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Wird geprüft…' : 'Anmelden'}
            </Button>
            {needsCode && hasKey && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={withKey.isPending || login.isPending}
                onClick={() => withKey.mutate()}
              >
                Mit Passkey oder Sicherheitsschlüssel anmelden
              </Button>
            )}
          </form>
          {webauthnSupported() && !needsCode && (
            <div className="mt-5 space-y-2 border-t pt-5">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={passkey.isPending}
                onClick={() => passkey.mutate()}
              >
                Mit Passkey anmelden
              </Button>
              {passkey.isError && (
                <p className="text-sm text-destructive" role="alert">
                  Die Anmeldung mit Passkey hat nicht geklappt.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
