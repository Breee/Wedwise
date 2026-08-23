<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref('')

onMounted(async () => {
  await auth.ensureLoaded()
  if (auth.isAuthenticated) {
    await router.replace(auth.homeRoute())
  }
})

async function handleSubmit() {
  if (submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    const ok = await auth.login(username.value, password.value)
    if (!ok) {
      error.value = auth.error || 'Invalid username or password.'
      return
    }
    const redirect = route.query.redirect
    const target = typeof redirect === 'string' && redirect.startsWith('/')
      ? redirect
      : auth.homeRoute()
    await router.replace(target)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="section">
    <div class="login">
      <div class="card stack">
        <div>
          <p class="eyebrow">Wedding administration</p>
          <h1 class="login__title">Sign in</h1>
        </div>

        <p
          v-if="error"
          class="notice notice--error"
          role="alert"
          aria-live="assertive"
        >
          {{ error }}
        </p>

        <form novalidate @submit.prevent="handleSubmit">
          <div class="field">
            <label for="username">Username</label>
            <input
              id="username"
              v-model="username"
              type="text"
              name="username"
              autocomplete="username"
              required
            />
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              name="password"
              autocomplete="current-password"
              required
            />
          </div>

          <button type="submit" class="btn login__submit" :disabled="submitting">
            {{ submitting ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.login {
  width: 100%;
  max-width: 26rem;
  margin: 0 auto;
  padding: 0 var(--spacing);
}

.login__title {
  margin: 0;
}

.login__submit {
  width: 100%;
}
</style>
