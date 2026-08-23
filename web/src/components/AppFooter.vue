<script setup lang="ts">
import { computed } from 'vue'
import { useContentStore } from '@/stores/content'

const content = useContentStore()
const year = new Date().getFullYear()
const footerText = computed(() => content.text('footer_text'))
</script>

<template>
  <footer class="footer">
    <div class="container footer__inner">
      <p v-if="footerText" class="footer__text">{{ footerText }}</p>
      <p class="footer__meta text-muted">
        <span>&copy; {{ year }}</span>
        <span aria-hidden="true">·</span>
        <span>Made with Wedwise</span>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  background-color: var(--color-surface-muted);
  margin-top: auto;
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
  gap: 0.5rem;
  font-size: 0.8rem;
  margin: 0;
}
</style>
