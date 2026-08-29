<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, errorMessage, unwrap } from '@/composables/useApi'

interface Invitation {
  id: number | string
  name?: string
  token?: string
  status?: string
  enabled?: boolean
  disabled?: boolean
  rsvp_status?: string
  rsvp?: { status?: string } | null
  max_guests?: number
  isPublic?: boolean
  url?: string
}

const invitations = ref<Invitation[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const notice = ref('')
const showForm = ref(false)
const formError = ref('')
const revealed = ref<Record<string, boolean>>({})
const publicInvitation = ref<Invitation | null>(null)
const publicLoading = ref(true)

const form = reactive({
  name: '',
  max_guests: 2,
})

function unwrapList(payload: unknown): Invitation[] {
  if (Array.isArray(payload)) return payload as Invitation[]
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['invitations', 'items', 'data']) {
      if (Array.isArray(record[key])) return record[key] as Invitation[]
    }
  }
  return []
}

function maskToken(token?: string): string {
  if (!token) return '—'
  if (token.length <= 8) return `${token.slice(0, 2)}••••`
  return `${token.slice(0, 4)}••••${token.slice(-4)}`
}

function tokenDisplay(invitation: Invitation): string {
  if (!invitation.token) return '—'
  return revealed.value[String(invitation.id)]
    ? invitation.token
    : maskToken(invitation.token)
}

function toggleReveal(invitation: Invitation) {
  const key = String(invitation.id)
  revealed.value = { ...revealed.value, [key]: !revealed.value[key] }
}

function statusLabel(invitation: Invitation): string {
  if (invitation.status) return invitation.status
  if (invitation.disabled === true) return 'disabled'
  if (invitation.enabled === false) return 'disabled'
  return 'active'
}

function isDisabled(invitation: Invitation): boolean {
  return statusLabel(invitation).toLowerCase() === 'disabled'
}

function rsvpLabel(invitation: Invitation): string {
  const value = invitation.rsvp_status ?? invitation.rsvp?.status ?? ''
  if (!value || value === 'pending') return 'No response'
  return value
}

function invitationLink(invitation: Invitation): string {
  if (invitation.url) return invitation.url
  if (!invitation.token) return ''
  return `${window.location.origin}/rsvp/${invitation.token}`
}

function publicLink(inv: Invitation): string {
  return invitationLink(inv)
}

async function copyText(text: string, label: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      window.prompt('Copy link', text)
    }
    notice.value = label
  } catch {
    window.prompt('Copy link', text)
  }
}

async function copyLink(invitation: Invitation) {
  await copyText(invitationLink(invitation), 'Invitation link copied.')
}

