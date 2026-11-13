import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Bell, Copy, Megaphone, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, api, errorMessage } from '@/lib/api'
import { requireRole } from '@/lib/auth'
import { meQuery } from '@/lib/queries'
import { pushSupported, type PushTopic } from '@/lib/push'
import { toggled, usePushTopics } from '@/components/public/Notifications'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
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
      <StaffNotifications />
    </div>
  )
}

const TOPICS: { id: PushTopic; label: string; roles: string[] }[] = [
  { id: 'responses', label: 'Neue Rückmeldungen', roles: ['couple', 'witness', 'admin'] },
  { id: 'contributions', label: 'Neue Beiträge', roles: ['witness', 'admin'] },
  { id: 'broadcast', label: 'Nachrichten an alle Gäste', roles: ['couple', 'witness', 'admin'] },
]

function StaffNotifications() {
  const { data: me } = useQuery(meQuery)
  const { topics, ready, save } = usePushTopics()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const role = me?.role ?? ''
  const canBroadcast = role === 'couple' || role === 'admin'

  const broadcast = useMutation({
    mutationFn: () => api.post<{ sent: number }>('/push/broadcast', { title, body, url: '/' }),
    onSuccess: (r) => {
      setTitle('')
      setBody('')
      toast.success(`An ${r.sent} Geräte gesendet.`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Bell className="size-5 text-primary" /> Benachrichtigungen
          </CardTitle>
          <CardDescription>Gilt für dieses Gerät. Auf dem iPhone nur in der installierten App.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pushSupported() ? (
            <p className="text-sm text-muted-foreground">Dieser Browser unterstützt keine Benachrichtigungen.</p>
          ) : (
            TOPICS.filter((t) => t.roles.includes(role)).map((t) => (
              <div key={t.id} className="flex min-h-10 items-center justify-between gap-4">
                <Label htmlFor={`n-${t.id}`}>{t.label}</Label>
                <Switch
                  id={`n-${t.id}`}
                  checked={topics.includes(t.id)}
                  disabled={!ready || save.isPending}
                  onCheckedChange={(on) => save.mutate(toggled(topics, t.id, on))}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {canBroadcast && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Megaphone className="size-5 text-primary" /> Nachricht an alle
            </CardTitle>
            <CardDescription>Geht an alle Gäste, die Benachrichtigungen aktiviert haben.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (window.confirm('Nachricht jetzt an alle senden?')) broadcast.mutate()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="b-title">Titel</Label>
                <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="b-body">Text</Label>
                <Textarea id="b-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} required />
              </div>
              <Button type="submit" disabled={broadcast.isPending}>
                Senden
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  )
}
