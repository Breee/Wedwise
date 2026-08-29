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
  icon: 'dashboard' | 'guests' | 'invitations' | 'contributions'
}

const bottomNavItems = computed<BottomNavItem[]>(() => {
  if (auth.isWitness) {
    return [
      { to: '/witness/dashboard', label: 'Contributions', icon: 'contributions' },
    ]
  }
  if (auth.isCouple || auth.isAdmin) {
    return [
      { to: '/couple/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { to: '/couple/guests', label: 'Guests', icon: 'guests' },
      { to: '/couple/invitations', label: 'Invitations', icon: 'invitations' },
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
      <span class="bottom-nav__icon" aria-hidden="true">
        <svg v-if="item.icon === 'dashboard'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 13.5h6.5V20H4zM13.5 4H20v9.5h-6.5zM13.5 16.5H20V20h-6.5zM4 4h6.5v6.5H4z" />
        </svg>
        <svg v-else-if="item.icon === 'guests'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
          <circle cx="9.5" cy="7.5" r="3.5" />
          <path d="M20 20v-1.2a3.2 3.2 0 0 0-2.4-3.1" />
          <path d="M15.5 4.7a3.5 3.5 0 0 1 0 5.6" />
        </svg>
        <svg v-else-if="item.icon === 'invitations'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 6.5h16v11H4z" />
          <path d="m4.5 7 7.5 6 7.5-6" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 4v10" />
          <path d="M8 8a4 4 0 1 1 8 0" />
          <path d="M6 20c1.6-3.2 4-4.8 6-4.8s4.4 1.6 6 4.8" />
        </svg>
      </span>
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
  background: color-mix(in srgb, var(--color-surface) 90%, var(--color-accent-light));
  border-top: var(--border-subtle);
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: 0 -12px 30px rgba(15, 23, 42, 0.08);
}

.bottom-nav__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-decoration: none;
  color: var(--color-text-muted);
  min-height: 48px;
  font-size: 0.72rem;
  font-family: var(--font-body);
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0 4px;
  position: relative;
}

.bottom-nav__item--active {
  color: var(--color-primary-dark);
}

.bottom-nav__item--active::before {
  content: '';
  position: absolute;
  top: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  border-radius: 999px;
  background: var(--color-accent);
}

.bottom-nav__icon {
  width: 1.35rem;
  height: 1.35rem;
  line-height: 1;
}

.bottom-nav__icon svg {
  width: 100%;
  height: 100%;
}

/* Only show on mobile; on desktop use the top nav */
@media (min-width: 48rem) {
  .bottom-nav {
    display: none;
  }
}
</style>
