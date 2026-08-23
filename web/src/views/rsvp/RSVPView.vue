<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, errorMessage, unwrap } from '@/composables/useApi'

const props = defineProps<{ token: string }>()

type AttendanceStatus = 'yes' | 'no' | 'maybe' | 'pending'

interface Attendee {
  id?: number | string
  name: string
  attending: boolean
  is_child: boolean
  diet: string
  allergies: string
  notes: string
}

interface RsvpResponse {
  status?: string
  rsvp_status?: string
  message?: string
  max_guests?: number
  invitation_name?: string
  guest_name?: string
  attendees?: Array<Record<string, unknown>>
  guests?: Array<Record<string, unknown>>
  invitation?: {
    name?: string
    max_guests?: number
    status?: string
  }
  rsvp?: RsvpResponse
  contributions_enabled?: boolean
}

const DIET_OPTIONS = [
  { value: '', label: 'No preference' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescetarian', label: 'Pescetarian' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'gluten_free', label: 'Gluten free' },
  { value: 'lactose_free', label: 'Lactose free' },
  { value: 'other', label: 'Other (see notes)' },
]

const CONTRIBUTION_CATEGORIES = [
  { value: 'speech', label: 'Speech' },
  { value: 'music', label: 'Music' },
  { value: 'performance', label: 'Performance' },
  { value: 'game', label: 'Game' },
  { value: 'slideshow', label: 'Slideshow / video' },
  { value: 'other', label: 'Other' },
]

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'yes', label: 'Yes, we will be there' },
  { value: 'no', label: 'Sorry, we cannot come' },
  { value: 'maybe', label: 'Maybe' },
]

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

const invitationName = ref('')
const maxGuests = ref(1)
const status = ref<AttendanceStatus>('pending')
const message = ref('')
const attendees = ref<Attendee[]>([])

const contributionsEnabled = ref(true)
const showContribution = ref(false)
const contributionSaving = ref(false)
const contributionError = ref('')
const contributionSaved = ref(false)

const contribution = reactive({
  title: '',
  category: 'speech',
  description: '',
  participants: '',
  duration_minutes: 5,
  technical_requirements: '',
  equipment: '',
  preferred_time: '',
  contact_info: '',
})

const canAddAttendee = computed(() => attendees.value.length < maxGuests.value)
const attendingCount = computed(
  () => attendees.value.filter((a) => a.attending).length,
)
const isAttending = computed(() => status.value === 'yes' || status.value === 'maybe')

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return fallback
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true' || value === '1'
  if (typeof value === 'number') return value !== 0
  return fallback
}

function emptyAttendee(): Attendee {
  return {
    name: '',
    attending: true,
    is_child: false,
    diet: '',
    allergies: '',
    notes: '',
  }
}

function normalizeStatus(value: unknown): AttendanceStatus {
  const raw = str(value).toLowerCase()
  if (['yes', 'accepted', 'attending', 'accept'].includes(raw)) return 'yes'
  if (['no', 'declined', 'decline', 'not_attending'].includes(raw)) return 'no'
  if (['maybe', 'tentative', 'unsure'].includes(raw)) return 'maybe'
  return 'pending'
}

function toAttendee(raw: Record<string, unknown>): Attendee {
  return {
    id: (raw.id as number | string | undefined) ?? undefined,
    name: str(raw.name ?? raw.full_name),
    attending: bool(raw.attending ?? raw.is_attending, true),
    is_child: bool(raw.is_child ?? raw.child),
    diet: str(raw.diet ?? raw.dietary_requirement ?? raw.diet_preference),
    allergies: str(raw.allergies),
    notes: str(raw.notes ?? raw.note),
  }
}

function applyResponse(payload: RsvpResponse) {
  const data: RsvpResponse = payload?.rsvp ? { ...payload, ...payload.rsvp } : payload ?? {}
  const invitation = payload?.invitation ?? {}

  invitationName.value = str(
    invitation.name ?? data.invitation_name ?? data.guest_name,
  )
  const max = Number(invitation.max_guests ?? data.max_guests ?? 0)
  maxGuests.value = Number.isFinite(max) && max > 0 ? max : 1

  status.value = normalizeStatus(data.status ?? data.rsvp_status)
  message.value = str(data.message)

  const rawAttendees = data.attendees ?? data.guests ?? []
  attendees.value = rawAttendees.map(toAttendee)

  if (attendees.value.length === 0) {
    const seed = emptyAttendee()
    seed.name = invitationName.value
    attendees.value = [seed]
  }

  if (typeof payload?.contributions_enabled === 'boolean') {
    contributionsEnabled.value = payload.contributions_enabled
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await unwrap<RsvpResponse>(
      await api.get(`/rsvp/${encodeURIComponent(props.token)}`),
    )
    applyResponse(data)
  } catch (err) {
    loadError.value = errorMessage(
      err,
      'This invitation link is not valid or has expired.',
    )
  } finally {
    loading.value = false
  }
}

