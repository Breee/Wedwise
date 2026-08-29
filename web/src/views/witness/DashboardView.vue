<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, errorMessage, unwrap } from '@/composables/useApi'

interface Contribution {
  id: number | string
  title?: string
  category?: string
  description?: string
  participants?: string
  durationMinutes?: number
  technicalRequirements?: string
  equipment?: string
  preferredTime?: string
  contactInformation?: string
  status?: string
  notes?: string
}

interface GuestSummary {
  attendeesAttending?: number
  children?: number
  dietCounts?: Record<string, number>
  allergies?: string[]
}

// Statuses must match the Go model constants exactly.
const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'needs_clarification', label: 'Needs clarification' },
  { value: 'planning', label: 'Planning' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Not included' },
]

const CATEGORY_LABELS: Record<string, string> = {
  speech: 'Speech',
  music: 'Music',
  performance: 'Performance',
  game: 'Game',
  video: 'Slideshow / video',
  slideshow: 'Slideshow / video',
  surprise: 'Surprise',
  other: 'Other',
}

// Contributor-friendly status labels (spec §18)
const STATUS_DISPLAY: Record<string, string> = {
  new: 'Received',
  needs_clarification: 'Follow-up needed',
  planning: 'In planning',
  confirmed: 'Scheduled',
  rejected: 'Not included',
}

const contributions = ref<Contribution[]>([])
const loading = ref(true)
const error = ref('')
const busyId = ref<string | null>(null)
const notice = ref('')
const noteDrafts = ref<Record<string, string>>({})
const guestSummary = ref<GuestSummary>({})

// Mobile: show flat list; Desktop: show kanban columns
const viewMode = ref<'list' | 'board'>('list')

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
  return STATUSES.some((s) => s.value === raw) ? raw : 'new'
}

