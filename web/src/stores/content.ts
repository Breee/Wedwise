import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, errorMessage, unwrap } from '@/composables/useApi'

export interface ScheduleItem {
  time?: string
  title?: string
  description?: string
  location?: string
}

export interface FaqItem {
  question?: string
  answer?: string
}

export interface PublicContent {
  event_title?: string
  event_date?: string
  event_time?: string
  couple_names?: string
  hero_subtitle?: string
  hero_image?: string
  intro_title?: string
  intro_text?: string
  schedule_title?: string
  schedule?: ScheduleItem[]
  location_title?: string
  location_name?: string
  location_address?: string
  location_description?: string
  location_map_url?: string
  faq_title?: string
  faq?: FaqItem[]
  footer_text?: string
  [key: string]: unknown
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Accepts either a flat content object or a `{ content: {...} }` / list of
 * `{ key, value }` pairs, so the store tolerates several backend shapes.
 */
function normalize(payload: unknown): PublicContent {
  if (!payload || typeof payload !== 'object') return {}

  if (Array.isArray(payload)) {
    const flat: PublicContent = {}
    for (const entry of payload as Array<Record<string, unknown>>) {
      const key = entry?.key
      if (typeof key === 'string') {
        flat[key] = entry.value
      }
    }
    return flat
  }

  const record = payload as Record<string, unknown>
  const inner = record.content
  if (inner && typeof inner === 'object') {
    return normalize(inner)
  }
  return record as PublicContent
}

export const useContentStore = defineStore('content', () => {
  const content = ref<PublicContent>({})
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')

  const eventTitle = computed(() => text('event_title'))
  const coupleNames = computed(() => text('couple_names'))
  const eventDate = computed(() => text('event_date'))
  const eventTime = computed(() => text('event_time'))
  const schedule = computed(() => asArray<ScheduleItem>(content.value.schedule))
  const faq = computed(() => asArray<FaqItem>(content.value.faq))

  const formattedDate = computed(() => {
    const raw = eventDate.value
    if (!raw) return ''
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return raw
    return parsed.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  })

  function text(key: string, fallback = ''): string {
    const value = content.value[key]
    if (typeof value === 'string' && value.trim() !== '') return value
    if (typeof value === 'number') return String(value)
    return fallback
  }

  async function fetchPublic(force = false): Promise<PublicContent> {
    if (loaded.value && !force) return content.value
    loading.value = true
    error.value = ''
    try {
      const data = await unwrap<unknown>(await api.get('/content/public'))
      content.value = normalize(data)
      loaded.value = true
    } catch (err) {
      error.value = errorMessage(err, 'Content could not be loaded.')
      content.value = {}
    } finally {
      loading.value = false
    }
    return content.value
  }

  return {
    content,
    loaded,
    loading,
    error,
    eventTitle,
    coupleNames,
    eventDate,
    eventTime,
    formattedDate,
    schedule,
    faq,
    text,
    fetchPublic,
  }
})
