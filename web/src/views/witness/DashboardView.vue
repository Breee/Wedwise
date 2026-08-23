<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, errorMessage, unwrap } from '@/composables/useApi'

interface Contribution {
  id: number | string
  title?: string
  category?: string
  description?: string
  participants?: string
  duration_minutes?: number
  technical_requirements?: string
  equipment?: string
  preferred_time?: string
  contact_info?: string
  contact?: string
  status?: string
  notes?: string
}

const STATUSES = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'done', label: 'Done' },
  { value: 'rejected', label: 'Declined' },
]

const CATEGORY_LABELS: Record<string, string> = {
  speech: 'Speech',
  music: 'Music',
  performance: 'Performance',
  game: 'Game',
  slideshow: 'Slideshow / video',
  other: 'Other',
}

const contributions = ref<Contribution[]>([])
const loading = ref(true)
const error = ref('')
const busyId = ref<string | null>(null)
const notice = ref('')
const noteDrafts = ref<Record<string, string>>({})

function unwrapList(payload: unknown): Contribution[] {
  if (Array.isArray(payload)) return payload as Contribution[]
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['contributions', 'items', 'data']) {
      if (Array.isArray(record[key])) return record[key] as Contribution[]
    }
  }
  return []
}

function normalizeStatus(value?: string): string {
  const raw = (value ?? '').toLowerCase()
  return STATUSES.some((status) => status.value === raw) ? raw : 'submitted'
}

const columns = computed(() =>
  STATUSES.map((status) => ({
    ...status,
    items: contributions.value.filter(
      (item) => normalizeStatus(item.status) === status.value,
    ),
  })),
)

function categoryLabel(contribution: Contribution): string {
  const raw = contribution.category ?? ''
  return CATEGORY_LABELS[raw] ?? (raw ? raw.replace(/_/g, ' ') : 'Uncategorised')
}

function contactOf(contribution: Contribution): string {
  return contribution.contact_info || contribution.contact || '—'
}

function draftFor(contribution: Contribution): string {
  const key = String(contribution.id)
  return noteDrafts.value[key] ?? contribution.notes ?? ''
}

function setDraft(contribution: Contribution, value: string) {
  noteDrafts.value = { ...noteDrafts.value, [String(contribution.id)]: value }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    contributions.value = unwrapList(await unwrap<unknown>(await api.get('/contributions')))
    noteDrafts.value = {}
  } catch (err) {
    error.value = errorMessage(err, 'Contributions could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function patch(contribution: Contribution, body: Record<string, unknown>) {
  const key = String(contribution.id)
  busyId.value = key
  error.value = ''
  try {
    await unwrap<unknown>(
      await api.put(`/contributions/${encodeURIComponent(key)}`, {
        status: normalizeStatus(contribution.status),
        notes: contribution.notes ?? '',
        ...body,
      }),
    )
    await load()
    notice.value = 'Contribution updated.'
  } catch (err) {
    error.value = errorMessage(err, 'The contribution could not be updated.')
  } finally {
    busyId.value = null
  }
}

function changeStatus(contribution: Contribution, event: Event) {
  const target = event.target as HTMLSelectElement
  void patch(contribution, { status: target.value })
}

function saveNotes(contribution: Contribution) {
  void patch(contribution, { notes: draftFor(contribution) })
}

onMounted(load)
</script>

<template>
  <section class="section">
    <div class="container container--wide">
      <div class="page-header">
        <div>
          <p class="eyebrow">Witness area</p>
          <h1>Contributions</h1>
        </div>
        <button type="button" class="btn btn--ghost btn--small" @click="load">
          Refresh
        </button>
      </div>

      <p v-if="notice" class="notice notice--success" role="status">{{ notice }}</p>
      <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
      <p v-if="loading" class="text-muted" aria-live="polite">Loading contributions…</p>

      <div v-else class="board">
        <section
          v-for="column in columns"
          :key="column.value"
          class="board__column"
          :aria-label="column.label"
        >
          <h2 class="board__heading">
            {{ column.label }}
            <span class="badge">{{ column.items.length }}</span>
          </h2>

          <p v-if="column.items.length === 0" class="text-muted board__empty">
            Nothing here.
          </p>

          <article
            v-for="contribution in column.items"
            :key="contribution.id"
            class="card contribution"
          >
            <h3 class="contribution__title">{{ contribution.title || 'Untitled' }}</h3>
            <p class="contribution__category">
              <span class="badge badge--accent">{{ categoryLabel(contribution) }}</span>
            </p>

            <dl class="contribution__meta">
              <div>
                <dt>Contact</dt>
                <dd>{{ contactOf(contribution) }}</dd>
              </div>
              <div>
                <dt>Participants</dt>
                <dd>{{ contribution.participants || '—' }}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>
                  {{ contribution.duration_minutes ? `${contribution.duration_minutes} min` : '—' }}
                </dd>
              </div>
              <div v-if="contribution.preferred_time">
                <dt>Preferred time</dt>
                <dd>{{ contribution.preferred_time }}</dd>
              </div>
              <div v-if="contribution.equipment">
                <dt>Equipment</dt>
                <dd>{{ contribution.equipment }}</dd>
              </div>
              <div v-if="contribution.technical_requirements">
                <dt>Technical</dt>
                <dd>{{ contribution.technical_requirements }}</dd>
              </div>
            </dl>

            <p v-if="contribution.description" class="contribution__description">
              {{ contribution.description }}
            </p>

            <div class="field">
              <label :for="`status-${contribution.id}`">Status</label>
              <select
                :id="`status-${contribution.id}`"
                :value="normalizeStatus(contribution.status)"
                :disabled="busyId === String(contribution.id)"
                @change="changeStatus(contribution, $event)"
              >
                <option
                  v-for="status in STATUSES"
                  :key="status.value"
                  :value="status.value"
                >
                  {{ status.label }}
                </option>
              </select>
            </div>

            <div class="field">
              <label :for="`notes-${contribution.id}`">Internal notes</label>
              <textarea
                :id="`notes-${contribution.id}`"
                :value="draftFor(contribution)"
                @input="setDraft(contribution, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </div>

            <button
              type="button"
              class="btn btn--secondary btn--small"
              :disabled="busyId === String(contribution.id)"
              @click="saveNotes(contribution)"
            >
              Save notes
            </button>
          </article>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.board {
  display: grid;
  gap: calc(var(--spacing) * 1.25);
  grid-template-columns: 1fr;
}

.board__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
}

.board__empty {
  font-size: 0.9rem;
}

.contribution {
  margin-bottom: var(--spacing);
}

.contribution__title {
  margin-bottom: 0.35rem;
}

.contribution__category {
  margin-bottom: 0.6rem;
}

.contribution__meta {
  margin: 0 0 var(--spacing);
  font-size: 0.88rem;
}

.contribution__meta > div {
  display: flex;
  gap: 0.4rem;
}

.contribution__meta dt {
  color: var(--color-text-muted);
  min-width: 7rem;
}

.contribution__meta dd {
  margin: 0;
}

.contribution__description {
  font-size: 0.92rem;
  white-space: pre-line;
}

@media (min-width: 60rem) {
  .board {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }
}
</style>
