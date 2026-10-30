import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Bus, Car, MapPin, Navigation } from 'lucide-react'
import { publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import { Section } from '@/components/public/Section'
import { Linkify, Paragraphs } from '@/components/public/Linkify'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

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
        <div className="grid gap-8 md:grid-cols-5">
          <Card className="md:col-span-3">
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
          <div className="space-y-4 md:col-span-2">
            {location.transport && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="flex items-center gap-2 text-xl">
                    <Bus className="size-4 text-sage" /> Anreise
                  </h3>
                  <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                    <Paragraphs text={location.transport} />
                  </div>
                </CardContent>
              </Card>
            )}
            {location.parking && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="flex items-center gap-2 text-xl">
                    <Car className="size-4 text-sage" /> Parken
                  </h3>
                  <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                    <Paragraphs text={location.parking} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </Section>

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
