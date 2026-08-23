import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeView from '@/views/public/HomeView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    roles?: string[]
    public?: boolean
    title?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { public: true, title: 'Welcome' },
  },
  {
    path: '/rsvp/:token',
    name: 'rsvp',
    component: () => import('@/views/rsvp/RSVPView.vue'),
    props: true,
    meta: { public: true, title: 'RSVP' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { public: true, title: 'Sign in' },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/RedirectView.vue'),
    meta: { requiresAuth: true, title: 'Dashboard' },
    beforeEnter: async () => {
      const auth = useAuthStore()
      await auth.ensureLoaded()
      return auth.homeRoute()
    },
  },
  {
    path: '/couple/dashboard',
    name: 'couple-dashboard',
    component: () => import('@/views/couple/DashboardView.vue'),
    meta: { requiresAuth: true, roles: ['couple', 'admin'], title: 'Dashboard' },
  },
  {
    path: '/couple/guests',
    name: 'couple-guests',
    component: () => import('@/views/couple/GuestsView.vue'),
    meta: { requiresAuth: true, roles: ['couple', 'admin'], title: 'Guests' },
  },
  {
    path: '/couple/invitations',
    name: 'couple-invitations',
    component: () => import('@/views/couple/InvitationsView.vue'),
    meta: { requiresAuth: true, roles: ['couple', 'admin'], title: 'Invitations' },
  },
  {
    path: '/witness/dashboard',
    name: 'witness-dashboard',
    component: () => import('@/views/witness/DashboardView.vue'),
    meta: { requiresAuth: true, roles: ['witness', 'admin'], title: 'Contributions' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { public: true, title: 'Not found' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public && !to.meta.requiresAuth) {
    return true
  }

  await auth.ensureLoaded()

  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  const allowed = to.meta.roles
  if (allowed && allowed.length > 0 && !allowed.includes(auth.role)) {
    return auth.homeRoute()
  }

  return true
})

router.afterEach((to) => {
  const title = to.meta.title
  document.title = title ? `${title} · Wedding` : 'Wedding'
})

export default router
