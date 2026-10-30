import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { api, errorMessage } from '@/lib/api'
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

  const login = useMutation({
    mutationFn: (body: { username: string; password: string }) => api.post<Me>('/auth/login', body),
    onSuccess: async () => {
      const me = await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
      navigate({ to: search.redirect ?? dashboardFor(me.role) })
    },
  })

  const form = useForm({
    defaultValues: { username: '', password: '' },
    onSubmit: ({ value }) => login.mutateAsync(value).catch(() => {}),
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
            {login.isError && (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage(login.error, 'Anmeldung fehlgeschlagen.')}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? 'Wird geprüft…' : 'Anmelden'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
