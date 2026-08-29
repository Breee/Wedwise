<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
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
        <div class="hero__divider" aria-hidden="true">
          <span></span>
        </div>
        <h1 id="hero-title" class="hero__title">{{ title }}</h1>
        <p v-if="dateLine" class="hero__date">{{ dateLine }}</p>
        <p v-else-if="!content.loading" class="hero__date text-muted">
          Date to be announced
        </p>
        <p v-if="heroSubtitle" class="hero__subtitle">{{ heroSubtitle }}</p>
        <div class="hero__actions">
          <RouterLink to="/rsvp" class="btn">Reply to invitation</RouterLink>
          <a href="#schedule" class="btn btn--secondary">View the day</a>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="intro-title">
      <div class="container stack">
        <p class="eyebrow">Introduction</p>
        <h2 id="intro-title">{{ introTitle }}</h2>
        <div class="card home__intro-card">
          <p v-if="introText" class="home__prose">{{ introText }}</p>
          <p v-else class="text-muted">
            More details about the celebration will be shared here soon.
          </p>
        </div>
      </div>
    </section>

    <section id="schedule" class="section section--muted" aria-labelledby="schedule-title">
      <div class="container stack">
        <p class="eyebrow">Programme</p>
        <h2 id="schedule-title">{{ scheduleTitle }}</h2>

        <ol v-if="schedule.length > 0" class="list-plain schedule">
          <li v-for="(item, index) in schedule" :key="index" class="schedule__item">
            <div class="schedule__marker" aria-hidden="true"></div>
            <p v-if="item.time" class="schedule__time">{{ item.time }}</p>
            <div class="card schedule__content">
              <h3 v-if="item.title" class="schedule__title">{{ item.title }}</h3>
              <p v-if="item.location" class="schedule__location text-muted">
                {{ item.location }}
              </p>
              <p v-if="item.description" class="schedule__description">
                {{ item.description }}
              </p>
            </div>
          </li>
        </ol>
        <p v-else class="text-muted">The schedule will be published closer to the day.</p>
      </div>
    </section>

    <section id="location" class="section" aria-labelledby="location-title">
      <div class="container stack">
        <p class="eyebrow">Getting there</p>
        <h2 id="location-title">{{ locationTitle }}</h2>

        <div v-if="hasLocation" class="card stack home__location-card">
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
  min-height: calc(100vh - 76px);
  display: flex;
  align-items: center;
  background:
    radial-gradient(circle at top center, color-mix(in srgb, var(--color-accent-light) 85%, white) 0%, transparent 38%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 92%, var(--color-accent-light)) 0%, var(--color-background) 100%);
  border-bottom: var(--border-subtle);
  text-align: center;
}

.hero__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 4) var(--spacing);
}

.hero__couple {
  font-size: clamp(2rem, 5vw, 3.6rem);
  color: var(--color-accent);
  margin-bottom: 0.75rem;
}

.hero__divider {
  width: min(14rem, 42vw);
  margin-bottom: 1.5rem;
}

.hero__divider span {
  display: block;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
}

.hero__title {
  font-size: clamp(2.5rem, 7vw, 5rem) !important;
  line-height: 1.02;
  margin-bottom: 1rem;
  max-width: 11ch;
}

.hero__date {
  font-family: var(--font-body);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 0.78rem;
  color: var(--color-secondary);
}

.hero__subtitle {
  max-width: 40rem;
  margin: 1.25rem auto 0;
  color: var(--color-text-muted);
  font-size: clamp(1rem, 2.4vw, 1.1rem);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.home__prose {
  max-width: 42rem;
  margin: 0;
}

.home__intro-card,
.home__location-card {
  max-width: 48rem;
}

.home__address {
  white-space: pre-line;
}

.schedule {
  position: relative;
  display: grid;
  gap: 1rem;
  padding-left: 1.25rem;
}

.schedule::before {
  content: '';
  position: absolute;
  left: 0.35rem;
  top: 0.6rem;
  bottom: 0.6rem;
  width: 2px;
  background: linear-gradient(180deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 10%, white));
}

.schedule__item {
  position: relative;
  display: grid;
  gap: 0.75rem;
}

.schedule__marker {
  position: absolute;
  left: -1.25rem;
  top: 1.3rem;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 999px;
  background: var(--color-surface);
  border: 2px solid var(--color-accent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-accent-light) 55%, transparent);
}

.schedule__time {
  font-family: var(--font-body);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin: 0;
}

.schedule__content {
  margin: 0;
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

.faq {
  overflow: hidden;
}

.faq__question {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font-family: var(--font-body);
  font-weight: 600;
  cursor: pointer;
  color: var(--color-primary-dark);
  list-style: none;
}

.faq__question::-webkit-details-marker {
  display: none;
}

.faq__question::after {
  content: '+';
  font-size: 1.1rem;
  color: var(--color-accent);
}

.faq[open] .faq__question::after {
  content: '–';
}

.faq__answer {
  margin: 0.9rem 0 0;
  color: var(--color-text-muted);
}

@media (min-width: 48rem) {
  .hero__inner {
    padding: calc(var(--spacing) * 6) var(--spacing);
  }

  .schedule__item {
    grid-template-columns: 9rem minmax(0, 1fr);
    align-items: start;
  }
}
</style>
