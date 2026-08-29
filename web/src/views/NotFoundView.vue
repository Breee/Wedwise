<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="section">
    <div class="container text-center stack">
      <p class="eyebrow">404</p>
      <h1>This page could not be found</h1>
      <p class="text-muted">The link may be outdated or mistyped.</p>
      <p>
        <RouterLink to="/" class="btn">Back to the website</RouterLink>
      </p>
    </div>
  </section>
</template>
