import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Car, Footprints, MapPin, Navigation, TramFront } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import { Section } from '@/components/public/Section'
import { Linkify, Paragraphs } from '@/components/public/Linkify'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const TravelMap = lazy(() => import('@/components/public/TravelMap').then((m) => ({ default: m.TravelMap })))
const StayMap = lazy(() => import('@/components/public/StayMap').then((m) => ({ default: m.StayMap })))

type TravelMode = import('@/components/public/TravelMap').TravelMode

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

  return (
    <>
      <section className="relative overflow-hidden px-6 pt-24 pb-28 text-center md:pt-36">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mx-auto max-w-3xl"
        >
          {hero.eyebrow && (
            <p className="text-xs font-medium tracking-[0.35em] text-primary uppercase">{hero.eyebrow}</p>
          )}
          <h1 className="mt-6 text-6xl leading-none font-medium tracking-tight md:text-8xl">{headline}</h1>
          {tagline && <p className="mt-5 font-display text-3xl text-primary italic md:text-4xl">{tagline}</p>}
          {hero.subtitle && <p className="mt-6 text-lg text-muted-foreground md:text-xl">{hero.subtitle}</p>}
          <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-4 text-sm tracking-widest uppercase">
            <span className="h-px flex-1 bg-gold" />
            <span className="font-display text-2xl tracking-normal normal-case">{formatDate(event.date)}</span>
            <span className="h-px flex-1 bg-gold" />
          </div>
          {hero.note && <p className="mt-6 text-sm text-muted-foreground italic">{hero.note}</p>}
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
                className="relative pb-10 last:pb-0"
              >
                <span className="absolute top-1.5 -left-[calc(2rem_+_0.375rem_+_0.5px)] size-3 rounded-full border-2 border-gold bg-background" />
                <p className="font-display text-2xl text-primary">{entry.time}</p>
                <h3 className="mt-1 text-xl font-medium">{entry.title}</h3>
                {entry.description && <p className="mt-1 text-muted-foreground">{entry.description}</p>}
              </motion.li>
            ))}
          </ol>
        </Section>
      )}

      <Section id="ort" eyebrow="Die Location" title={location.name || 'Ort'}>
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardContent className="space-y-4 pt-6 leading-relaxed">
              {location.address && (
                <p className="flex items-start gap-3">
                  <MapPin className="mt-1 size-4 shrink-0 text-primary" />
                  <span>
                    {location.address}
                    {'city' in location && location.city ? `, ${location.city}` : ''}
                  </span>
                </p>
              )}
              {location.description && (
                <div className="space-y-3 text-foreground/85">
                  <Paragraphs text={location.description} />
                </div>
              )}
              {location.navigationUrl && (
                <Button asChild>
                  <a href={location.navigationUrl} target="_blank" rel="noreferrer">
                    <Navigation className="size-4" /> Route planen
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as TravelMode)} className="mt-12">
          <TabsList className="mx-auto">
            <TabsTrigger value="transit"><TramFront className="size-4" /> Tram</TabsTrigger>
            <TabsTrigger value="foot"><Footprints className="size-4" /> Zu Fuß</TabsTrigger>
            <TabsTrigger value="car"><Car className="size-4" /> Auto</TabsTrigger>
          </TabsList>
          {(
            [
              { mode: 'transit', text: location.transport },
              { mode: 'foot', text: hotels.length ? 'Diese Unterkünfte liegen in Gehweite der Location.' : '' },
              { mode: 'car', text: location.parking },
            ] as const
          ).map(({ mode, text }) => (
            <TabsContent key={mode} value={mode} className="mt-6 space-y-6">
              {text && (
                <div className="mx-auto max-w-2xl space-y-2 text-center text-muted-foreground">
                  <Paragraphs text={text} />
                  {mode === 'car' && location.navigationUrl && (
                    <Button asChild className="mt-2">
                      <a href={location.navigationUrl} target="_blank" rel="noreferrer">
                        <Navigation className="size-4" /> Route planen
                      </a>
                    </Button>
                  )}
                </div>
              )}
              {hasMap && (
                <Suspense fallback={<Skeleton className="h-[420px] rounded-3xl md:h-[520px]" />}>
                  <TravelMap travel={travel} venueName={location.name || 'Location'} mode={mode} hotels={hotels} />
                </Suspense>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </Section>

      {hotels.length > 0 && (
        <Section id="unterkunft" eyebrow="Übernachten" title="Unterkünfte" className="bg-card/50">
          <Suspense fallback={<Skeleton className="h-[380px] rounded-3xl" />}>
            <StayMap accommodation={content.accommodation} travel={travel} city={city} mode={mode} onModeChange={setMode} />
          </Suspense>
        </Section>
      )}

      {faq.length > 0 && (
        <Section id="faq" eyebrow="Gut zu wissen" title="Fragen & Antworten">
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
