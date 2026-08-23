<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, errorMessage, unwrap } from '@/composables/useApi'

interface Guest {
  id: number | string
  name?: string
  email?: string
  notes?: string
  invitation_id?: number | string | null
  invitation?: { id?: number | string; name?: string } | null
  invitation_name?: string
}

interface Invitation {
  id: number | string
  name?: string
}

const guests = ref<Guest[]>([])
const invitations = ref<Invitation[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref(false)
const formError = ref('')
const showForm = ref(false)
const editingId = ref<number | string | null>(null)

const form = reactive({
  name: '',
  email: '',
  notes: '',
  invitation_id: '' as string,
})

const invitationLookup = computed(() => {
  const map = new Map<string, string>()
  for (const invitation of invitations.value) {
    map.set(String(invitation.id), invitation.name ?? String(invitation.id))
  }
  return map
})

function invitationLabel(guest: Guest): string {
  if (guest.invitation?.name) return guest.invitation.name
  if (guest.invitation_name) return guest.invitation_name
  const id = guest.invitation_id ?? guest.invitation?.id
  if (id === null || id === undefined || id === '') return '—'
  return invitationLookup.value.get(String(id)) ?? `#${id}`
}

function unwrapList<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const value = (payload as Record<string, unknown>)[key]
    if (Array.isArray(value)) return value as T[]
    const items = (payload as Record<string, unknown>).items
    if (Array.isArray(items)) return items as T[]
  }
  return []
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [guestData, invitationData] = await Promise.all([
      unwrap<unknown>(await api.get('/guests')),
      api.get('/invitations').then(unwrap<unknown>).catch(() => []),
    ])
    guests.value = unwrapList<Guest>(guestData, 'guests')
    invitations.value = unwrapList<Invitation>(invitationData, 'invitations')
  } catch (err) {
    error.value = errorMessage(err, 'Guests could not be loaded.')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.name = ''
  form.email = ''
  form.notes = ''
  form.invitation_id = ''
  editingId.value = null
  formError.value = ''
}

function startCreate() {
  resetForm()
  showForm.value = true
}

function startEdit(guest: Guest) {
  editingId.value = guest.id
  form.name = guest.name ?? ''
  form.email = guest.email ?? ''
  form.notes = guest.notes ?? ''
  const invitationId = guest.invitation_id ?? guest.invitation?.id ?? ''
  form.invitation_id = invitationId === null ? '' : String(invitationId)
  formError.value = ''
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

async function submit() {
  if (busy.value) return
  busy.value = true
  formError.value = ''
  try {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
      notes: form.notes,
    }
    if (form.invitation_id !== '') {
      const numeric = Number(form.invitation_id)
      payload.invitation_id = Number.isFinite(numeric) ? numeric : form.invitation_id
    } else {
      payload.invitation_id = null
    }

    if (editingId.value !== null) {
      await unwrap<unknown>(
        await api.put(`/guests/${encodeURIComponent(String(editingId.value))}`, payload),
      )
    } else {
      await unwrap<unknown>(await api.post('/guests', payload))
    }
    closeForm()
    await load()
  } catch (err) {
    formError.value = errorMessage(err, 'The guest could not be saved.')
  } finally {
    busy.value = false
  }
}

async function remove(guest: Guest) {
  const label = guest.name || 'this guest'
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
  busy.value = true
  error.value = ''
  try {
    await unwrap<unknown>(
      await api.delete(`/guests/${encodeURIComponent(String(guest.id))}`),
    )
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'The guest could not be deleted.')
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
          <p class="eyebrow">Guest list</p>
          <h1>Guests</h1>
        </div>
        <button type="button" class="btn" @click="startCreate">Add guest</button>
      </div>

      <form v-if="showForm" class="card stack guests__form" novalidate @submit.prevent="submit">
        <h2>{{ editingId !== null ? 'Edit guest' : 'New guest' }}</h2>

        <div class="field">
          <label for="guest-name">Name</label>
          <input id="guest-name" v-model="form.name" type="text" required />
        </div>

        <div class="field">
          <label for="guest-email">Email</label>
          <input id="guest-email" v-model="form.email" type="email" />
        </div>

        <div class="field">
          <label for="guest-invitation">Invitation</label>
          <select id="guest-invitation" v-model="form.invitation_id">
            <option value="">No invitation</option>
            <option
              v-for="invitation in invitations"
              :key="invitation.id"
              :value="String(invitation.id)"
            >
              {{ invitation.name || `#${invitation.id}` }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="guest-notes">Notes</label>
          <textarea id="guest-notes" v-model="form.notes"></textarea>
        </div>

        <p v-if="formError" class="notice notice--error" role="alert">{{ formError }}</p>

        <div class="btn-row">
          <button type="submit" class="btn" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="btn btn--ghost" @click="closeForm">Cancel</button>
        </div>
      </form>

      <p v-if="loading" class="text-muted" aria-live="polite">Loading guests…</p>
      <p v-else-if="error" class="notice notice--error" role="alert">{{ error }}</p>

      <div v-else-if="guests.length === 0" class="card text-center">
        <p class="text-muted">No guests yet. Add the first one to get started.</p>
      </div>

      <div v-else class="table-wrap">
        <table>
          <caption class="visually-hidden">Guest list</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Invitation</th>
              <th scope="col">Notes</th>
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="guest in guests" :key="guest.id">
              <td>{{ guest.name || '—' }}</td>
              <td>{{ guest.email || '—' }}</td>
              <td>{{ invitationLabel(guest) }}</td>
              <td>{{ guest.notes || '—' }}</td>
              <td>
                <div class="btn-row">
                  <button
                    type="button"
                    class="btn btn--secondary btn--small"
                    @click="startEdit(guest)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn btn--danger btn--small"
                    :disabled="busy"
                    @click="remove(guest)"
                  >
                    Delete
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
.guests__form {
  margin-bottom: calc(var(--spacing) * 1.5);
}
</style>
