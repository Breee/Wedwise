import { createFileRoute, Link } from '@tanstack/react-router'
import { t } from '@/lib/i18n'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Bike, CalendarPlus, PencilLine, Car, ChevronDown, MapPin, Navigation, TramFront } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { messagesQuery, publicContentQuery } from '@/lib/queries'
import { formatDate, formatDateTime } from '@/lib/format'
import { icsUrl } from '@/lib/ics'
import { InstallApp } from '@/components/public/InstallApp'
import { GuestNotifications } from '@/components/public/Notifications'
import { rememberedToken } from '@/lib/remember'
import type { DirectionsMode } from '@/lib/geo'
import { DirectionsLinks } from '@/components/public/DirectionsLinks'
import { Section } from '@/components/public/Section'
import { SectionNav } from '@/components/public/SectionNav'
import { BotanicalCorners } from '@/components/public/Botanical'
import { Linkify, Paragraphs } from '@/components/public/Linkify'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TravelMode } from '@/components/public/TravelMap'

const TravelMap = lazy(() => import('@/components/public/TravelMap').then((m) => ({ default: m.TravelMap })))
const StayMap = lazy(() => import('@/components/public/StayMap').then((m) => ({ default: m.StayMap })))

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(publicContentQuery),
      context.queryClient.ensureQueryData(messagesQuery).catch(() => []),
    ]),
  pendingComponent: () => (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-32">
      <Skeleton className="mx-auto h-6 w-40" />
      <Skeleton className="mx-auto h-16 w-full" />
      <Skeleton className="mx-auto h-6 w-64" />
    </div>
  ),
  component: HomePage,
})

