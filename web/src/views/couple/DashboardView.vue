<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, errorMessage, unwrap } from '@/composables/useApi'

interface StatsResponse {
  // /api/rsvp-summary fields
  invitations?: number
  activeInvitations?: number
  respondedInvitations?: number
  statusCounts?: { accepted?: number; declined?: number; no?: number; maybe?: number; pending?: number; yes?: number }
  attendeesTotal?: number
  attendeesAttending?: number
  children?: number
  dietCounts?: Record<string, number>
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

const totalInvited = computed(() => num(stats.value.invitations))
const accepted = computed(() => num(stats.value.statusCounts?.accepted, stats.value.statusCounts?.yes))
const declined = computed(() => num(stats.value.statusCounts?.no, stats.value.statusCounts?.declined))
const maybe = computed(() => num(stats.value.statusCounts?.maybe))
const noResponse = computed(() => num(stats.value.statusCounts?.pending))
const totalAttendees = computed(() => num(stats.value.attendeesTotal))
const children = computed(() => num(stats.value.children))
const adults = computed(() => Math.max(num(stats.value.attendeesAttending) - children.value, 0))
const vegetarianCount = computed(() => num(stats.value.dietCounts?.vegetarian))
const veganCount = computed(() => num(stats.value.dietCounts?.vegan))

const diets = computed<Array<{ label: string; count: number }>>(() => {
  const source = stats.value.dietCounts
  if (!source) return []
  return Object.entries(source)
    .filter(([, count]) => Number.isFinite(Number(count)) && Number(count) > 0)
    .map(([key, count]) => ({
      label: DIET_LABELS[key] ?? key.replace(/_/g, ' '),
      count: Number(count),
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
const allergyCount = computed(() => allergies.value.length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    stats.value = await unwrap<StatsResponse>(await api.get('/rsvp-summary'))
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

        <div class="grid grid--4 dashboard__row">
          <div class="stat">
            <p class="stat__value">{{ noResponse }}</p>
            <p class="stat__label">No response</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ adults }}</p>
            <p class="stat__label">Adults attending</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ children }}</p>
            <p class="stat__label">Children attending</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ totalAttendees }}</p>
            <p class="stat__label">Registered attendees</p>
          </div>
        </div>

        <div class="grid grid--4 dashboard__row">
          <div class="stat">
            <p class="stat__value">{{ vegetarianCount }}</p>
            <p class="stat__label">Vegetarian meals</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ veganCount }}</p>
            <p class="stat__label">Vegan meals</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ allergyCount }}</p>
            <p class="stat__label">Allergy reports</p>
          </div>
          <div class="stat">
            <p class="stat__value">{{ adults + children }}</p>
            <p class="stat__label">Expected guests</p>
          </div>
        </div>

        <div class="grid grid--2 dashboard__row">
          <section class="card" aria-labelledby="food-summary-heading">
            <h2 id="food-summary-heading">Food summary</h2>
            <div class="grid grid--2 dashboard__food-grid">
              <div class="dashboard__mini-stat">
                <span class="dashboard__mini-label">Adults</span>
                <strong>{{ adults }}</strong>
              </div>
              <div class="dashboard__mini-stat">
                <span class="dashboard__mini-label">Children</span>
                <strong>{{ children }}</strong>
              </div>
              <div class="dashboard__mini-stat">
                <span class="dashboard__mini-label">Vegetarian</span>
                <strong>{{ vegetarianCount }}</strong>
              </div>
              <div class="dashboard__mini-stat">
                <span class="dashboard__mini-label">Vegan</span>
                <strong>{{ veganCount }}</strong>
              </div>
              <div class="dashboard__mini-stat dashboard__mini-stat--full">
                <span class="dashboard__mini-label">Allergy reports</span>
                <strong>{{ allergyCount }}</strong>
              </div>
            </div>
          </section>

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

.dashboard__food-grid {
  margin-top: 1rem;
}

.dashboard__mini-stat {
  border: var(--border-subtle);
  border-radius: var(--radius);
  padding: 0.9rem 1rem;
  background: color-mix(in srgb, var(--color-surface) 84%, var(--color-accent-light));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.dashboard__mini-stat strong {
  font-family: var(--font-heading);
  font-size: 1.5rem;
  color: var(--color-primary-dark);
}

.dashboard__mini-label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.dashboard__mini-stat--full {
  grid-column: 1 / -1;
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