const columns = computed(() =>
  STATUSES.map((status) => ({
    ...status,
    displayLabel: STATUS_DISPLAY[status.value] ?? status.label,
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
  return contribution.contactInformation ?? ''
}

// Detect if contact looks like a phone number
function isPhone(contact: string): boolean {
  return /^\+?[\d\s\-().]{7,}$/.test(contact.trim())
}

function draftFor(contribution: Contribution): string {
  const key = String(contribution.id)
  return noteDrafts.value[key] ?? contribution.notes ?? ''
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function setDraft(contribution: Contribution, value: string) {
  noteDrafts.value = { ...noteDrafts.value, [String(contribution.id)]: value }
}

const totalContributions = computed(() => contributions.value.length)
const confirmedContributions = computed(
  () => contributions.value.filter((item) => normalizeStatus(item.status) === 'confirmed').length,
)
const unconfirmedContributions = computed(
  () => contributions.value.filter((item) => !['confirmed', 'rejected'].includes(normalizeStatus(item.status))).length,
)
const totalDuration = computed(
  () => contributions.value.reduce((sum, item) => sum + num(item.durationMinutes), 0),
)
const recommendedMinutes = 50
const plannedMinutesPercentage = computed(() =>
  Math.min(100, Math.round((totalDuration.value / recommendedMinutes) * 100)),
)
const missingPhoneContributions = computed(() =>
  contributions.value.filter((item) => !isPhone(contactOf(item))),
)
const techConfirmationContributions = computed(() =>
  contributions.value.filter(
    (item) => Boolean(item.technicalRequirements?.trim()) && normalizeStatus(item.status) !== 'confirmed',
  ),
)
const pendingStatusContributions = computed(() =>
  contributions.value.filter((item) => !['confirmed', 'rejected'].includes(normalizeStatus(item.status))),
)
const adultsAttending = computed(() =>
  Math.max(num(guestSummary.value.attendeesAttending) - num(guestSummary.value.children), 0),
)
const vegetarianCount = computed(() => num(guestSummary.value.dietCounts?.vegetarian))
const veganCount = computed(() => num(guestSummary.value.dietCounts?.vegan))
const allergyCount = computed(() => Array.isArray(guestSummary.value.allergies) ? guestSummary.value.allergies.length : 0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [contributionData, summaryData] = await Promise.all([
      unwrap<unknown>(await api.get('/contributions')),
      api.get('/rsvp-summary').then(unwrap<GuestSummary>).catch(() => ({})),
    ])
    contributions.value = unwrapList(contributionData)
    guestSummary.value = summaryData
    noteDrafts.value = {}
  } catch (err) {
    error.value = errorMessage(err, 'Contributions could not be loaded.')
    guestSummary.value = {}
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
        title: contribution.title ?? '',
        category: contribution.category ?? 'other',
        description: contribution.description ?? '',
        participants: contribution.participants ?? '',
        durationMinutes: contribution.durationMinutes ?? 0,
        technicalRequirements: contribution.technicalRequirements ?? '',
        equipment: contribution.equipment ?? '',
        preferredTime: contribution.preferredTime ?? '',
        contactInformation: contribution.contactInformation ?? '',
        status: normalizeStatus(contribution.status),
        ...body,
      }),
    )
    await load()
    notice.value = 'Contribution updated.'
    setTimeout(() => { notice.value = '' }, 3000)
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

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text)
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
        <div class="btn-row">
          <button
            type="button"
            class="btn btn--ghost btn--small"
            :class="{ 'btn--active': viewMode === 'list' }"
            title="List view"
            @click="viewMode = 'list'"
          >☰ List</button>
          <button
            type="button"
            class="btn btn--ghost btn--small"
            :class="{ 'btn--active': viewMode === 'board' }"
            title="Board view"
            @click="viewMode = 'board'"
          >⊞ Board</button>
          <button type="button" class="btn btn--ghost btn--small" @click="load">
            Refresh
          </button>
        </div>
      </div>

      <p v-if="notice" class="notice notice--success" role="status">{{ notice }}</p>
      <p v-if="error" class="notice notice--error" role="alert">{{ error }}</p>
      <p v-if="loading" class="text-muted" aria-live="polite">Loading contributions…</p>

      <template v-else>
        <section class="stack dashboard__summary">
          <div>
            <p class="eyebrow">Overview</p>
            <h2>Programme planning</h2>
          </div>

          <div class="grid grid--4">
            <div class="stat">
              <p class="stat__value">{{ totalContributions }}</p>
              <p class="stat__label">Total contributions</p>
            </div>
            <div class="stat">
              <p class="stat__value">{{ confirmedContributions }}</p>
              <p class="stat__label">Confirmed</p>
            </div>
            <div class="stat">
              <p class="stat__value">{{ unconfirmedContributions }}</p>
              <p class="stat__label">Pending</p>
            </div>
            <div class="stat">
              <p class="stat__value">{{ totalDuration }}</p>
              <p class="stat__label">Total duration (min)</p>
            </div>
          </div>

          <div class="card dashboard__budget">
            <div class="dashboard__budget-header">
              <div>
                <h3>Time budget</h3>
                <p class="text-muted">Program planned: {{ totalDuration }} / {{ recommendedMinutes }} recommended minutes</p>
              </div>
              <span class="badge badge--accent">{{ plannedMinutesPercentage }}%</span>
            </div>
            <div class="dashboard__budget-track" aria-hidden="true">
              <span class="dashboard__budget-fill" :style="{ width: `${plannedMinutesPercentage}%` }"></span>
            </div>
          </div>

          <div class="grid grid--3">
            <section class="card dashboard__task-card">
              <h3>Missing phone numbers</h3>
              <p class="dashboard__task-count">{{ missingPhoneContributions.length }}</p>
              <ul v-if="missingPhoneContributions.length" class="list-plain dashboard__task-list">
                <li v-for="item in missingPhoneContributions" :key="`phone-${item.id}`">{{ item.title || 'Untitled contribution' }}</li>
              </ul>
              <p v-else class="text-muted">All contribution contacts are covered.</p>
            </section>

            <section class="card dashboard__task-card">
              <h3>Unconfirmed items</h3>
              <p class="dashboard__task-count">{{ pendingStatusContributions.length }}</p>
              <ul v-if="pendingStatusContributions.length" class="list-plain dashboard__task-list">
                <li v-for="item in pendingStatusContributions" :key="`status-${item.id}`">{{ item.title || 'Untitled contribution' }}</li>
              </ul>
              <p v-else class="text-muted">Every contribution has a final status.</p>
            </section>

            <section class="card dashboard__task-card">
              <h3>Tech confirmations</h3>
              <p class="dashboard__task-count">{{ techConfirmationContributions.length }}</p>
              <ul v-if="techConfirmationContributions.length" class="list-plain dashboard__task-list">
                <li v-for="item in techConfirmationContributions" :key="`tech-${item.id}`">
                  {{ item.title || 'Untitled contribution' }}
                </li>
              </ul>
              <p v-else class="text-muted">No open technical follow-up.</p>
            </section>
          </div>

          <section class="card dashboard__food">
            <div class="dashboard__food-header">
              <div>
                <p class="eyebrow">Guest food summary</p>
                <h3>Meal planning snapshot</h3>
              </div>
            </div>
            <div class="grid grid--4">
              <div class="dashboard__mini-stat">
                <span>Adults</span>
                <strong>{{ adultsAttending }}</strong>
              </div>
              <div class="dashboard__mini-stat">
                <span>Children</span>
                <strong>{{ guestSummary.children ?? 0 }}</strong>
              </div>
              <div class="dashboard__mini-stat">
                <span>Vegetarian</span>
                <strong>{{ vegetarianCount }}</strong>
              </div>
              <div class="dashboard__mini-stat">
                <span>Vegan</span>
                <strong>{{ veganCount }}</strong>
              </div>
            </div>
            <p class="dashboard__food-allergies text-muted">Allergy reports: {{ allergyCount }}</p>
          </section>
        </section>

        <div v-if="viewMode === 'list'" class="contribution-list">
        <p v-if="contributions.length === 0" class="text-muted">No contributions yet.</p>

        <article
          v-for="contribution in contributions"
          :key="contribution.id"
          class="card contribution"
        >
          <!-- Mobile card header -->
          <div class="contribution__header">
            <span class="badge badge--accent">{{ categoryLabel(contribution) }}</span>
            <span
              class="badge"
              :class="{
                'badge--primary': normalizeStatus(contribution.status) === 'confirmed',
                'badge--muted': normalizeStatus(contribution.status) === 'rejected',
              }"
            >{{ STATUS_DISPLAY[normalizeStatus(contribution.status)] }}</span>
          </div>

          <h3 class="contribution__title">{{ contribution.title || 'Untitled' }}</h3>

          <!-- Mobile-friendly meta list -->
          <ul class="list-plain contribution__meta">
            <li v-if="contribution.participants">
              <span class="meta__label">Participants</span>
              <span>{{ contribution.participants }}</span>
            </li>
            <li v-if="contribution.durationMinutes">
              <span class="meta__label">Duration</span>
              <span>{{ contribution.durationMinutes }} min</span>
            </li>
            <li v-if="contribution.preferredTime">
              <span class="meta__label">Preferred time</span>
              <span>{{ contribution.preferredTime }}</span>
            </li>
            <li v-if="contribution.equipment">
              <span class="meta__label">Equipment</span>
              <span>{{ contribution.equipment }}</span>
            </li>
            <li v-if="contribution.technicalRequirements">
              <span class="meta__label">Technical</span>
              <span>{{ contribution.technicalRequirements }}</span>
            </li>
          </ul>

          <p v-if="contribution.description" class="contribution__description">
            {{ contribution.description }}
          </p>

          <!-- Contact with call action (spec §17) -->
          <div v-if="contactOf(contribution)" class="contact-row">
            <span class="contact-row__value">{{ contactOf(contribution) }}</span>
            <a
              v-if="isPhone(contactOf(contribution))"
              :href="`tel:${contactOf(contribution).replace(/\s/g, '')}`"
              class="btn btn--secondary btn--small"
              title="Call"
            >📞 Call</a>
            <button
              type="button"
              class="btn btn--ghost btn--small"
              title="Copy contact"
              @click="copyToClipboard(contactOf(contribution))"
            >Copy</button>
          </div>

          <!-- Status change -->
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
              >{{ status.label }}</option>
            </select>
          </div>

          <!-- Internal notes -->
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
          >Save notes</button>
        </article>
        </div>

        <div v-else class="board">
        <section
          v-for="column in columns"
          :key="column.value"
          class="board__column"
          :aria-label="column.label"
        >
          <h2 class="board__heading">
            {{ column.displayLabel }}
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
            <div class="contribution__header">
              <span class="badge badge--accent">{{ categoryLabel(contribution) }}</span>
            </div>

            <h3 class="contribution__title">{{ contribution.title || 'Untitled' }}</h3>

            <ul class="list-plain contribution__meta">
              <li v-if="contribution.participants">
                <span class="meta__label">Participants</span>
                <span>{{ contribution.participants }}</span>
              </li>
              <li v-if="contribution.durationMinutes">
                <span class="meta__label">Duration</span>
                <span>{{ contribution.durationMinutes }} min</span>
              </li>
            </ul>

            <p v-if="contribution.description" class="contribution__description">
              {{ contribution.description }}
            </p>

            <!-- Contact with call action -->
            <div v-if="contactOf(contribution)" class="contact-row">
              <span class="contact-row__value">{{ contactOf(contribution) }}</span>
              <a
                v-if="isPhone(contactOf(contribution))"
                :href="`tel:${contactOf(contribution).replace(/\s/g, '')}`"
                class="btn btn--secondary btn--small"
              >📞</a>
            </div>

            <div class="field">
              <label :for="`board-status-${contribution.id}`">Status</label>
              <select
                :id="`board-status-${contribution.id}`"
                :value="normalizeStatus(contribution.status)"
                :disabled="busyId === String(contribution.id)"
                @change="changeStatus(contribution, $event)"
              >
                <option
                  v-for="status in STATUSES"
                  :key="status.value"
                  :value="status.value"
                >{{ status.label }}</option>
              </select>
            </div>

            <div class="field">
              <label :for="`board-notes-${contribution.id}`">Internal notes</label>
              <textarea
                :id="`board-notes-${contribution.id}`"
                :value="draftFor(contribution)"
                @input="setDraft(contribution, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </div>

            <button
              type="button"
              class="btn btn--secondary btn--small"
              :disabled="busyId === String(contribution.id)"
              @click="saveNotes(contribution)"
            >Save notes</button>
          </article>
        </section>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.dashboard__summary {
  margin-bottom: calc(var(--spacing) * 1.5);
}

