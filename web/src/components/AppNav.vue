<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'

interface NavLink {
  to: string
  label: string
  anchor?: boolean
}

const auth = useAuthStore()
const content = useContentStore()
const route = useRoute()
const router = useRouter()

const open = ref(false)
const isPublic = computed(() => !auth.isAuthenticated)

const brand = computed(
  () => content.eventTitle || content.coupleNames || 'Wedding',
)

const publicLinks: NavLink[] = [
  { to: '/#start', label: 'Start', anchor: true },
  { to: '/#schedule', label: 'Schedule', anchor: true },
  { to: '/#location', label: 'Location', anchor: true },
  { to: '/#faq', label: 'FAQ', anchor: true },
  { to: '/rsvp', label: 'RSVP', anchor: false },
]

const authLinks = computed<NavLink[]>(() => {
  if (auth.isWitness) {
    return [
      { to: '/witness/dashboard', label: 'Contributions' },
    ]
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

const links = computed<NavLink[]>(() =>
  isPublic.value ? publicLinks : authLinks.value,
)

function lockScroll() {
  document.body.style.overflow = 'hidden'
}
function unlockScroll() {
  document.body.style.overflow = ''
}

function openMenu() {
  open.value = true
  lockScroll()
}
function closeMenu() {
  open.value = false
  unlockScroll()
}
function toggleMenu() {
  open.value ? closeMenu() : openMenu()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) closeMenu()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  unlockScroll()
})

watch(
  () => route.fullPath,
  () => closeMenu(),
)

async function handleLogout() {
  await auth.logout()
  await router.push('/login')
}

function handleAnchorClick(e: Event, link: NavLink) {
  if (!link.anchor) return
  if (route.path === '/') {
    e.preventDefault()
    const id = link.to.split('#')[1]
    const el = document.getElementById(id)
    if (el) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' })
    }
  }
  closeMenu()
}
</script>

<template>
  <!-- Backdrop -->
  <Transition name="fade">
    <div
      v-if="open"
      class="nav-backdrop"
      aria-hidden="true"
      @click="closeMenu"
    />
  </Transition>

  <header class="nav" :class="{ 'nav--public': isPublic }">
    <div class="container container--wide nav__inner">
      <RouterLink to="/" class="nav__brand" @click="closeMenu">{{ brand }}</RouterLink>

      <!-- Desktop links (≥ 48rem) -->
      <nav
        class="nav__desktop"
        aria-label="Primary"
      >
        <template v-for="link in links" :key="link.to">
          <a
            v-if="link.anchor && route.path === '/'"
            :href="link.to"
            class="nav__link"
            @click="handleAnchorClick($event, link)"
          >{{ link.label }}</a>
          <RouterLink
            v-else
            :to="link.to"
            class="nav__link"
          >{{ link.label }}</RouterLink>
        </template>

        <span v-if="auth.isAuthenticated" class="nav__user">
          {{ auth.displayName }}
          <span v-if="auth.role" class="badge badge--muted">{{ auth.role }}</span>
        </span>
        <button
          v-if="auth.isAuthenticated"
          type="button"
          class="btn btn--ghost btn--small"
          @click="handleLogout"
        >Sign out</button>
        <RouterLink
          v-else-if="route.name !== 'login'"
          to="/login"
          class="btn btn--secondary btn--small"
        >Sign in</RouterLink>
      </nav>

      <!-- Mobile toggle -->
      <button
        type="button"
        class="nav__toggle"
        :aria-expanded="open"
        aria-controls="mobile-nav-drawer"
        aria-label="Open menu"
        @click="toggleMenu"
      >
        <span aria-hidden="true" class="nav__toggle-icon">{{ open ? '✕' : '☰' }}</span>
      </button>
    </div>

    <!-- Mobile drawer -->
    <Transition name="slide">
      <nav
        v-if="open"
        id="mobile-nav-drawer"
        class="nav__drawer"
        aria-label="Mobile navigation"
      >
        <div class="nav__drawer-header">
          <span class="nav__brand nav__brand--drawer">{{ brand }}</span>
          <button
            type="button"
            class="nav__close"
            aria-label="Close menu"
            @click="closeMenu"
          >✕</button>
        </div>

        <div class="nav__drawer-links">
          <template v-for="link in links" :key="link.to">
            <a
              v-if="link.anchor && route.path === '/'"
              :href="link.to"
              class="nav__drawer-link"
              @click="handleAnchorClick($event, link)"
            >{{ link.label }}</a>
            <RouterLink
              v-else
              :to="link.to"
              class="nav__drawer-link"
              :class="{ 'nav__drawer-link--active': route.path === link.to }"
            >{{ link.label }}</RouterLink>
          </template>
        </div>

        <div class="nav__drawer-footer">
          <div v-if="auth.isAuthenticated" class="nav__drawer-user">
            <span>{{ auth.displayName }}</span>
            <span v-if="auth.role" class="badge badge--muted">{{ auth.role }}</span>
          </div>
          <button
            v-if="auth.isAuthenticated"
            type="button"
            class="btn btn--ghost nav__drawer-signout"
            @click="handleLogout"
          >Sign out</button>
        </div>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
/* ── Backdrop ────────────────────────────────────────────────────────── */
.nav-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 29;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ── Header bar ──────────────────────────────────────────────────────── */
.nav {
  background-color: var(--color-surface);
  border-bottom: var(--border-subtle);
  position: sticky;
  top: 0;
  z-index: 30;
  padding-top: env(safe-area-inset-top);
}

.nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  gap: 0.5rem;
}

.nav__brand {
  font-family: var(--font-script);
  font-size: 1.15rem;
  color: var(--color-primary-dark);
  text-decoration: none;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

/* Desktop nav — hidden on mobile */
.nav__desktop {
  display: none;
}

/* Mobile toggle — shown on mobile only */
.nav__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: 1px solid var(--color-surface-muted);
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--color-text);
  font-size: 1.15rem;
  padding: 0;
}

.nav__toggle-icon {
  line-height: 1;
}

/* ── Mobile drawer ───────────────────────────────────────────────────── */
.nav__drawer {
  position: fixed;
  inset: 0;
  z-index: 40;
  background-color: var(--color-surface);
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  overflow-y: auto;
}

.nav__drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 var(--spacing);
  border-bottom: var(--border-subtle);
  flex-shrink: 0;
}

.nav__brand--drawer {
  font-family: var(--font-script);
  font-size: 1.15rem;
  color: var(--color-primary-dark);
  letter-spacing: 0.02em;
}

.nav__close {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0;
}

.nav__drawer-links {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: calc(var(--spacing) * 0.5) 0;
}

.nav__drawer-link {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 0 var(--spacing);
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 500;
  color: var(--color-text);
  text-decoration: none;
  border-bottom: var(--border-subtle);
}

.nav__drawer-link:last-child {
  border-bottom: none;
}

.nav__drawer-link--active,
.nav__drawer-link.router-link-active {
  color: var(--color-primary);
  border-left: 3px solid var(--color-accent);
  padding-left: calc(var(--spacing) - 3px);
}

.nav__drawer-footer {
  padding: var(--spacing);
  border-top: var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing);
  flex-shrink: 0;
}

.nav__drawer-user {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.nav__drawer-signout {
  flex-shrink: 0;
}

/* Drawer slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

/* ── Desktop (≥ 768px) ───────────────────────────────────────────────── */
@media (min-width: 48rem) {
  .nav__toggle {
    display: none;
  }

  .nav__desktop {
    display: flex;
    align-items: center;
    gap: 1.1rem;
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
}
</style>
