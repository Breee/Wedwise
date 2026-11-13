import { useState } from 'react'
import { copyText } from '@/lib/clipboard'
import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Bell, Copy, KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError, api, errorMessage } from '@/lib/api'
import { requireRole } from '@/lib/auth'
import { meQuery } from '@/lib/queries'
import { createKey, webauthnSupported } from '@/lib/webauthn'
import { pushSupported, type PushTopic } from '@/lib/push'
import { toggled, usePushTopics } from '@/components/public/Notifications'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SecurityKey = { id: number; name: string; createdAt: string }
type Status = { totp: boolean; recoveryCodes: number; keys: SecurityKey[] }
type Enrolment = { secret: string; url: string }

const statusKey = ['account', '2fa'] as const

export const Route = createFileRoute('/account')({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ['couple', 'witness', 'admin']),
  component: AccountPage,
})

function codeError(e: unknown) {
  return e instanceof ApiError && e.code === 'invalid_code' ? t('Der Code stimmt nicht.') : errorMessage(e)
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
      toast.success(t('Zwei-Faktor-Anmeldung deaktiviert.'))
    },
    onError: (e) => toast.error(codeError(e)),
  })

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader title={t('Konto')} description={t('Anmeldung absichern und Benachrichtigungen für dieses Gerät.')} />
      <h2 className="mb-1 text-2xl">{t('Anmeldung & Sicherheit')}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('Beides ist freiwillig. Am einfachsten ist ein Passkey – der Code aus einer App ist die Alternative.')}
      </p>
      <SecurityKeys keys={status?.keys ?? []} />
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="size-5 text-primary" /> {t('Code aus einer App')}
          </CardTitle>
          <CardDescription>
            {t('Zusätzlich zum Passwort fragt die Anmeldung einen Code aus einer Authenticator-App ab.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {recovery && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-secondary/40 p-4">
              <p className="text-sm font-medium">{t('Eure Wiederherstellungscodes')}</p>
              <p className="text-sm text-muted-foreground">
                {t('Bewahrt sie sicher auf. Jeder Code gilt einmal, falls das Handy fehlt. Wir zeigen sie nicht noch einmal an.')}
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
                onClick={() => copyText(recovery.join('\n'), t('Codes kopiert.'))}
              >
                <Copy className="size-4" /> {t('Kopieren')}
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
                {t('Aktiv. Noch {n} Wiederherstellungscodes übrig.', { n: status.recoveryCodes })}
              </p>
              <div className="space-y-2">
                <Label htmlFor="a-code">{t('Code zum Deaktivieren')}</Label>
                <Input id="a-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
              </div>
              <Button type="submit" variant="outline" disabled={disable.isPending}>
                {t('Deaktivieren')}
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
                {t('Scannt den QR-Code mit eurer Authenticator-App und gebt den angezeigten Code ein.')}
              </p>
              <div className="w-fit rounded-lg bg-white p-3">
                <QRCodeSVG value={enrolment.url} size={176} />
              </div>
              <p className="text-xs break-all text-muted-foreground">
                {t('Ohne Kamera:')} <span className="font-mono">{enrolment.secret}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="a-code">{t('6-stelliger Code')}</Label>
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
                {t('Aktivieren')}
              </Button>
            </form>
          ) : (
            <Button onClick={() => begin.mutate()} disabled={begin.isPending || !status}>
              {t('Einrichten')}
            </Button>
          )}
        </CardContent>
      </Card>
      <h2 className="mt-10 mb-4 text-2xl">{t('Benachrichtigungen')}</h2>
      <StaffNotifications />
    </div>
  )
}

const TOPICS: { id: PushTopic; label: string; roles: string[] }[] = [
  { id: 'responses', label: 'Neue Rückmeldungen', roles: ['couple', 'witness', 'admin'] },
  { id: 'contributions', label: 'Neue Beiträge', roles: ['witness', 'admin'] },
  { id: 'broadcast', label: 'Nachrichten an alle Gäste', roles: ['couple', 'witness', 'admin'] },
]

function SecurityKeys({ keys }: { keys: SecurityKey[] }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: statusKey })

  const add = useMutation({
    mutationFn: async () => {
      const options = await api.post<{ publicKey: unknown }>('/account/2fa/keys/begin')
      const credential = await createKey(options)
      await api.post('/account/2fa/keys', { name, credential })
    },
    onSuccess: () => {
      setName('')
      refresh()
      toast.success(t('Schlüssel hinzugefügt.'))
    },
    onError: (e) => toast.error(errorMessage(e, t('Der Schlüssel konnte nicht hinzugefügt werden.'))),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/account/2fa/keys/${id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, t('Löschen fehlgeschlagen.'))),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          <KeyRound className="size-5 text-primary" />
          {t('Passkey oder Sicherheitsschlüssel')}
        </CardTitle>
        <CardDescription>
          {t('Fingerabdruck, Gesichtserkennung oder ein Hardware-Schlüssel (z. B. YubiKey) als zweiter Schritt bei der Anmeldung. Gespeichert wird nur der öffentliche Schlüssel.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {keys.length > 0 && (
          <ul className="divide-y rounded-md border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{k.name || t('Schlüssel')}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={t('{name} entfernen', { name: k.name || t('Schlüssel') })}
                  onClick={() => window.confirm(t('Diesen Schlüssel entfernen?')) && remove.mutate(k.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {webauthnSupported() ? (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              add.mutate()
            }}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="k-name">{t('Name')}</Label>
              <Input
                id="k-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('z. B. Handy oder YubiKey')}
                maxLength={60}
              />
            </div>
            <Button type="submit" disabled={add.isPending}>
              {t('Schlüssel hinzufügen')}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t('Dieser Browser unterstützt keine Sicherheitsschlüssel.')}</p>
        )}
      </CardContent>
    </Card>
  )
}

function StaffNotifications() {
  const { data: me } = useQuery(meQuery)
  const { topics, ready, save } = usePushTopics()
  const role = me?.role ?? ''

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Bell className="size-5 text-primary" /> {t('Auf diesem Gerät')}
          </CardTitle>
          <CardDescription>{t('Gilt für dieses Gerät. Auf dem iPhone nur in der installierten App.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pushSupported() ? (
            <p className="text-sm text-muted-foreground">{t('Dieser Browser unterstützt keine Benachrichtigungen.')}</p>
          ) : (
            TOPICS.filter((topic) => topic.roles.includes(role)).map((topic) => (
              <div key={topic.id} className="flex min-h-10 items-center justify-between gap-4">
                <Label htmlFor={`n-${topic.id}`}>{t(topic.label)}</Label>
                <Switch
                  id={`n-${topic.id}`}
                  checked={topics.includes(topic.id)}
                  disabled={!ready || save.isPending}
                  onCheckedChange={(on) => save.mutate(toggled(topics, topic.id, on))}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
