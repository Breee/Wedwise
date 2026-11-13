import { api } from '@/lib/api'

export type PushTopic = 'broadcast' | 'responses' | 'contributions'

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyBytes(key: string) {
  const base64 = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js')
}

export async function pushTopics(): Promise<PushTopic[]> {
  if (!pushSupported()) return []
  const subscription = await (await registration()).pushManager.getSubscription()
  if (!subscription) return []
  const { topics } = await api.post<{ topics: PushTopic[] }>('/push/status', { endpoint: subscription.endpoint })
  return topics
}

export async function setPushTopics(topics: PushTopic[]): Promise<PushTopic[]> {
  const reg = await registration()
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    if (topics.length === 0) return []
    if ((await Notification.requestPermission()) !== 'granted') {
      throw new Error('Benachrichtigungen sind im Browser blockiert.')
    }
    const { key } = await api.get<{ key: string }>('/push/key')
    subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
  }
  const json = subscription.toJSON()
  const result = await api.post<{ topics: PushTopic[] }>('/push/subscriptions', {
    endpoint: subscription.endpoint,
    keys: json.keys,
    topics,
  })
  if (result.topics.length === 0) await subscription.unsubscribe()
  return result.topics
}
