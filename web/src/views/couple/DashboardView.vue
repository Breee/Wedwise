<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, errorMessage, unwrap } from '@/composables/useApi'

interface StatsResponse {
  total_invited?: number
  accepted?: number
  declined?: number
  maybe?: number
  no_response?: number
  pending?: number
  total_attendees?: number
  children?: number
  children_count?: number
  adults?: number
  diets?: Record<string, number> | Array<{ diet?: string; count?: number }>
  dietary_requirements?: Record<string, number>
  allergies?: string[] | Array<{ name?: string; allergies?: string }>
  [key: string]: unknown
}

const DIET_LABELS: Record<string, string> = {
  '': 'No preference',
  none: 'No preference',
  no_preference: 'No preference',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescetarian: 'Pescetarian',
  halal: 'Halal',
  kosher: 'Kosher',
  gluten_free: 'Gluten free',
  lactose_free: 'Lactose free',
  other: 'Other',
}

const loading = ref(true)
const error = ref('')
const stats = ref<StatsResponse>({})

function num(...values: unknown[]): number {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && value !== null && value !== undefined && value !== '') {
      return parsed
    }
  }
  return 0
}

const totalInvited = computed(() => num(stats.value.total_invited))
const accepted = computed(() => num(stats.value.accepted))
const declined = computed(() => num(stats.value.declined))
const maybe = computed(() => num(stats.value.maybe))
const noResponse = computed(() => num(stats.value.no_response, stats.value.pending))
const totalAttendees = computed(() => num(stats.value.total_attendees))
const children = computed(() => num(stats.value.children, stats.value.children_count))
const adults = computed(() => Math.max(totalAttendees.value - children.value, 0))

const diets = computed<Array<{ label: string; count: number }>>(() => {
  const source = stats.value.diets ?? stats.value.dietary_requirements
  if (!source) return []
  const entries: Array<[string, number]> = Array.isArray(source)
    ? source.map((item) => [String(item.diet ?? ''), Number(item.count ?? 0)])
    : Object.entries(source).map(([key, value]) => [key, Number(value)])

  return entries
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([key, count]) => ({
      label: DIET_LABELS[key] ?? key.replace(/_/g, ' '),
      count,
    }))
    .sort((a, b) => b.count - a.count)
})

const allergies = computed<string[]>(() => {
  const source = stats.value.allergies
  if (!Array.isArray(source)) return []
  return source
    .map((entry) => {
      if (typeof entry === 'string') return entry
      const name = entry?.name
      const value = entry?.allergies
      return [name, value].filter(Boolean).join(': ')
    })
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    stats.value = await unwrap<StatsResponse>(await api.get('/rsvp/stats'))
  } catch (err) {
    error.value = errorMessage(err, 'The statistics could not be loaded.')
    stats.value = {}
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="section">
    <div class="container container--wide">
      <div class="page-header">
        <div>
          <p class="eyebrow">Overview</p>
          <h1>Dashboard</h1>
        </div>
        <button type="button" class="btn btn--ghost btn--small" @click="load">
          Refresh
        </button>
      </div>

      <p v-if="loading" class="text-muted" aria-live="polite">Loading statistics…</p>
      <p v-else-if="error" class="notice notice--error" role="alert">{{ error }}</p>

      <template v-else>
        <div class="grid grid--4">
          <div class="stat">
            <p class="stat__value">{{ totalInvited }}</p>
            <p class="stat__label">Invited</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ accepted }}</p>
            <p class="stat__label">Accepted</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ declined }}</p>
            <p class="stat__label">Declined</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ maybe }}</p>
            <p class="stat__label">Maybe</p>
          </div>
        </div>

        <div class="grid grid--3 dashboard__row">
          <div class="stat">
            <p class="stat__value">{{ noResponse }}</p>
            <p class="stat__label">No response</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ totalAttendees }}</p>
            <p class="stat__label">Total attendees</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ children }}</p>
            <p class="stat__label">Children ({{ adults }} adults)</p>
          </div>
        </div>

        <div class="grid grid--2 dashboard__row">
          <section class="card" aria-labelledby="diet-heading">
            <h2 id="diet-heading">Dietary requirements</h2>
            <ul v-if="diets.length > 0" class="list-plain breakdown">
              <li v-for="item in diets" :key="item.label" class="breakdown__row">
                <span>{{ item.label }}</span>
                <span class="badge">{{ item.count }}</span>
              </li>
            </ul>
            <p v-else class="text-muted">No dietary requirements recorded yet.</p>
          </section>

          <section class="card" aria-labelledby="allergy-heading">
            <h2 id="allergy-heading">Allergies</h2>
            <ul v-if="allergies.length > 0" class="list-plain breakdown">
              <li v-for="(entry, index) in allergies" :key="index" class="breakdown__row">
                <span>{{ entry }}</span>
              </li>
            </ul>
            <p v-else class="text-muted">No allergies reported yet.</p>
          </section>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.dashboard__row {
  margin-top: var(--spacing);
}

.breakdown__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing);
  padding: 0.45rem 0;
  border-bottom: var(--border-subtle);
}

.breakdown__row:last-child {
  border-bottom: none;
}
</style>
