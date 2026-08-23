<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'

interface NavLink {
  to: string
  label: string
}

const auth = useAuthStore()
const content = useContentStore()
const route = useRoute()
const router = useRouter()

const open = ref(false)

const brand = computed(
  () => content.eventTitle || content.coupleNames || 'Wedding',
)

// Couples never see contribution-related navigation; that belongs to witnesses.
const links = computed<NavLink[]>(() => {
  if (auth.isWitness) {
    return [{ to: '/witness/dashboard', label: 'Contributions' }]
  }
  if (auth.isCouple || auth.isAdmin) {
    return [
      { to: '/couple/dashboard', label: 'Dashboard' },
      { to: '/couple/guests', label: 'Guests' },
      { to: '/couple/invitations', label: 'Invitations' },
    ]
  }
  return []
})

watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

async function handleLogout() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <header class="nav">
    <div class="container container--wide nav__inner">
      <RouterLink to="/" class="nav__brand">{{ brand }}</RouterLink>

      <button
        v-if="links.length > 0 || auth.isAuthenticated"
        type="button"
        class="nav__toggle"
        :aria-expanded="open"
        aria-controls="primary-navigation"
        @click="open = !open"
      >
        <span class="visually-hidden">Toggle navigation</span>
        <span aria-hidden="true">☰</span>
      </button>

      <nav
        id="primary-navigation"
        class="nav__links"
        :class="{ 'nav__links--open': open }"
        aria-label="Primary"
      >
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav__link">
          {{ link.label }}
        </RouterLink>

        <span v-if="auth.isAuthenticated" class="nav__user">
          {{ auth.displayName }}
          <span v-if="auth.role" class="badge badge--muted">{{ auth.role }}</span>
        </span>

        <button
          v-if="auth.isAuthenticated"
          type="button"
          class="btn btn--ghost btn--small"
          @click="handleLogout"
        >
          Sign out
        </button>
        <RouterLink
          v-else-if="route.name !== 'login'"
          to="/login"
          class="btn btn--secondary btn--small"
        >
          Sign in
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.nav {
  background-color: var(--color-surface);
  border-bottom: var(--border-subtle);
  position: sticky;
  top: 0;
  z-index: 20;
}

.nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.nav__brand {
  font-family: var(--font-script);
  font-size: 1.15rem;
  color: var(--color-primary-dark);
  text-decoration: none;
  letter-spacing: 0.02em;
}

.nav__toggle {
  background: none;
  border: 1px solid var(--color-surface-muted);
  border-radius: var(--radius);
  padding: 0.35rem 0.6rem;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--color-text);
}

.nav__links {
  display: none;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem 0 0.25rem;
}

.nav__links--open {
  display: flex;
}

.nav__link {
  font-family: var(--font-heading);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  text-decoration: none;
}

.nav__link:hover,
.nav__link.router-link-active {
  color: var(--color-primary);
}

.nav__user {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

@media (min-width: 48rem) {
  .nav__toggle {
    display: none;
  }

  .nav__links {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: auto;
    gap: 1.1rem;
    padding: 0;
  }
}
</style>