.dashboard__budget {
  display: grid;
  gap: 1rem;
}

.dashboard__budget-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.dashboard__budget-track {
  height: 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-accent-light) 80%, white);
  overflow: hidden;
}

.dashboard__budget-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 75%, white));
}

.dashboard__task-card {
  display: grid;
  gap: 0.9rem;
}

.dashboard__task-count {
  font-family: var(--font-heading);
  font-size: 2rem;
  color: var(--color-primary-dark);
  margin: 0;
}

.dashboard__task-list {
  display: grid;
  gap: 0.45rem;
  color: var(--color-text-muted);
}

.dashboard__task-list li {
  padding-bottom: 0.45rem;
  border-bottom: var(--border-subtle);
}

.dashboard__task-list li:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.dashboard__food {
  display: grid;
  gap: 1rem;
}

.dashboard__food-header h3 {
  margin-bottom: 0;
}

.dashboard__mini-stat {
  border: var(--border-subtle);
  border-radius: var(--radius);
  padding: 0.9rem 1rem;
  background: color-mix(in srgb, var(--color-surface) 82%, var(--color-accent-light));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--color-text-muted);
  font-weight: 600;
}

.dashboard__mini-stat strong {
  font-family: var(--font-heading);
  font-size: 1.55rem;
  color: var(--color-primary-dark);
}

.dashboard__food-allergies {
  margin: 0;
}

/* ── List view ── */
.contribution-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.contribution__header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.contribution__title {
  margin-bottom: 0.5rem;
}

.contribution__meta {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: var(--spacing);
  font-size: 0.88rem;
}

.contribution__meta li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.meta__label {
  color: var(--color-text-muted);
  min-width: 7rem;
  flex-shrink: 0;
}

.contribution__description {
  font-size: 0.92rem;
  white-space: pre-line;
  margin-bottom: var(--spacing);
}

/* Contact row with call action (spec §17) */
.contact-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: var(--spacing);
  padding: 0.6rem 0.75rem;
  background-color: var(--color-background);
  border-radius: var(--radius);
  border: var(--border-subtle);
}

.contact-row__value {
  flex: 1;
  font-size: 0.95rem;
  word-break: break-all;
}

/* View toggle active state */
.btn--active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* ── Board / kanban view ── */
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

.board .contribution {
  margin-bottom: var(--spacing);
}

@media (min-width: 60rem) {
  .board {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: start;
  }
}
</style>
