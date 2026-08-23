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
}

const invitations = ref<Invitation[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const notice = ref('')
const showForm = ref(false)
const formError = ref('')
const revealed = ref<Record<string, boolean>>({})

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
  if (!invitation.token) return ''
  return `${window.location.origin}/rsvp/${invitation.token}`
}

async function copyLink(invitation: Invitation) {
  const link = invitationLink(invitation)
  if (!link) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link)
    } else {
      window.prompt('Copy the invitation link', link)
    }
    notice.value = 'Invitation link copied.'
  } catch {
    window.prompt('Copy the invitation link', link)
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
        `/invitations/${encodeURIComponent(String(invitation.id))}/regenerate`,
        {},
      ),
    )
    await load()
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
        status: disable ? 'disabled' : 'active',
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

onMounted(load)
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
            <tr v-for="invitation in invitations" :key="invitation.id">
              <td>{{ invitation.name || '—' }}</td>
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
</style>