function HomePage() {
  const { data } = useSuspenseQuery(publicContentQuery)
  const { data: messages = [] } = useQuery(messagesQuery)
  const { event, content } = data
  const hero = { ...event.hero, ...stripEmpty(content.hero) }
  const location = { ...event.venue, ...stripEmpty(content.location) }
  const coupleNames = event.couple.map((c) => c.name).filter(Boolean)
  const names = coupleNames.join(' & ')
  const headline = names || hero.headline || event.title
  const tagline = names ? hero.headline : ''
  const schedule = [...(content.schedule ?? [])].sort((a, b) => a.order - b.order)
  const faq = [...(content.faq ?? [])].sort((a, b) => a.order - b.order)
  const travel = content.travel
  const hasMap = !!travel && (travel.lat !== 0 || travel.lng !== 0)
  const hotels = content.accommodation?.hotels ?? []
  const city = event.venue.city || event.venue.name
  const [mode, setMode] = useState<TravelMode>('transit')
  const ARRIVAL: { mode: TravelMode; label: string; short: string; Icon: typeof Car; text: string; directions: DirectionsMode }[] = [
    { mode: 'transit', label: t('Mit der Tram'), short: t('Tram'), Icon: TramFront, text: location.transport, directions: 'transit' },
    { mode: 'bike', label: t('Mit dem Rad'), short: t('Rad'), Icon: Bike, text: location.bike ?? '', directions: 'bicycling' },
    { mode: 'car', label: t('Mit dem Auto'), short: t('Auto'), Icon: Car, text: location.parking, directions: 'driving' },
  ]
  const address = [location.address, 'city' in location && location.city ? location.city : ''].filter(Boolean).join(', ')
  const calendar = icsUrl({
    title: coupleNames.length ? t('Hochzeit {names}', { names: coupleNames.join(' & ') }) : event.title,
    date: event.date,
    location: [location.name, address].filter(Boolean).join(', '),
    url: window.location.origin,
    schedule,
    timezone: event.timezone,
  })

  return (
    <>
      <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center md:pt-36 md:pb-28">
        <BotanicalCorners />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mx-auto max-w-3xl"
        >
          {hero.eyebrow && (
            <p className="text-xs font-medium tracking-[0.35em] text-primary uppercase">{hero.eyebrow}</p>
          )}
          <h1 className="mt-6 text-6xl leading-none font-medium tracking-tight text-primary md:text-8xl">{headline}</h1>
          {tagline && <p className="mt-5 font-display text-3xl text-primary italic md:text-4xl">{tagline}</p>}
          {hero.subtitle && <p className="mt-6 text-lg text-muted-foreground md:text-xl">{hero.subtitle}</p>}
          <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-4 text-sm tracking-widest uppercase">
            <span className="h-px flex-1 bg-gold" />
            <span className="font-display text-2xl tracking-normal normal-case">{formatDate(event.date)}</span>
            <span className="h-px flex-1 bg-gold" />
          </div>
          {hero.note && <p className="mt-6 text-sm text-muted-foreground italic">{hero.note}</p>}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="outline" size="sm">
              <a href={calendar} download={t('hochzeit.ics')}>
                <CalendarPlus className="size-4" /> {t('Zum Kalender hinzufügen')}
              </a>
            </Button>
            {rememberedToken() && (
              <Button asChild variant="outline" size="sm">
                <Link to="/rsvp">
                  <PencilLine className="size-4" /> {t('Eure Antwort bearbeiten')}
                </Link>
              </Button>
            )}
          </div>
          <div className="mx-auto mt-6 max-w-sm space-y-3">
            <InstallApp />
            {rememberedToken() && <GuestNotifications />}
          </div>
          {schedule.length > 0 && (
            <a href="#ablauf" className="mt-10 inline-flex flex-col items-center gap-1 text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:text-primary">
              {t('Zum Ablauf')} <ChevronDown className="size-4 animate-bounce" />
            </a>
          )}
        </motion.div>
      </section>

      <SectionNav />

      {messages.length > 0 && (
        <Section id="neuigkeiten" eyebrow={t('Von uns')} title={t('Neuigkeiten')}>
          <ul className="mx-auto max-w-2xl space-y-4">
            {messages.map((m) => (
              <li key={m.id} className="rounded-xl border bg-card p-5">
                <p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</p>
                <h3 className="mt-1 font-display text-2xl">{m.title}</h3>
                {m.body && <p className="mt-2 whitespace-pre-line text-foreground/85">{m.body}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {content.introduction?.text && (
        <Section eyebrow={t('Willkommen')} title={t('Schön, dass ihr da seid')}>
          <div className="mx-auto max-w-2xl space-y-4 text-center text-lg leading-relaxed text-foreground/85">
            <Paragraphs text={content.introduction.text} />
          </div>
        </Section>
      )}

      {schedule.length > 0 && (
        <Section id="ablauf" eyebrow={t('Der Tag')} title={t('Ablauf')} className="bg-card/50">
          <ol className="relative mx-auto max-w-2xl border-l border-gold/60 pl-8">
            {schedule.map((entry, i) => (
              <motion.li
                key={entry.id ?? i}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="relative pb-6 last:pb-0 md:pb-8"
              >
                <span className="absolute top-2 -left-[calc(2rem_+_0.375rem_+_0.5px)] size-3 rounded-full border-2 border-gold bg-background" />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="font-display text-2xl text-primary">{entry.time}</p>
                  <h3 className="text-xl font-medium">{entry.title}</h3>
                </div>
                {entry.description && <p className="mt-1 text-sm text-muted-foreground md:text-base">{entry.description}</p>}
              </motion.li>
            ))}
          </ol>
        </Section>
      )}

      <Section id="ort" eyebrow={t('Die Location')} title={location.name || t('Ort')}>
        <div className="mx-auto max-w-5xl space-y-6 sm:space-y-10">
          {location.image && (
            <motion.figure
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative overflow-hidden rounded-2xl border sm:rounded-3xl border border-gold/40 shadow-xl shadow-primary/10"
            >
              <img src={location.image} alt={location.name || 'Location'} className="aspect-[4/3] w-full object-cover sm:aspect-[21/9]" loading="lazy" />
              {address && (
                <div className="absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/60 to-transparent p-6 text-white sm:block md:p-8">
                  <p className="flex items-center gap-2 text-sm md:text-base">
                    <MapPin className="size-4 shrink-0" /> {address}
                  </p>
                </div>
              )}
            </motion.figure>
          )}
          <div className="mx-auto max-w-2xl space-y-4 text-center text-lg leading-relaxed text-foreground/85">
            {address && (
              <p className={cn('text-base text-balance text-muted-foreground', location.image && 'sm:hidden')}>
                <MapPin className="mr-1.5 inline size-4 align-[-2px] text-primary" />
                {address}
              </p>
            )}
            {location.description && <Paragraphs text={location.description} />}
            {location.navigationUrl && (
              <Button asChild>
                <a href={location.navigationUrl} target="_blank" rel="noreferrer">
                  <Navigation className="size-4" /> {t('Route planen')}
                </a>
              </Button>
            )}
          </div>
        </div>
      </Section>

      {(location.transport || location.parking || location.bike || hasMap) && (
        <Section id="anreise" eyebrow={t('Anreise')} title={t('So kommt ihr hin')} className="bg-card/50">
          <Tabs value={mode} onValueChange={(v) => setMode(v as TravelMode)} className="space-y-8">
            <TabsList className="mx-auto grid w-full max-w-md grid-cols-3 sm:flex sm:w-fit">
              {ARRIVAL.map(({ mode: m, label, short, Icon }) => (
                <TabsTrigger key={m} value={m} className="gap-1.5 px-2 text-xs sm:gap-2 sm:px-4 sm:text-sm">
                  <Icon className="size-4" /> <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {ARRIVAL.map(({ mode: m, label, Icon, text, directions }) => (
              <TabsContent key={m} value={m} className="space-y-6">
                <Card className="mx-auto max-w-2xl">
                  <CardContent className="space-y-3 pt-6">
                    <h3 className="flex items-center gap-2 text-2xl"><Icon className="size-5 text-primary" /> {label}</h3>
                    {text && <div className="space-y-2 text-muted-foreground"><Paragraphs text={text} /></div>}
                    {hasMap && m === 'bike' && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
                        <span>{t('Route zur Location:')}</span>
                        <DirectionsLinks to={[travel.lng, travel.lat]} name={location.name || 'Location'} mode={directions} />
                      </div>
                    )}
                  </CardContent>
                </Card>
                {hasMap && (
                  <Suspense fallback={<Skeleton className="h-[60svh] max-h-[520px] min-h-[320px] rounded-3xl" />}>
                    <TravelMap travel={travel} venueName={location.name || 'Location'} mode={m} />
                  </Suspense>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Section>
      )}

      {hotels.length > 0 && travel && (
        <Section id="unterkunft" eyebrow={t('Übernachten')} title={t('Unterkünfte')}>
          <Suspense fallback={<Skeleton className="h-[380px] rounded-3xl" />}>
            <StayMap accommodation={content.accommodation} travel={travel} city={city} />
          </Suspense>
        </Section>
      )}

      {faq.length > 0 && (
        <Section id="faq" eyebrow={t('Gut zu wissen')} title={t('Fragen & Antworten')} className="bg-card/50">
          <div className="mx-auto grid max-w-3xl gap-4">
            {faq.map((entry, i) => (
              <Card key={entry.id ?? i}>
                <CardContent className="pt-6">
                  <h3 className="text-2xl">{entry.question}</h3>
                  <div className="mt-2 space-y-2 whitespace-pre-line text-muted-foreground">
                    <Linkify text={entry.answer} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

function stripEmpty<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {}
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null)) as Partial<T>
}
