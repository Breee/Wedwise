import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, errorMessage, unwrap } from '@/composables/useApi'

export type Role = 'couple' | 'witness' | 'admin' | ''

export interface User {
  id?: number | string
  username?: string
  display_name?: string
  email?: string
  role?: Role
}

interface MeResponse {
  user?: User
  role?: Role
  username?: string
  display_name?: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const role = ref<Role>('')
  const loading = ref(false)
  const initialized = ref(false)
  const error = ref('')

  const isAuthenticated = computed(() => user.value !== null)
  const isCouple = computed(() => role.value === 'couple')
  const isWitness = computed(() => role.value === 'witness')
  const isAdmin = computed(() => role.value === 'admin')
  const displayName = computed(
    () => user.value?.display_name || user.value?.username || '',
  )

  function apply(payload: MeResponse | User | null) {
    if (!payload) {
      user.value = null
      role.value = ''
      return
    }
    const nested = (payload as MeResponse).user
    const resolved: User = nested ?? (payload as User)
    user.value = resolved
    role.value = (resolved.role ?? (payload as MeResponse).role ?? '') as Role
  }

  async function fetchMe(): Promise<User | null> {
    loading.value = true
    try {
      const data = await unwrap<MeResponse>(await api.get('/auth/me'))
      apply(data)
    } catch {
      apply(null)
    } finally {
      loading.value = false
      initialized.value = true
    }
    return user.value
  }

  /** Fetches the session once; subsequent calls reuse the cached result. */
  async function ensureLoaded(): Promise<User | null> {
    if (!initialized.value) {
      await fetchMe()
    }
    return user.value
  }

  async function login(username: string, password: string): Promise<boolean> {
    loading.value = true
    error.value = ''
    try {
      const data = await unwrap<MeResponse>(
        await api.post('/auth/login', { username, password }),
      )
      apply(data)
      initialized.value = true
      if (!role.value) {
        await fetchMe()
      }
      return true
    } catch (err) {
      error.value = errorMessage(err, 'Login failed.')
      apply(null)
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout', {})
    } catch {
      // Ignore network errors: the local session is cleared regardless.
    }
    apply(null)
    initialized.value = true
  }

  /** Landing route for the current role. */
  function homeRoute(): string {
    if (isWitness.value) return '/witness/dashboard'
    if (isCouple.value || isAdmin.value) return '/couple/dashboard'
    return '/login'
  }

  return {
    user,
    role,
    loading,
    initialized,
    error,
    isAuthenticated,
    isCouple,
    isWitness,
    isAdmin,
    displayName,
    fetchMe,
    ensureLoaded,
    login,
    logout,
    homeRoute,
  }
})
