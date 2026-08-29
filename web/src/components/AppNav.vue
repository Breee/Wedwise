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

const brandNames = computed(() => content.coupleNames || content.eventTitle || 'Wedding')
const brandTitle = computed(() => content.eventTitle || 'Wedding portal')

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

function linkIsActive(link: NavLink) {
  if (link.anchor) {
    const hash = `#${link.to.split('#')[1] ?? ''}`
    if (hash === '#start') return route.path === '/' && (route.hash === '' || route.hash === hash)
    return route.path === '/' && route.hash === hash
  }
  return route.path === link.to
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
      <nav class="nav__desktop" aria-label="Primary">
        <template v-for="link in links" :key="link.to">
          <a
            v-if="link.anchor && route.path === '/'"
            :href="link.to"
            class="nav__link"
            :class="{ 'nav__link--active': linkIsActive(link) }"
            @click="handleAnchorClick($event, link)"
          >{{ link.label }}</a>
          <RouterLink
            v-else
            :to="link.to"
            class="nav__link"
            :class="{ 'nav__link--active': linkIsActive(link) }"
          >{{ link.label }}</RouterLink>
        </template>
      </nav>

      <RouterLink to="/" class="nav__brand" @click="closeMenu">
        <span class="nav__brand-names">{{ brandNames }}</span>
        <span class="nav__brand-title">{{ brandTitle }}</span>
      </RouterLink>

      <div class="nav__actions">
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
        <button
          type="button"
          class="nav__toggle"
          :aria-expanded="open"
          aria-controls="mobile-nav-drawer"
          :aria-label="open ? 'Close menu' : 'Open menu'"
          @click="toggleMenu"
        >
          <span aria-hidden="true" class="nav__toggle-icon">{{ open ? '✕' : '☰' }}</span>
        </button>
      </div>
    </div>

    <Transition name="slide">
      <nav
        v-if="open"
        id="mobile-nav-drawer"
        class="nav__drawer"
        aria-label="Mobile navigation"
      >
        <div class="nav__drawer-header">
          <div class="nav__drawer-brand">
            <span class="nav__brand nav__brand--drawer">{{ brandNames }}</span>
            <span class="nav__drawer-title">{{ brandTitle }}</span>
          </div>
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
              :class="{ 'nav__drawer-link--active': linkIsActive(link) }"
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
          <RouterLink
            v-else-if="route.name !== 'login'"
            to="/login"
            class="btn btn--secondary nav__drawer-signout"
          >Sign in</RouterLink>
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
.nav-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.34);
  backdrop-filter: blur(6px);
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

.nav {
  background-color: var(--color-surface);
  border-bottom: var(--border-subtle);
  position: sticky;
  top: 0;
  z-index: 30;
  padding-top: env(safe-area-inset-top);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}

.nav__inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  min-height: 76px;
  gap: 1rem;
}

.nav__brand {
  grid-column: 2;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  text-decoration: none;
  color: var(--color-primary-dark);
  min-width: 0;
}

.nav__brand-names {
  font-family: var(--font-script);
  font-size: clamp(1.2rem, 3vw, 1.7rem);
  font-style: italic;
  line-height: 1.1;
}

.nav__brand-title,
.nav__drawer-title {
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-top: 0.2rem;
}

.nav__desktop {
  display: none;
}

.nav__actions {
  grid-column: 3;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.nav__user {
  display: none;
}

.nav__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: color-mix(in srgb, var(--color-surface) 70%, var(--color-accent-light));
  border: 1px solid color-mix(in srgb, var(--color-accent) 22%, white);
  border-radius: 999px;
  cursor: pointer;
  color: var(--color-text);
  font-size: 1.15rem;
  padding: 0;
}

.nav__toggle-icon {
  line-height: 1;
}

.nav__drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(25rem, 100%);
  z-index: 40;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 90%, var(--color-accent-light)) 0%, var(--color-surface) 100%);
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  overflow-y: auto;
  box-shadow: -16px 0 40px rgba(15, 23, 42, 0.12);
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

.nav__drawer-brand {
  display: flex;
  flex-direction: column;
}

.nav__brand--drawer {
  align-items: flex-start;
  text-align: left;
  font-size: 1.25rem;
}

.nav__close {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  background: var(--color-surface);
  border: var(--border-subtle);
  border-radius: 999px;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--color-text-muted);
  padding: 0;
}

.nav__drawer-links {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: var(--spacing);
}

.nav__drawer-link {
  display: flex;
  align-items: center;
  min-height: 54px;
  padding: 0 1rem;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-text);
  text-decoration: none;
  border: var(--border-subtle);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--color-surface) 78%, var(--color-accent-light));
}

.nav__drawer-link--active,
.nav__drawer-link.router-link-active,
.nav__drawer-link:hover {
  color: var(--color-primary-dark);
  border-color: color-mix(in srgb, var(--color-accent) 38%, white);
  background: var(--color-accent-light);
}

.nav__drawer-footer {
  padding: var(--spacing);
  border-top: var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing);
  flex-shrink: 0;
  background-color: color-mix(in srgb, var(--color-surface) 84%, var(--color-accent-light));
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

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

@media (min-width: 48rem) {
  .nav__toggle {
   display: none;
  }

  .nav__desktop {
   display: flex;
   align-items: center;
   gap: 1.25rem;
   grid-column: 1;
  }

  .nav__link {
   position: relative;
   font-family: var(--font-body);
   font-size: 0.92rem;
   font-weight: 500;
    color: var(--color-text-muted);
    text-decoration: none;
   padding-bottom: 0.35rem;
  }

  .nav__link::after {
   content: '';
   position: absolute;
   left: 0;
   right: 0;
   bottom: 0;
   height: 2px;
   border-radius: 999px;
   background: var(--color-accent);
   transform: scaleX(0);
   transform-origin: center;
   transition: transform 0.2s ease;
  }

  .nav__link:hover,
  .nav__link--active {
   color: var(--color-primary-dark);
  }

  .nav__link:hover::after,
  .nav__link--active::after {
   transform: scaleX(1);
  }

  .nav__user {
   font-size: 0.86rem;
   color: var(--color-text-muted);
   display: inline-flex;
   align-items: center;
   gap: 0.4rem;
  }
}
</style>
