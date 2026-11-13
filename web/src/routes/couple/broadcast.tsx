import { useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { messagesQuery } from '@/lib/queries'
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

  const queryClient = useQueryClient()
  const { data: messages = [] } = useQuery(messagesQuery)
  const refresh = () => queryClient.invalidateQueries({ queryKey: messagesQuery.queryKey })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/messages/${id}`),
    onSuccess: () => {
      refresh()
      toast.success(t('Nachricht gelöscht.'))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const broadcast = useMutation({
    mutationFn: () => api.post<{ sent: number }>('/push/broadcast', { title, body, url: '/' }),
    onSuccess: (r) => {
      setTitle('')
      setBody('')
      refresh()
      toast.success(t('An {n} Geräte gesendet.', { n: r.sent }))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <PageHeader
        title={t('Nachricht an alle')}
        description={t('Erscheint unter „Neuigkeiten“ auf der Hochzeitsseite und geht als Benachrichtigung an alle, die sie aktiviert haben.')}
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

      <h2 className="mt-10 text-2xl">{t('Gesendete Nachrichten')}</h2>
      {messages.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('Noch keine Nachrichten gesendet.')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                <p className="font-medium">{m.title}</p>
                {m.body && <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{m.body}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                aria-label={t('Nachricht löschen')}
                onClick={() => {
                  if (window.confirm(t('Diese Nachricht aus den Neuigkeiten löschen?'))) remove.mutate(m.id)
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
