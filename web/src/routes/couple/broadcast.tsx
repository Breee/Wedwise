import { useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/couple/broadcast')({
  component: BroadcastPage,
})

function BroadcastPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const broadcast = useMutation({
    mutationFn: () => api.post<{ sent: number }>('/push/broadcast', { title, body, url: '/' }),
    onSuccess: (r) => {
      setTitle('')
      setBody('')
      toast.success(t('An {n} Geräte gesendet.', { n: r.sent }))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader
        title={t('Nachricht an alle')}
        description={t('Geht als Benachrichtigung an alle Gäste, die Neuigkeiten aktiviert haben.')}
      />
      <Card>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (window.confirm(t('Nachricht jetzt an alle senden?'))) broadcast.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="b-title">{t('Titel')}</Label>
              <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-body">{t('Text')}</Label>
              <Textarea id="b-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} required />
            </div>
            <Button type="submit" disabled={broadcast.isPending}>
              {t('Senden')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
