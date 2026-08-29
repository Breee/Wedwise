<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from '@/components/AppNav.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()

interface BottomNavItem {
  to: string
  label: string
  icon: string
}

const bottomNavItems = computed<BottomNavItem[]>(() => {
  if (auth.isWitness) {
    return [
      { to: '/witness/dashboard', label: 'Contributions', icon: '🎤' },
    ]
  }
  if (auth.isCouple || auth.isAdmin) {
    return [
      { to: '/couple/dashboard', label: 'Dashboard', icon: '⌂' },
      { to: '/couple/guests', label: 'Guests', icon: '👥' },
      { to: '/couple/invitations', label: 'Invitations', icon: '💌' },
    ]
  }
  return []
})

const showBottomNav = computed(() => auth.isAuthenticated && bottomNavItems.value.length > 0)

onMounted(() => {
  void auth.ensureLoaded()
})
</script>

<template>
  <AppNav />
  <main id="main" class="app-main" :class="{ 'app-main--with-bottom-nav': showBottomNav }">
    <RouterView />
  </main>
  <AppFooter />

  <!-- Mobile bottom navigation for authenticated users -->
  <nav
    v-if="showBottomNav"
    class="bottom-nav"
    aria-label="Mobile navigation"
  >
    <RouterLink
      v-for="item in bottomNavItems"
      :key="item.to"
      :to="item.to"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': route.path === item.to }"
    >
      <span class="bottom-nav__icon" aria-hidden="true">{{ item.icon }}</span>
      <span class="bottom-nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style>
/* App-level global bottom-nav styles (not scoped) */
.app-main--with-bottom-nav {
  /* Ensure content isn't hidden behind bottom nav on mobile */
  padding-bottom: calc(56px + env(safe-area-inset-bottom));
}

@media (min-width: 48rem) {
  .app-main--with-bottom-nav {
    padding-bottom: 0;
  }
}
</style>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: stretch;
  background-color: var(--color-surface);
  border-top: var(--border-subtle);
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
}

.bottom-nav__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--color-text-muted);
  min-height: 48px;
  font-size: 0.7rem;
  font-family: var(--font-heading);
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 0 4px;
}

.bottom-nav__item--active {
  color: var(--color-primary);
}

.bottom-nav__icon {
  font-size: 1.25rem;
  line-height: 1;
}

/* Only show on mobile; on desktop use the top nav */
@media (min-width: 48rem) {
  .bottom-nav {
    display: none;
  }
}
</style>
