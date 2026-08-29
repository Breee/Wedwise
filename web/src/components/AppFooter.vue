<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'

const auth = useAuthStore()
const content = useContentStore()
const route = useRoute()
const year = new Date().getFullYear()
const footerText = computed(() => content.text('footer_text'))
const showSignIn = computed(
  () => !auth.isAuthenticated && route.name !== 'login',
)
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <p v-if="footerText" class="footer__text">{{ footerText }}</p>
      <p class="footer__meta text-muted">
        <span>&copy; {{ year }}</span>
        <span aria-hidden="true">·</span>
        <span>Made with Wedwise</span>
        <span v-if="showSignIn" aria-hidden="true">·</span>
        <RouterLink v-if="showSignIn" to="/login" class="footer__signin">
          Admin
        </RouterLink>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background-color: var(--color-surface-muted);
  margin-top: auto;
  /* On mobile with bottom nav, add extra space so content isn't covered */
  padding-bottom: env(safe-area-inset-bottom);
}

.footer__inner {
  padding-top: calc(var(--spacing) * 1.5);
  padding-bottom: calc(var(--spacing) * 1.5);
  text-align: center;
}

.footer__text {
  font-family: var(--font-script);
  font-style: italic;
  color: var(--color-primary-dark);
}

.footer__meta {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8rem;
  margin: 0;
}

.footer__signin {
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 0.8rem;
}

.footer__signin:hover {
  color: var(--color-primary);
}
</style>