function addAttendee() {
  if (!canAddAttendee.value) return
  attendees.value.push(emptyAttendee())
}

function removeAttendee(index: number) {
  attendees.value.splice(index, 1)
  if (attendees.value.length === 0) {
    attendees.value.push(emptyAttendee())
  }
}

async function submitRsvp() {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  saved.value = false
  try {
    const payload = {
      status: status.value,
      message: message.value,
      attendees: attendees.value
        .filter((attendee) => attendee.name.trim() !== '')
        .map((attendee) => ({
          id: attendee.id,
          name: attendee.name.trim(),
          attending: status.value === 'no' ? false : attendee.attending,
          is_child: attendee.is_child,
          diet: attendee.diet,
          allergies: attendee.allergies,
          notes: attendee.notes,
        })),
    }
    const data = await unwrap<RsvpResponse>(
      await api.put(`/rsvp/${encodeURIComponent(props.token)}`, payload),
    )
    if (data && typeof data === 'object') {
      applyResponse(data)
    }
    saved.value = true
  } catch (err) {
    saveError.value = errorMessage(err, 'Your response could not be saved.')
  } finally {
    saving.value = false
  }
}

async function submitContribution() {
  if (contributionSaving.value) return
  contributionSaving.value = true
  contributionError.value = ''
  contributionSaved.value = false
  try {
    await unwrap<unknown>(
      await api.post(`/rsvp/${encodeURIComponent(props.token)}/contributions`, {
        ...contribution,
        duration_minutes: Number(contribution.duration_minutes) || 0,
      }),
    )
    contributionSaved.value = true
    contribution.title = ''
    contribution.description = ''
    contribution.participants = ''
    contribution.technical_requirements = ''
    contribution.equipment = ''
    contribution.preferred_time = ''
    showContribution.value = false
  } catch (err) {
    contributionError.value = errorMessage(
      err,
      'Your contribution could not be submitted.',
    )
  } finally {
    contributionSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="section">
    <div class="rsvp container">
      <p v-if="loading" class="text-muted" aria-live="polite">Loading your invitation…</p>

      <div v-else-if="loadError" class="notice notice--error" role="alert">
        {{ loadError }}
      </div>

      <template v-else>
        <header class="stack rsvp__header">
          <p class="eyebrow">Invitation</p>
          <h1>{{ invitationName || 'Please respond' }}</h1>
          <p class="text-muted">
            We would love to know whether you can join us. You can update your answer at
            any time using this link.
          </p>
        </header>

        <form class="card stack" novalidate @submit.prevent="submitRsvp">
          <fieldset>
            <legend>Will you attend?</legend>
            <div class="radio-group" role="radiogroup" aria-label="Attendance">
              <label
                v-for="option in ATTENDANCE_OPTIONS"
                :key="option.value"
                class="radio-option"
                :class="{ 'radio-option--active': status === option.value }"
              >
                <input
                  v-model="status"
                  type="radio"
                  name="attendance"
                  :value="option.value"
                />
                <span>{{ option.label }}</span>
              </label>
            </div>
          </fieldset>

          <fieldset v-if="isAttending">
            <legend>Who is coming?</legend>
            <p class="text-muted rsvp__hint">
              {{ attendees.length }} of {{ maxGuests }} places used ·
              {{ attendingCount }} attending
            </p>

            <div
              v-for="(attendee, index) in attendees"
              :key="index"
              class="attendee"
            >
              <div class="attendee__head">
                <h3 class="attendee__title">Guest {{ index + 1 }}</h3>
                <button
                  v-if="attendees.length > 1"
                  type="button"
                  class="btn btn--ghost btn--small"
                  @click="removeAttendee(index)"
                >
                  Remove
                </button>
              </div>

              <div class="field">
                <label :for="`attendee-name-${index}`">Name</label>
                <input
                  :id="`attendee-name-${index}`"
                  v-model="attendee.name"
                  type="text"
                  autocomplete="name"
                />
              </div>

              <div class="attendee__flags">
                <label class="checkbox">
                  <input v-model="attendee.attending" type="checkbox" />
                  <span>Attending</span>
                </label>
                <label class="checkbox">
                  <input v-model="attendee.is_child" type="checkbox" />
                  <span>Child</span>
                </label>
              </div>

              <div class="field">
                <label :for="`attendee-diet-${index}`">Dietary requirement</label>
                <select :id="`attendee-diet-${index}`" v-model="attendee.diet">
                  <option
                    v-for="option in DIET_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="field">
                <label :for="`attendee-allergies-${index}`">Allergies</label>
                <input
                  :id="`attendee-allergies-${index}`"
                  v-model="attendee.allergies"
                  type="text"
                  placeholder="e.g. nuts, shellfish"
                />
              </div>

              <div class="field">
                <label :for="`attendee-notes-${index}`">Notes</label>
                <input
                  :id="`attendee-notes-${index}`"
                  v-model="attendee.notes"
                  type="text"
                />
              </div>
            </div>

            <button
              type="button"
              class="btn btn--secondary btn--small"
              :disabled="!canAddAttendee"
              @click="addAttendee"
            >
              Add guest
            </button>
            <p v-if="!canAddAttendee" class="text-muted rsvp__hint">
              Your invitation covers up to {{ maxGuests }}
              {{ maxGuests === 1 ? 'guest' : 'guests' }}.
            </p>
          </fieldset>

          <div class="field">
            <label for="rsvp-message">Message to the couple</label>
            <textarea id="rsvp-message" v-model="message"></textarea>
          </div>

          <p v-if="saveError" class="notice notice--error" role="alert">
            {{ saveError }}
          </p>
          <p v-else-if="saved" class="notice notice--success" role="status">
            Thank you — your response has been saved.
          </p>

          <div class="btn-row">
            <button type="submit" class="btn" :disabled="saving">
              {{ saving ? 'Saving…' : 'Send response' }}
            </button>
          </div>
        </form>

        <section
          v-if="saved && contributionsEnabled && status !== 'no'"
          class="card stack rsvp__contribution"
          aria-labelledby="contribution-title"
        >
          <div>
            <p class="eyebrow">Optional</p>
            <h2 id="contribution-title">Would you like to contribute?</h2>
            <p class="text-muted">
              A speech, a song, a game — tell us about your idea and it will be
              coordinated for you. The couple will not see this.
            </p>
          </div>

          <p v-if="contributionSaved" class="notice notice--success" role="status">
            Thank you — your contribution has been submitted.
          </p>

          <button
            v-if="!showContribution"
            type="button"
            class="btn btn--secondary"
            @click="showContribution = true"
          >
            Register a contribution
          </button>

          <form v-else novalidate @submit.prevent="submitContribution">
            <div class="field">
              <label for="contribution-title-input">Title</label>
              <input
                id="contribution-title-input"
                v-model="contribution.title"
                type="text"
                required
              />
            </div>

            <div class="field">
              <label for="contribution-category">Category</label>
              <select id="contribution-category" v-model="contribution.category">
                <option
                  v-for="option in CONTRIBUTION_CATEGORIES"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>

            <div class="field">
              <label for="contribution-description">Description</label>
              <textarea
                id="contribution-description"
                v-model="contribution.description"
              ></textarea>
            </div>

            <div class="field">
              <label for="contribution-participants">Participants</label>
              <input
                id="contribution-participants"
                v-model="contribution.participants"
                type="text"
                placeholder="Who is taking part?"
              />
            </div>

            <div class="field">
              <label for="contribution-duration">Duration (minutes)</label>
              <input
                id="contribution-duration"
                v-model.number="contribution.duration_minutes"
                type="number"
                min="0"
                step="1"
              />
            </div>

            <div class="field">
              <label for="contribution-technical">Technical requirements</label>
              <textarea
                id="contribution-technical"
                v-model="contribution.technical_requirements"
              ></textarea>
            </div>

            <div class="field">
              <label for="contribution-equipment">Equipment</label>
              <input
                id="contribution-equipment"
                v-model="contribution.equipment"
                type="text"
                placeholder="e.g. microphone, projector"
              />
            </div>

            <div class="field">
              <label for="contribution-preferred-time">Preferred time</label>
              <input
                id="contribution-preferred-time"
                v-model="contribution.preferred_time"
                type="text"
                placeholder="e.g. after dinner"
              />
            </div>

            <div class="field">
              <label for="contribution-contact">Contact info</label>
              <input
                id="contribution-contact"
                v-model="contribution.contact_info"
                type="text"
                placeholder="Email or phone number"
              />
            </div>

            <p v-if="contributionError" class="notice notice--error" role="alert">
              {{ contributionError }}
            </p>

            <div class="btn-row">
              <button type="submit" class="btn" :disabled="contributionSaving">
                {{ contributionSaving ? 'Submitting…' : 'Submit contribution' }}
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click="showContribution = false"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.rsvp {
  max-width: 44rem;
}

.rsvp__header {
  margin-bottom: calc(var(--spacing) * 1.5);
}

.rsvp__hint {
  font-size: 0.85rem;
}

.rsvp__contribution {
  margin-top: calc(var(--spacing) * 1.5);
}

.attendee {
  border: var(--border-subtle);
  border-radius: var(--radius);
  padding: var(--spacing);
  margin-bottom: var(--spacing);
  background-color: var(--color-background);
}

.attendee__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.attendee__title {
  margin: 0;
  font-size: 0.95rem;
}

.attendee__flags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing);
  margin-bottom: var(--spacing);
}
</style>