async function loadPublic() {
  publicLoading.value = true
  try {
    const data = await unwrap<{ invitation: Invitation | null }>(
      await api.get('/invitations/public'),
    )
    publicInvitation.value = data?.invitation ?? null
  } catch {
    publicInvitation.value = null
  } finally {
    publicLoading.value = false
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    invitations.value = unwrapList(await unwrap<unknown>(await api.get('/invitations')))
  } catch (err) {
    error.value = errorMessage(err, 'Invitations could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function create() {
  if (busy.value) return
  busy.value = true
  formError.value = ''
  try {
    await unwrap<unknown>(
      await api.post('/invitations', {
        name: form.name.trim(),
        max_guests: Number(form.max_guests) || 1,
      }),
    )
    form.name = ''
    form.max_guests = 2
    showForm.value = false
    await load()
    notice.value = 'Invitation created.'
  } catch (err) {
    formError.value = errorMessage(err, 'The invitation could not be created.')
  } finally {
    busy.value = false
  }
}

async function regenerate(invitation: Invitation) {
  if (
    !window.confirm(
      'Regenerate the token? The existing link will stop working immediately.',
    )
  ) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    await unwrap<unknown>(
      await api.post(
        `/invitations/${encodeURIComponent(String(invitation.id))}/regenerate-token`,
        {},
      ),
    )
    await Promise.all([load(), loadPublic()])
    notice.value = 'A new token has been generated.'
  } catch (err) {
    error.value = errorMessage(err, 'The token could not be regenerated.')
  } finally {
    busy.value = false
  }
}

async function toggleDisabled(invitation: Invitation) {
  const disable = !isDisabled(invitation)
  busy.value = true
  error.value = ''
  try {
    await unwrap<unknown>(
      await api.put(`/invitations/${encodeURIComponent(String(invitation.id))}`, {
        active: !disable,
      }),
    )
    await load()
    notice.value = disable ? 'Invitation disabled.' : 'Invitation enabled.'
  } catch (err) {
    error.value = errorMessage(err, 'The invitation could not be updated.')
  } finally {
    busy.value = false
  }
}

async function setAsPublic(invitation: Invitation) {
  const isAlreadyPublic = publicInvitation.value?.id === invitation.id
  const confirmMsg = isAlreadyPublic
    ? 'Remove this invitation as the shared public link?'
    : `Set "${invitation.name || 'this invitation'}" as the shared link that all guests can use?`
  if (!window.confirm(confirmMsg)) return
  busy.value = true
  error.value = ''
  try {
    await unwrap<unknown>(
      await api.put(
        `/invitations/${encodeURIComponent(String(invitation.id))}/set-public`,
        { public: !isAlreadyPublic },
      ),
    )
    await Promise.all([load(), loadPublic()])
    notice.value = isAlreadyPublic
      ? 'Public link removed.'
      : 'Public link updated.'
  } catch (err) {
    error.value = errorMessage(err, 'Could not update the public link setting.')
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  load()
  loadPublic()
})
</script>

<template>
  <section class="section">
    <div class="container container--wide">
      <div class="page-header">
        <div>
          <p class="eyebrow">Access</p>
          <h1>Invitations</h1>
        </div>
        <button type="button" class="btn" @click="showForm = !showForm">
          {{ showForm ? 'Close' : 'Create invitation' }}
        </button>
      </div>

      <p v-if="notice" class="notice notice--success" role="status">{{ notice }}</p>

      <!-- Public / shared link banner -->
      <div v-if="!publicLoading" class="public-link-card card">
        <div class="public-link-card__header">
          <div>
            <h2 class="public-link-card__title">🔗 Shared RSVP link</h2>
            <p class="public-link-card__subtitle">
              One link for all guests — no individual invitations needed.
            </p>
          </div>
        </div>

        <div v-if="publicInvitation" class="public-link-card__body">
          <p class="public-link-card__label">
            Currently using: <strong>{{ publicInvitation.name || 'Unnamed invitation' }}</strong>
          </p>
          <div class="public-link-url">
            <span class="public-link-url__text">{{ publicLink(publicInvitation) }}</span>
            <button
              type="button"
              class="btn btn--secondary btn--small"
              @click="copyText(publicLink(publicInvitation), 'Shared link copied!')"
            >
              Copy
            </button>
          </div>
          <p class="public-link-card__hint">
            Share this link on your wedding website, email, or save-the-date card.
            Guests can use it to RSVP without needing a personal invitation.
          </p>
        </div>

        <div v-else class="public-link-card__body">
          <p class="text-muted">
            No shared link configured. Select an invitation below and click
            <em>Set as shared link</em> to enable one.
          </p>
        </div>
      </div>

      <form
        v-if="showForm"
        class="card stack invitations__form"
        novalidate
        @submit.prevent="create"
      >
        <h2>New invitation</h2>

        <div class="field">
          <label for="invitation-name">Name</label>
          <input
            id="invitation-name"
            v-model="form.name"
            type="text"
            placeholder="e.g. Family Smith"
            required
          />
        </div>

        <div class="field">
          <label for="invitation-max">Maximum guests</label>
          <input
            id="invitation-max"
            v-model.number="form.max_guests"
            type="number"
            min="1"
            step="1"
          />
        </div>

        <p v-if="formError" class="notice notice--error" role="alert">{{ formError }}</p>

        <div class="btn-row">
          <button type="submit" class="btn" :disabled="busy">
            {{ busy ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </form>

      <p v-if="loading" class="text-muted" aria-live="polite">Loading invitations…</p>
      <p v-else-if="error" class="notice notice--error" role="alert">{{ error }}</p>

      <div v-else-if="invitations.length === 0" class="card text-center">
        <p class="text-muted">No invitations yet.</p>
      </div>

      <div v-else class="table-wrap">
        <table>
          <caption class="visually-hidden">Invitations</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Token</th>
              <th scope="col">Status</th>
              <th scope="col">RSVP</th>
              <th scope="col">Max guests</th>
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invitation in invitations"
              :key="invitation.id"
              :class="{ 'row--public': publicInvitation?.id === invitation.id }"
            >
              <td>
                {{ invitation.name || '—' }}
                <span
                  v-if="publicInvitation?.id === invitation.id"
                  class="badge badge--accent"
                  title="This is the shared public link"
                >shared</span>
              </td>
              <td>
                <button
                  type="button"
                  class="token"
                  :aria-label="`Toggle token visibility for ${invitation.name || 'invitation'}`"
                  @click="toggleReveal(invitation)"
                >
                  {{ tokenDisplay(invitation) }}
                </button>
              </td>
              <td>
                <span
                  class="badge"
                  :class="isDisabled(invitation) ? 'badge--muted' : 'badge--primary'"
                >
                  {{ statusLabel(invitation) }}
                </span>
              </td>
              <td>{{ rsvpLabel(invitation) }}</td>
              <td>{{ invitation.max_guests ?? '—' }}</td>
              <td>
                <div class="btn-row">
                  <button
                    type="button"
                    class="btn btn--secondary btn--small"
                    :disabled="!invitation.token"
                    @click="copyLink(invitation)"
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost btn--small"
                    :class="{ 'btn--active': publicInvitation?.id === invitation.id }"
                    :disabled="busy"
                    :title="publicInvitation?.id === invitation.id ? 'Remove shared link' : 'Use as shared link for all guests'"
                    @click="setAsPublic(invitation)"
                  >
                    {{ publicInvitation?.id === invitation.id ? '✓ Shared' : 'Set as shared' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost btn--small"
                    :disabled="busy"
                    @click="regenerate(invitation)"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    class="btn btn--danger btn--small"
                    :disabled="busy"
                    @click="toggleDisabled(invitation)"
                  >
                    {{ isDisabled(invitation) ? 'Enable' : 'Disable' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.invitations__form {
  margin-bottom: calc(var(--spacing) * 1.5);
}

.token {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  background: none;
  border: none;
  padding: 0;
  color: var(--color-text);
  cursor: pointer;
  text-decoration: underline dotted;
}

.public-link-card {
  margin-bottom: calc(var(--spacing) * 1.5);
  border: 2px solid var(--color-accent, var(--color-primary));
}

.public-link-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing);
  margin-bottom: calc(var(--spacing) * 0.75);
}

.public-link-card__title {
  font-size: 1.1rem;
  margin: 0 0 0.25rem;
}

.public-link-card__subtitle {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.public-link-card__label {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}

.public-link-card__hint {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.public-link-url {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--color-surface-alt, #f5f5f5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.5rem 0.75rem;
  flex-wrap: wrap;
}

.public-link-url__text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  word-break: break-all;
  flex: 1;
}

.row--public {
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
}

.badge--accent {
  background: var(--color-accent, var(--color-primary));
  color: #fff;
  margin-left: 0.4rem;
  font-size: 0.7rem;
}

.btn--active {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
</style>
