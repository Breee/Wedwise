<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useContentStore } from '@/stores/content'

const content = useContentStore()

const title = computed(() => content.eventTitle || 'Our Wedding')
const couple = computed(() => content.coupleNames)
const dateLine = computed(() => {
  const parts = [content.formattedDate, content.eventTime].filter(Boolean)
  return parts.join(' · ')
})
const heroSubtitle = computed(() => content.text('hero_subtitle'))

const introTitle = computed(() => content.text('intro_title', 'Welcome'))
const introText = computed(() => content.text('intro_text'))

const scheduleTitle = computed(() => content.text('schedule_title', 'Schedule'))
const schedule = computed(() => content.schedule)

const locationTitle = computed(() => content.text('location_title', 'Location'))
const locationName = computed(() => content.text('location_name'))
const locationAddress = computed(() => content.text('location_address'))
const locationDescription = computed(() => content.text('location_description'))
const locationMapUrl = computed(() => content.text('location_map_url'))
const hasLocation = computed(
  () =>
    Boolean(locationName.value) ||
    Boolean(locationAddress.value) ||
    Boolean(locationDescription.value),
)

const faqTitle = computed(() => content.text('faq_title', 'Questions & answers'))
const faq = computed(() => content.faq)

onMounted(() => {
  void content.fetchPublic()
})
</script>

<template>
  <div class="home">
    <section id="start" class="hero" aria-labelledby="hero-title">
      <div class="container hero__inner">
        <p v-if="couple" class="hero__couple script">{{ couple }}</p>
        <h1 id="hero-title" class="hero__title">{{ title }}</h1>
        <p v-if="dateLine" class="hero__date">{{ dateLine }}</p>
        <p v-else-if="!content.loading" class="hero__date text-muted">
          Date to be announced
        </p>
        <p v-if="heroSubtitle" class="hero__subtitle">{{ heroSubtitle }}</p>
      </div>
    </section>

    <section class="section" aria-labelledby="intro-title">
      <div class="container stack">
        <p class="eyebrow">Introduction</p>
        <h2 id="intro-title">{{ introTitle }}</h2>
        <p v-if="introText" class="home__prose">{{ introText }}</p>
        <p v-else class="text-muted">
          More details about the celebration will be shared here soon.
        </p>
      </div>
    </section>

    <section id="schedule" class="section section--muted" aria-labelledby="schedule-title">
      <div class="container stack">
        <p class="eyebrow">Programme</p>
        <h2 id="schedule-title">{{ scheduleTitle }}</h2>

        <ol v-if="schedule.length > 0" class="list-plain schedule">
          <li v-for="(item, index) in schedule" :key="index" class="schedule__item card">
            <p v-if="item.time" class="schedule__time">{{ item.time }}</p>
            <h3 v-if="item.title" class="schedule__title">{{ item.title }}</h3>
            <p v-if="item.location" class="schedule__location text-muted">
              {{ item.location }}
            </p>
            <p v-if="item.description" class="schedule__description">
              {{ item.description }}
            </p>
          </li>
        </ol>
        <p v-else class="text-muted">The schedule will be published closer to the day.</p>
      </div>
    </section>

    <section id="location" class="section" aria-labelledby="location-title">
      <div class="container stack">
        <p class="eyebrow">Getting there</p>
        <h2 id="location-title">{{ locationTitle }}</h2>

        <div v-if="hasLocation" class="card stack">
          <h3 v-if="locationName">{{ locationName }}</h3>
          <p v-if="locationAddress" class="home__address">{{ locationAddress }}</p>
          <p v-if="locationDescription">{{ locationDescription }}</p>
          <p v-if="locationMapUrl">
            <a
              class="btn btn--secondary btn--small"
              :href="locationMapUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open map
            </a>
          </p>
        </div>
        <p v-else class="text-muted">The venue will be announced soon.</p>
      </div>
    </section>

    <section id="faq" class="section section--muted" aria-labelledby="faq-title">
      <div class="container stack">
        <p class="eyebrow">Good to know</p>
        <h2 id="faq-title">{{ faqTitle }}</h2>

        <div v-if="faq.length > 0" class="stack">
          <details v-for="(item, index) in faq" :key="index" class="faq card">
            <summary class="faq__question">{{ item.question }}</summary>
            <p class="faq__answer">{{ item.answer }}</p>
          </details>
        </div>
        <p v-else class="text-muted">Questions and answers will be added here.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  background-color: var(--color-surface);
  border-bottom: var(--border-subtle);
  text-align: center;
}

.hero__inner {
  /* Compact on mobile (less wasted space), spacious on desktop */
  padding: calc(var(--spacing) * 2.5) var(--spacing);
}

.hero__couple {
  font-family: var(--font-script);
  /* Fluid: ~1.25rem on 360px → ~1.5rem on desktop */
  font-size: clamp(1.1rem, 4vw, 1.5rem);
  color: var(--color-accent);
  margin-bottom: 0.5rem;
}

.hero__title {
  /* Fluid: ~2.2rem on 360px → ~3.6rem on desktop */
  font-size: clamp(2.2rem, 8vw, 3.6rem) !important;
  line-height: 1.05;
  margin-bottom: 0.75rem;
}

.hero__date {
  font-family: var(--font-heading);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.85rem;
  color: var(--color-secondary);
}

.hero__subtitle {
  max-width: 34rem;
  margin: var(--spacing) auto 0;
  color: var(--color-text-muted);
  font-size: clamp(0.9rem, 3vw, 1rem);
}

.home__prose {
  max-width: 42rem;
}

.home__address {
  white-space: pre-line;
}

.schedule {
  display: grid;
  gap: var(--spacing);
}

.schedule__time {
  font-family: var(--font-heading);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin-bottom: 0.25rem;
}

.schedule__title {
  margin-bottom: 0.25rem;
}

.schedule__location {
  font-size: 0.9rem;
  margin-bottom: 0.35rem;
}

.schedule__description {
  margin: 0;
}

.faq__question {
  font-family: var(--font-heading);
  font-weight: 600;
  cursor: pointer;
  color: var(--color-primary-dark);
}

.faq__answer {
  margin: 0.6rem 0 0;
}

@media (min-width: 48rem) {
  .hero__inner {
    padding: calc(var(--spacing) * 5) var(--spacing);
  }

  .schedule {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
