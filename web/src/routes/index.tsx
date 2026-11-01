import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Bike, CalendarPlus, Car, ChevronDown, MapPin, Navigation, TramFront } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import { icsUrl } from '@/lib/ics'
import type { DirectionsMode } from '@/lib/geo'
import { DirectionsLinks } from '@/components/public/DirectionsLinks'
import { Section } from '@/components/public/Section'
import { BotanicalFrame } from '@/components/public/BotanicalFrame'
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
  loader: ({ context }) => context.queryClient.ensureQueryData(publicContentQuery),
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
  const city = event.venue.city || 'Freiburg im Breisgau'
  const [mode, setMode] = useState<TravelMode>('transit')
  const ARRIVAL: { mode: TravelMode; label: string; short: string; Icon: typeof Car; text: string; directions: DirectionsMode }[] = [
    { mode: 'transit', label: 'Mit der Tram', short: 'Tram', Icon: TramFront, text: location.transport, directions: 'transit' },
    { mode: 'bike', label: 'Mit dem Rad', short: 'Rad', Icon: Bike, text: location.bike ?? '', directions: 'bicycling' },
    { mode: 'car', label: 'Mit dem Auto', short: 'Auto', Icon: Car, text: location.parking, directions: 'driving' },
  ]
  const botanical = data.theme?.decoration === 'botanical'
  const address = [location.address, 'city' in location && location.city ? location.city : ''].filter(Boolean).join(', ')
  const calendar = icsUrl({
    title: coupleNames.length ? `Hochzeit ${coupleNames.join(' & ')}` : event.title,
    date: event.date,
    location: [location.name, address].filter(Boolean).join(', '),
    url: window.location.origin,
    schedule,
  })

  return (
    <>
      <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center md:pt-36 md:pb-28">
        {botanical && <BotanicalFrame />}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mx-auto max-w-3xl"
        >
          {hero.eyebrow && (
            <p className="text-xs font-medium tracking-[0.35em] text-primary uppercase">{hero.eyebrow}</p>
          )}
          <h1 className={botanical ? 'mt-6 font-script text-6xl leading-tight font-normal text-primary md:text-8xl' : 'mt-6 text-6xl leading-none font-medium tracking-tight md:text-8xl'}>{headline}</h1>
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
              <a href={calendar} download="hochzeit.ics">
                <CalendarPlus className="size-4" /> Zum Kalender hinzufügen
              </a>
            </Button>
          </div>
          {schedule.length > 0 && (
            <a href="#ablauf" className="mt-10 inline-flex flex-col items-center gap-1 text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:text-primary">
              Zum Ablauf <ChevronDown className="size-4 animate-bounce" />
            </a>
          )}
        </motion.div>
      </section>

      {content.introduction?.text && (
        <Section eyebrow="Willkommen" title="Schön, dass ihr da seid">
          <div className="mx-auto max-w-2xl space-y-4 text-center text-lg leading-relaxed text-foreground/85">
            <Paragraphs text={content.introduction.text} />
          </div>
        </Section>
      )}

      {schedule.length > 0 && (
        <Section id="ablauf" eyebrow="Der Tag" title="Ablauf" className="bg-card/50">
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

      <Section id="ort" eyebrow="Die Location" title={location.name || 'Ort'}>
        <div className="mx-auto max-w-5xl space-y-10">
          {location.image && (
            <motion.figure
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative overflow-hidden rounded-3xl border border-gold/40 shadow-xl shadow-primary/10"
            >
              <img src={location.image} alt={location.name || 'Location'} className="aspect-[21/9] w-full object-cover" loading="lazy" />
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
              <p className={cn('flex items-center justify-center gap-2 text-base', location.image && 'sm:hidden')}>
                <MapPin className="size-4 shrink-0 text-primary" /> {address}
              </p>
            )}
            {location.description && <Paragraphs text={location.description} />}
            {location.navigationUrl && (
              <Button asChild>
                <a href={location.navigationUrl} target="_blank" rel="noreferrer">
                  <Navigation className="size-4" /> Route planen
                </a>
              </Button>
            )}
          </div>
        </div>
      </Section>

      {(location.transport || location.parking || location.bike || hasMap) && (
        <Section id="anreise" eyebrow="Anreise" title="So kommt ihr hin" className="bg-card/50">
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
                        <span>Route zur Location:</span>
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
        <Section id="unterkunft" eyebrow="Übernachten" title="Unterkünfte">
          <Suspense fallback={<Skeleton className="h-[380px] rounded-3xl" />}>
            <StayMap accommodation={content.accommodation} travel={travel} city={city} />
          </Suspense>
        </Section>
      )}

      {faq.length > 0 && (
        <Section id="faq" eyebrow="Gut zu wissen" title="Fragen & Antworten" className="bg-card/50">
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
