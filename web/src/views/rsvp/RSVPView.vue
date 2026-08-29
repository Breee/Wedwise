<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, errorMessage, unwrap } from '@/composables/useApi'

const props = defineProps<{ token: string }>()

type AttendanceStatus = 'yes' | 'no' | 'pending'
type AttendeeRole = 'primary' | 'companion' | 'child'

interface Attendee {
  id?: number | string
  name: string
  isChild: boolean
  diet: string
  allergies: string
  notes: string
  role: AttendeeRole
  childAge: string
  phoneHint?: string
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
}

const DIET_OPTIONS = [
  { value: '', label: 'No preference / standard menu' },
  { value: 'vegetarian', label: '🥗 Vegetarian' },
  { value: 'vegan', label: '🌱 Vegan' },
  { value: 'pescetarian', label: '🐟 Pescetarian' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'lactose_free', label: 'Lactose-free' },
  { value: 'other', label: 'Other (describe in notes)' },
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
const phone = ref('')
const musicWish = ref('')
const attendees = ref<Attendee[]>([])

// Contribution: inline yes/no + optional fields
const wantsContribution = ref<boolean | null>(null)
const contributionSaving = ref(false)
const contributionError = ref('')
const contributionSaved = ref(false)

const contribution = reactive({
  title: '',
  description: '',
  duration_minutes: 10,
  technical_requirements: '',
  contact_info: '',
})

const isAttending = computed(() => status.value === 'yes')
const canAddAttendee = computed(() => attendees.value.length < maxGuests.value)
const hasCompanion = computed(() => attendees.value.some((attendee) => attendee.role === 'companion'))
const childrenCount = computed(() => attendees.value.filter((attendee) => attendee.role === 'child').length)

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

function emptyAttendee(role: AttendeeRole = 'companion'): Attendee {
  return {
    name: '',
    isChild: role === 'child',
    diet: '',
    allergies: '',
    notes: '',
    role,
    childAge: '',
  }
}

function extractManagedValue(notes: string, label: string): string {
  const match = notes.match(new RegExp(`${label}:\\s*(.+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function stripManagedNotes(notes: string): string {
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^Phone:/i.test(line) && !/^Child age:/i.test(line))
    .join('\n')
}

function normalizeStatus(value: unknown): AttendanceStatus {
  const raw = str(value).toLowerCase()
  if (['yes', 'accepted', 'attending', 'accept', 'maybe'].includes(raw)) return 'yes'
  if (['no', 'declined', 'decline', 'not_attending'].includes(raw)) return 'no'
  return 'pending'
}

function toAttendee(raw: Record<string, unknown>): Attendee {
  const notes = str(raw.notes)
  const isChild = bool(raw.is_child ?? raw.isChild ?? raw.child)
  return {
    id: (raw.id as number | string | undefined) ?? undefined,
    name: str(raw.name ?? raw.full_name),
    isChild,
    diet: str(raw.diet ?? raw.dietary_requirement ?? raw.diet_preference),
    allergies: str(raw.allergies),
    notes: stripManagedNotes(notes),
    role: isChild ? 'child' : 'companion',
    childAge: extractManagedValue(notes, 'Child age'),
    phoneHint: extractManagedValue(notes, 'Phone'),
  }
}

function normalizeAttendees(items: Attendee[]): Attendee[] {
  const adults = items.filter((attendee) => attendee.role !== 'child' && !attendee.isChild)
  const children = items.filter((attendee) => attendee.role === 'child' || attendee.isChild)
  const ordered: Attendee[] = []

  if (adults.length > 0) {
    ordered.push({ ...adults[0], role: 'primary', isChild: false })
    adults.slice(1).forEach((attendee) => {
      ordered.push({ ...attendee, role: 'companion', isChild: false })
    })
  } else {
    ordered.push(emptyAttendee('primary'))
  }

  children.forEach((attendee) => {
    ordered.push({ ...attendee, role: 'child', isChild: true })
  })

  return ordered
}

function parseMessage(rawMessage: string) {
  const lines = rawMessage.split('\n')
  const remaining: string[] = []
  let parsedMusicWish = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^🎵\s*Music wish:/i.test(trimmed)) {
      parsedMusicWish = trimmed.replace(/^🎵\s*Music wish:\s*/i, '')
      continue
    }
    remaining.push(line)
  }

  return {
    message: remaining.join('\n').trim(),
    musicWish: parsedMusicWish,
  }
}

function applyResponse(payload: RsvpResponse) {
  const data: RsvpResponse = payload?.rsvp ? { ...payload, ...payload.rsvp } : (payload ?? {})
  const invitation = payload?.invitation ?? {}

  invitationName.value = str(invitation.name ?? data.invitation_name ?? data.guest_name)
  const max = Number(invitation.max_guests ?? data.max_guests ?? 0)
  maxGuests.value = Number.isFinite(max) && max > 0 ? max : 1

  status.value = normalizeStatus(data.status ?? data.rsvp_status)
  const parsedMessage = parseMessage(str(data.message))
  message.value = parsedMessage.message
  musicWish.value = parsedMessage.musicWish

  const rawAttendees = data.attendees ?? data.guests ?? []
  if (rawAttendees.length === 0) {
    const seed = emptyAttendee('primary')
    seed.name = invitationName.value
    attendees.value = [seed]
  } else {
    attendees.value = normalizeAttendees(rawAttendees.map((a) => toAttendee(a as Record<string, unknown>)))
  }

  phone.value = attendees.value[0]?.phoneHint ?? ''
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
    loadError.value = errorMessage(err, 'This invitation link is not valid or has expired.')
  } finally {
    loading.value = false
  }
}

function addCompanion() {
  if (!canAddAttendee.value || hasCompanion.value) return
  attendees.value.splice(1, 0, emptyAttendee('companion'))
}

function addChild() {
  if (!canAddAttendee.value) return
  attendees.value.push(emptyAttendee('child'))
}

function removeAttendee(index: number) {
  attendees.value.splice(index, 1)
  if (attendees.value.length === 0) attendees.value.push(emptyAttendee('primary'))
  attendees.value = normalizeAttendees(attendees.value)
}

function attendeeTitle(attendee: Attendee, index: number) {
  if (attendee.role === 'primary') return 'Primary guest'
  if (attendee.role === 'companion') return 'Companion'
  const position = attendees.value.slice(0, index + 1).filter((entry) => entry.role === 'child').length
  return `Child ${position}`
}

function buildAttendeeNotes(attendee: Attendee, index: number) {
  const lines = stripManagedNotes(attendee.notes)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (index === 0 && phone.value.trim()) {
    lines.unshift(`Phone: ${phone.value.trim()}`)
  }

  if (attendee.role === 'child' && attendee.childAge.trim()) {
    lines.push(`Child age: ${attendee.childAge.trim()}`)
  }

  return lines.join('\n')
}

async function submitRsvp() {
  if (saving.value) return
  if (!phone.value.trim()) {
    saveError.value = 'Please add a phone number for the primary contact.'
    return
  }
  saving.value = true
  saveError.value = ''
  saved.value = false
  try {
    const compiledMessage = [
      musicWish.value.trim() ? `🎵 Music wish: ${musicWish.value.trim()}` : '',
      message.value.trim(),
    ].filter(Boolean).join('\n')

    const payload = {
      status: status.value,
      message: compiledMessage,
      attendees: attendees.value
        .filter((a) => a.name.trim() !== '')
        .map((a, index) => ({
          id: a.id,
          name: a.name.trim(),
          attending: isAttending.value,
          isChild: a.role === 'child',
          diet: a.diet,
          allergies: a.allergies,
          notes: buildAttendeeNotes(a, index),
        })),
    }
    const data = await unwrap<RsvpResponse>(
      await api.put(`/rsvp/${encodeURIComponent(props.token)}`, payload),
    )
    if (data && typeof data === 'object') applyResponse(data)
    saved.value = true

    // Auto-submit contribution if filled in
    if (wantsContribution.value && contribution.title.trim()) {
      await submitContribution()
    }
  } catch (err) {
    saveError.value = errorMessage(err, 'Your response could not be saved.')
  } finally {
    saving.value = false
  }
}

async function submitContribution() {
  contributionSaving.value = true
  contributionError.value = ''
  try {
    await unwrap<unknown>(
      await api.post(`/rsvp/${encodeURIComponent(props.token)}/contributions`, {
        title: contribution.title.trim(),
        description: contribution.description.trim(),
        duration_minutes: Number(contribution.duration_minutes) || 0,
        technical_requirements: contribution.technical_requirements.trim(),
        contact_information: contribution.contact_info.trim(),
        status: 'new',
      }),
    )
    contributionSaved.value = true
  } catch (err) {
    contributionError.value = errorMessage(err, 'Your contribution could not be submitted.')
    throw err
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
        <header class="rsvp__header stack">
          <RouterLink to="/" class="rsvp__back">← Back</RouterLink>
          <p class="eyebrow">Invitation</p>
          <h1>{{ invitationName || 'Your RSVP' }}</h1>
          <p class="text-muted">
            We would love to know whether you can join us.
            You can update your answer any time using this link.
          </p>
        </header>

        <!-- Success state after saving -->
        <div v-if="saved" class="card stack rsvp__success">
          <div class="rsvp__success-icon">🎉</div>
          <h2>Thank you!</h2>
          <p class="text-muted">
            Your response has been saved. You can return to this page at any time
            to update it.
          </p>
          <p v-if="contributionSaved" class="notice notice--success" role="status">
            Your contribution has been submitted and will be coordinated for you.
            The couple will not see this.
          </p>
          <p v-if="contributionError" class="notice notice--error" role="alert">
            {{ contributionError }}
          </p>
          <button type="button" class="btn btn--secondary" @click="saved = false">
            Edit my response
          </button>
        </div>

        <form v-else class="stack" novalidate @submit.prevent="submitRsvp">

          <!-- ── Step 1: Attendance ─────────────────────────── -->
          <div class="card stack">
            <h2 class="rsvp__section-title">Will you attend?</h2>
            <div class="attendance-choice">
              <button
                type="button"
                class="attendance-btn"
                :class="{ 'attendance-btn--active attendance-btn--yes': status === 'yes' }"
                @click="status = 'yes'"
              >
                <span class="attendance-btn__icon">🎉</span>
                <span class="attendance-btn__label">Yes, I'll be there!</span>
              </button>
              <button
                type="button"
                class="attendance-btn"
                :class="{ 'attendance-btn--active attendance-btn--no': status === 'no' }"
                @click="status = 'no'"
              >
                <span class="attendance-btn__icon">😔</span>
                <span class="attendance-btn__label">Sorry, I can't make it</span>
              </button>
            </div>
          </div>

          <!-- ── Step 2: Guest details (when attending) ──────── -->
          <div v-if="isAttending" class="card stack">
            <div class="rsvp__section-header">
              <h2 class="rsvp__section-title">Who is coming?</h2>
              <span class="text-muted rsvp__hint">
                {{ attendees.length }} / {{ maxGuests }} guests added · {{ childrenCount }} children
              </span>
            </div>

            <div
              v-for="(attendee, index) in attendees"
              :key="index"
              class="attendee-card"
            >
              <div class="attendee-card__head">
                <div>
                  <strong>{{ attendeeTitle(attendee, index) }}</strong>
                  <p class="attendee-card__type text-muted">
                    {{ attendee.role === 'child' ? 'Add age for meal planning.' : 'Adult attendee' }}
                  </p>
                </div>
                <button
                  v-if="index > 0"
                  type="button"
                  class="btn btn--ghost btn--small"
                  @click="removeAttendee(index)"
                >
                  Remove
                </button>
              </div>

              <div class="attendee-card__fields">
                <div class="field">
                  <label :for="`name-${index}`">Full name <span class="required">*</span></label>
                  <input
                    :id="`name-${index}`"
                    v-model="attendee.name"
                    type="text"
                    autocomplete="name"
                    placeholder="First and last name"
                    required
                  />
                </div>

                <div class="field">
                  <label :for="`diet-${index}`">Food preference</label>
                  <select :id="`diet-${index}`" v-model="attendee.diet">
                    <option
                      v-for="opt in DIET_OPTIONS"
                      :key="opt.value"
                      :value="opt.value"
                    >{{ opt.label }}</option>
                  </select>
                </div>

                <div class="field">
                  <label :for="`allergies-${index}`">Allergies or intolerances</label>
                  <input
                    :id="`allergies-${index}`"
                    v-model="attendee.allergies"
                    type="text"
                    placeholder="e.g. nuts, shellfish, gluten — leave blank if none"
                  />
                </div>

                <div v-if="attendee.role === 'child'" class="field">
                  <label :for="`child-age-${index}`">Age</label>
                  <input
                    :id="`child-age-${index}`"
                    v-model="attendee.childAge"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    step="1"
                    placeholder="Child's age"
                  />
                </div>
              </div>
            </div>

            <div v-if="canAddAttendee" class="rsvp__add-row">
              <button
                v-if="!hasCompanion"
                type="button"
                class="btn btn--secondary btn--small"
                @click="addCompanion"
              >
                + Add companion
              </button>
              <button
                v-if="canAddAttendee"
                type="button"
                class="btn btn--secondary btn--small"
                @click="addChild"
              >
                + Add child
              </button>
            </div>
            <p v-else class="text-muted rsvp__hint">
              Your invitation covers up to {{ maxGuests }}
              {{ maxGuests === 1 ? 'person' : 'people' }}.
            </p>
          </div>

          <div class="card stack">
            <h2 class="rsvp__section-title">Contact information</h2>
            <p class="text-muted">
              We will only use this for planning updates or quick coordination.
            </p>

            <div class="field">
              <label for="rsvp-phone">Phone number <span class="required">*</span></label>
              <input
                id="rsvp-phone"
                v-model="phone"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                placeholder="+49 170 1234567"
                required
              />
            </div>

            <div class="field">
              <label for="music-wish">Music wish <span class="optional">(optional)</span></label>
              <input
                id="music-wish"
                v-model="musicWish"
                type="text"
                placeholder="Is there a song you'd love to hear?"
              />
            </div>
          </div>

          <!-- ── Step 3: Message ─────────────────────────────── -->
          <div class="card stack">
            <h2 class="rsvp__section-title">Message to the couple <span class="optional">(optional)</span></h2>
            <div class="field">
              <label for="rsvp-message" class="visually-hidden">Your message</label>
              <textarea
                id="rsvp-message"
                v-model="message"
                placeholder="Leave a note, a wish, or anything you'd like to share…"
              ></textarea>
            </div>
          </div>

          <!-- ── Step 4: Contribution (only if attending) ──────── -->
          <div v-if="isAttending && !contributionSaved" class="card stack">
            <div>
              <h2 class="rsvp__section-title">Planning a contribution?</h2>
              <p class="text-muted">
                A speech, a song, a game — tell us and it will be coordinated for you.
                <strong>The couple will not see this.</strong>
              </p>
            </div>

            <div class="contribution-toggle">
              <button
                type="button"
                class="attendance-btn"
                :class="{ 'attendance-btn--active attendance-btn--yes': wantsContribution === true }"
                @click="wantsContribution = true"
              >
                <span class="attendance-btn__icon">🎤</span>
                <span class="attendance-btn__label">Yes, I have an idea!</span>
              </button>
              <button
                type="button"
                class="attendance-btn"
                :class="{ 'attendance-btn--active attendance-btn--no': wantsContribution === false }"
                @click="wantsContribution = false"
              >
                <span class="attendance-btn__icon">—</span>
                <span class="attendance-btn__label">No, not this time</span>
              </button>
            </div>

            <div v-if="wantsContribution" class="contribution-fields stack">
              <div class="field">
                <label for="c-title">What is your contribution? <span class="required">*</span></label>
                <input
                  id="c-title"
                  v-model="contribution.title"
                  type="text"
                  placeholder="e.g. Piano duet, Comedy speech, Slideshow"
                  required
                />
              </div>

              <div class="field">
                <label for="c-description">Description</label>
                <textarea
                  id="c-description"
                  v-model="contribution.description"
                  placeholder="Tell us a bit about what you're planning…"
                ></textarea>
              </div>

              <div class="field">
                <label for="c-duration">Estimated duration (minutes)</label>
                <input
                  id="c-duration"
                  v-model.number="contribution.duration_minutes"
                  type="number"
                  min="1"
                  step="1"
                />
              </div>

              <div class="field">
                <label for="c-needs">What do you need? <span class="optional">(optional)</span></label>
                <textarea
                  id="c-needs"
                  v-model="contribution.technical_requirements"
                  placeholder="e.g. microphone, projector, backing track, a moment right after dinner…"
                ></textarea>
              </div>

              <div class="field">
                <label for="c-contact">Your phone number (for coordination)</label>
                <input
                  id="c-contact"
                  v-model="contribution.contact_info"
                  type="tel"
                  inputmode="tel"
                  autocomplete="tel"
                  placeholder="+49 170 1234567"
                />
              </div>

              <p v-if="contributionError" class="notice notice--error" role="alert">
                {{ contributionError }}
              </p>
            </div>
          </div>

          <!-- ── Errors + Submit ──────────────────────────────── -->
          <p v-if="saveError" class="notice notice--error" role="alert">{{ saveError }}</p>

          <div class="rsvp__submit-row">
            <button
              type="submit"
              class="btn rsvp__submit-btn"
              :disabled="saving || status === 'pending'"
            >
              <span v-if="saving">Saving…</span>
              <span v-else-if="status === 'pending'">Select yes or no above</span>
              <span v-else>Send response</span>
            </button>
          </div>

        </form>
      </template>
    </div>
  </section>
</template>

<style scoped>
.rsvp {
  max-width: 44rem;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

@media (min-width: 48rem) {
  .rsvp { padding-bottom: calc(var(--spacing) * 3); }
}

.rsvp__back {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  min-height: 44px;
}

.rsvp__back:hover { color: var(--color-primary); }

.rsvp__header { margin-bottom: calc(var(--spacing) * 1.5); }

.rsvp__section-title {
  font-size: 1.05rem;
  margin: 0 0 0.25rem;
}

.rsvp__section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.rsvp__hint { font-size: 0.85rem; }

.optional {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--color-text-muted);
}

.required { color: var(--color-danger, #c0392b); }

/* ── Attendance buttons ── */
.attendance-choice,
.contribution-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.attendance-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 1rem;
  border: 2px solid var(--color-surface-muted);
  border-radius: var(--radius);
  background: var(--color-surface);
  cursor: pointer;
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  transition: border-color 0.15s, background-color 0.15s;
  min-height: 80px;
}

.attendance-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-surface-muted);
}

.attendance-btn--active {
  border-width: 2px;
}

.attendance-btn--yes.attendance-btn--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}

.attendance-btn--no.attendance-btn--active {
  border-color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-text-muted) 10%, transparent);
}

.attendance-btn__icon { font-size: 1.5rem; }
.attendance-btn__label { font-size: 0.85rem; text-align: center; }

/* ── Attendee cards ── */
.attendee-card {
  border: 1px solid var(--color-surface-muted);
  border-radius: var(--radius);
  padding: calc(var(--spacing) * 0.875);
  background: var(--color-background);
}

.attendee-card + .attendee-card { margin-top: var(--spacing); }

.attendee-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(var(--spacing) * 0.75);
  gap: 1rem;
}

.attendee-card__type {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
}

.attendee-card__fields { display: grid; gap: 0.75rem; }

.rsvp__add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

/* ── Contribution fields ── */
.contribution-fields {
  border-top: var(--border-subtle);
  padding-top: var(--spacing);
  margin-top: var(--spacing);
}

/* ── Submit ── */
.rsvp__submit-row {
  position: sticky;
  bottom: 0;
  background-color: var(--color-surface);
  border-top: var(--border-subtle);
  padding: 0.75rem var(--spacing);
  margin: 0;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
}

.rsvp__submit-btn { width: 100%; }

@media (min-width: 48rem) {
  .rsvp__submit-row {
    position: static;
    background: none;
    border-top: none;
    padding: 0;
    margin-top: var(--spacing);
  }
  .rsvp__submit-btn { width: auto; }
}

/* ── Success ── */
.rsvp__success { text-align: center; padding: calc(var(--spacing) * 2); }
.rsvp__success-icon { font-size: 3rem; }
.rsvp__success h2 { margin: 0; }
</style>
