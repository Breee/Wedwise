import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { t } from '@/lib/i18n'
import { Bell, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/api'
import { pushSupported, pushTopics, setPushTopics, type PushTopic } from '@/lib/push'
import { Button } from '@/components/ui/button'

export const pushKey = ['push', 'topics'] as const

export function usePushTopics() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: pushKey, queryFn: pushTopics, enabled: pushSupported() })
  const save = useMutation({
    mutationFn: setPushTopics,
    onSuccess: (topics) => queryClient.setQueryData(pushKey, topics),
    onError: (e) => toast.error(errorMessage(e, t('Benachrichtigungen konnten nicht geändert werden.'))),
  })
  return { topics: query.data ?? [], ready: query.isSuccess, save }
}

export function toggled(topics: PushTopic[], topic: PushTopic, on: boolean) {
  return on ? [...new Set([...topics, topic])] : topics.filter((t) => t !== topic)
}

export function GuestNotifications() {
  const { topics, ready, save } = usePushTopics()
  if (!pushSupported() || !ready) return null
  const on = topics.includes('broadcast')

  return (
    <div className="mx-auto max-w-md space-y-2 rounded-lg border bg-secondary/40 p-4 text-left">
      <p className="flex items-center gap-2 font-medium">
        <Bell className="size-4 text-primary" /> {t('Neuigkeiten aufs Handy')}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('Wir melden uns nur, wenn es etwas Wichtiges gibt – zum Beispiel Änderungen am Ablauf.')}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={save.isPending}
        onClick={() => save.mutate(toggled(topics, 'broadcast', !on))}
      >
        {on ? <BellOff className="size-4" /> : <Bell className="size-4" />}
        {on ? t('Benachrichtigungen ausschalten') : t('Benachrichtigungen aktivieren')}
      </Button>
    </div>
  )
}
