import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { requireRole } from '@/lib/auth'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const REMEMBERED = 'wedwise:device-code'

export const Route = createFileRoute('/device')({
  validateSearch: (s: Record<string, unknown>): { code?: string } =>
    typeof s.code === 'string' ? { code: s.code } : {},
  // The sign-in page only returns to a path, so the code waits here meanwhile.
  beforeLoad: ({ context, search }) => {
    if (search.code) sessionStorage.setItem(REMEMBERED, search.code)
    return requireRole(context.queryClient, ['couple'])
  },
  component: DevicePage,
})

function DevicePage() {
  const search = Route.useSearch()
  const [code, setCode] = useState(search.code ?? sessionStorage.getItem(REMEMBERED) ?? '')
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)

  const pending = useQuery({
    queryKey: ['device', code],
    queryFn: () => api.get<{ name: string }>(`/auth/device/pending?code=${encodeURIComponent(code)}`),
    enabled: !!code && !done,
    retry: false,
  })
  const approve = useMutation({
    mutationFn: () => api.post('/auth/device/approve', { code }),
    onSuccess: () => {
      sessionStorage.removeItem(REMEMBERED)
      setDone(true)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Terminal className="size-5 text-primary" /> {t('Kommandozeile anmelden')}
          </CardTitle>
          <CardDescription>
            {t('Ein Programm auf einem Rechner möchte in eurem Namen Inhalte bearbeiten.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {done ? (
            <p className="flex items-center gap-2 text-primary">
              <Check className="size-4" /> {t('Erlaubt. Ihr könnt zum Terminal zurückkehren.')}
            </p>
          ) : !code || pending.isError ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                setCode(typed.trim().toUpperCase())
              }}
            >
              {pending.isError && <p className="text-destructive">{t('Dieser Code ist unbekannt oder abgelaufen.')}</p>}
              <Input
                aria-label={t('Code aus dem Terminal')}
                placeholder="ABCD-EFGH"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                required
              />
              <Button type="submit">{t('Weiter')}</Button>
            </form>
          ) : pending.data ? (
            <>
              <p>
                <span className="text-muted-foreground">{t('Rechner')}:</span>{' '}
                <span className="font-medium">{pending.data.name || t('Unbekannt')}</span>
                <br />
                <span className="text-muted-foreground">{t('Code')}:</span>{' '}
                <span className="font-mono font-medium">{code}</span>
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{t('Darf Inhalte lesen und ändern und Einladungslinks verwalten.')}</li>
                <li>{t('Sieht keine Rückmeldungen, Beiträge oder Benutzer.')}</li>
                <li>{t('Lässt sich jederzeit im Konto wieder entziehen.')}</li>
              </ul>
              <p className="text-muted-foreground">
                {t('Erlaubt das nur, wenn ihr die Anmeldung selbst gestartet habt und der Code übereinstimmt.')}
              </p>
              <Button disabled={approve.isPending} onClick={() => approve.mutate()}>
                {t('Zugriff erlauben')}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
