<script setup lang="ts">
import { onMounted } from 'vue'
import AppNav from '@/components/AppNav.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

onMounted(() => {
  void auth.ensureLoaded()
})
</script>

<template>
  <AppNav />
  <main id="main" class="app-main">
    <RouterView />
  </main>
  <AppFooter />
</template>
