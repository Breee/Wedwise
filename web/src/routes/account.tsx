import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, api, errorMessage } from '@/lib/api'
import { requireRole } from '@/lib/auth'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Status = { totp: boolean; recoveryCodes: number }
type Enrolment = { secret: string; url: string }

const statusKey = ['account', '2fa'] as const

export const Route = createFileRoute('/account')({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ['couple', 'witness', 'admin']),
  component: AccountPage,
})

function codeError(e: unknown) {
  return e instanceof ApiError && e.code === 'invalid_code' ? 'Der Code stimmt nicht.' : errorMessage(e)
}

function AccountPage() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery({ queryKey: statusKey, queryFn: () => api.get<Status>('/account/2fa') })
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null)
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [code, setCode] = useState('')

  const refresh = () => queryClient.invalidateQueries({ queryKey: statusKey })
  const begin = useMutation({
    mutationFn: () => api.post<Enrolment>('/account/2fa/totp'),
    onSuccess: setEnrolment,
    onError: (e) => toast.error(errorMessage(e)),
  })
  const confirm = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>('/account/2fa/totp/confirm', { code }),
    onSuccess: (r) => {
      setRecovery(r.recoveryCodes)
      setEnrolment(null)
      setCode('')
      refresh()
    },
    onError: (e) => toast.error(codeError(e)),
  })
  const disable = useMutation({
    mutationFn: () => api.post('/account/2fa/disable', { code }),
    onSuccess: () => {
      setCode('')
      setRecovery(null)
      refresh()
      toast.success('Zwei-Faktor-Anmeldung deaktiviert.')
    },
    onError: (e) => toast.error(codeError(e)),
  })

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader title="Konto" description="Sichert eure Anmeldung zusätzlich ab." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="size-5 text-primary" /> Zwei-Faktor-Anmeldung
          </CardTitle>
          <CardDescription>
            Zusätzlich zum Passwort fragt die Anmeldung einen Code aus einer Authenticator-App ab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {recovery && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-secondary/40 p-4">
              <p className="text-sm font-medium">Eure Wiederherstellungscodes</p>
              <p className="text-sm text-muted-foreground">
                Bewahrt sie sicher auf. Jeder Code gilt einmal, falls das Handy fehlt. Wir zeigen sie nicht noch einmal an.
              </p>
              <ul className="grid grid-cols-1 gap-1 font-mono text-sm sm:grid-cols-2">
                {recovery.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(recovery.join('\n')).then(() => toast.success('Codes kopiert.'))}
              >
                <Copy className="size-4" /> Kopieren
              </Button>
            </div>
          )}

          {status?.totp ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                disable.mutate()
              }}
            >
              <p className="text-sm">
                Aktiv. Noch {status.recoveryCodes} Wiederherstellungscodes übrig.
              </p>
              <div className="space-y-2">
                <Label htmlFor="a-code">Code zum Deaktivieren</Label>
                <Input id="a-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
              </div>
              <Button type="submit" variant="outline" disabled={disable.isPending}>
                Deaktivieren
              </Button>
            </form>
          ) : enrolment ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                confirm.mutate()
              }}
            >
              <p className="text-sm text-muted-foreground">
                Scannt den QR-Code mit eurer Authenticator-App und gebt den angezeigten Code ein.
              </p>
              <div className="w-fit rounded-lg bg-white p-3">
                <QRCodeSVG value={enrolment.url} size={176} />
              </div>
              <p className="text-xs break-all text-muted-foreground">
                Ohne Kamera: <span className="font-mono">{enrolment.secret}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="a-code">6-stelliger Code</Label>
                <Input
                  id="a-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </div>
              <Button type="submit" disabled={confirm.isPending}>
                Aktivieren
              </Button>
            </form>
          ) : (
            <Button onClick={() => begin.mutate()} disabled={begin.isPending || !status}>
              Einrichten
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
