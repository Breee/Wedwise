import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import { DuskScene, type SceneVariant } from './DuskIntro'

const EASE = [0.22, 1, 0.36, 1] as const
const SCENES: SceneVariant[] = ['dusk', 'forest', 'night']

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 24, filter: 'blur(10px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, amount: 0.1 },
  transition: { duration: 1.1, delay, ease: EASE },
})

// lit: the guest arrives from the fireflies, where the names are already on screen.
export function InviteStory({ target, name, lit }: { target: string; name?: string; lit?: boolean }) {
  const { data } = useQuery(publicContentQuery)
  const deco = data?.theme?.decoration as SceneVariant | undefined
  const variant = deco && SCENES.includes(deco) ? deco : 'night'

  return (
    <div className="relative bg-[#121c17] text-[#f4efe2]">
      <div className="sticky top-0 h-lvh overflow-hidden">
        <DuskScene variant={variant} settled={lit} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
      </div>
      <div className="relative -mt-[100lvh]">
        <Page id="invite-title" next="invite-schedule">
          <Title guest={name} lit={lit} />
        </Page>
        <Page id="invite-schedule" next={target} label={t('Zur Rückmeldung')}>
          <Schedule />
        </Page>
      </div>
    </div>
  )
}

function Page({ id, next, label, children }: { id: string; next: string; label?: string; children: ReactNode }) {
  return (
    // As tall as the screen with the browser bars hidden, so the next page
    // never shows below; the content keeps to the height that is always visible.
    <section id={id} className="mx-auto min-h-lvh max-w-xl snap-start snap-always px-6">
      <div className="flex min-h-svh flex-col justify-center pt-8 pb-4">
        <div className="flex flex-1 flex-col justify-center">{children}</div>
        <button
          type="button"
          aria-label={label ?? t('Weiter')}
          onClick={() => document.getElementById(next)?.scrollIntoView({ behavior: 'smooth' })}
          className="mx-auto mt-6 flex min-h-12 flex-col items-center justify-center gap-1 px-6 text-[#d9c9a3]"
        >
          {label && <span className="text-xs tracking-[0.3em] uppercase">{label}</span>}
          <ChevronDown className="size-7 animate-bounce" aria-hidden />
        </button>
      </div>
    </section>
  )
}

function Eyebrow({ children, lit }: { children: string; lit?: boolean }) {
  if (lit) return <p className="text-center text-sm font-medium tracking-[0.45em] text-[#ecdcb0] uppercase">{children}</p>
  return (
    <motion.p
      className="text-center text-sm font-medium text-[#ecdcb0] uppercase"
      initial={{ opacity: 0, letterSpacing: '0.1em' }}
      whileInView={{ opacity: 1, letterSpacing: '0.45em' }}
      viewport={{ once: true }}
      transition={{ duration: 1.6, ease: EASE }}
    >
      {children}
    </motion.p>
  )
}

function GoldLine({ delay }: { delay: number }) {
  return (
    <motion.div
      className="mx-auto my-6 h-px w-32 bg-gradient-to-r from-transparent via-[#d9c9a3] to-transparent"
      initial={{ scaleX: 0, opacity: 0 }}
      whileInView={{ scaleX: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.4, delay, ease: EASE }}
    />
  )
}

function Title({ guest, lit }: { guest?: string; lit?: boolean }) {
  const { data } = useQuery(publicContentQuery)
  const location = data?.content.location
  const names = data?.event.couple?.map((c) => c.name).join(' & ') || data?.event.title
  return (
    <div className="text-center [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]">
      {guest && !lit && (
        <motion.p className="mb-5 font-display text-3xl text-[#ecdcb0] text-balance" {...rise(0.1)}>
          {guest}
        </motion.p>
      )}
      <Eyebrow lit={lit}>{t('Ihr seid eingeladen')}</Eyebrow>
      <motion.h1 className="mt-6 font-display text-5xl leading-tight text-balance md:text-7xl" {...(lit ? {} : rise(0.4))}>
        {names}
      </motion.h1>
      {lit ? <div className="mx-auto my-6 h-px w-32 bg-gradient-to-r from-transparent via-[#d9c9a3] to-transparent" /> : <GoldLine delay={0.9} />}
      {data?.event.date && (
        <motion.p className="font-display text-3xl text-[#ecdcb0]" {...(lit ? {} : rise(1.2))}>
          {formatDate(data.event.date)}
        </motion.p>
      )}
      {location?.name && (
        <motion.p className="mt-6 text-base font-medium tracking-[0.25em] uppercase" {...(lit ? {} : rise(1.5))}>
          {location.name}
        </motion.p>
      )}
    </div>
  )
}

function Schedule() {
  const { data } = useQuery(publicContentQuery)
  const schedule = [...(data?.content.schedule ?? [])].sort((a, b) => a.order - b.order)
  return (
    <div className="[text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]">
      <Eyebrow>{t('Unser Tag')}</Eyebrow>
      <motion.h2 className="mt-5 text-center font-display text-4xl leading-tight sm:text-5xl md:text-6xl" {...rise(0.3)}>
        {t('So feiern wir')}
      </motion.h2>
      <GoldLine delay={0.7} />
      <ol className="relative mx-auto mt-2 max-w-sm space-y-4 pl-8">
        <motion.span
          aria-hidden
          className="absolute top-2 bottom-2 left-[5px] w-px origin-top bg-gradient-to-b from-[#d9c9a3] via-[#d9c9a3]/60 to-transparent shadow-[0_0_12px_rgba(217,201,163,0.8)]"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 + schedule.length * 0.35, delay: 0.3, ease: 'easeOut' }}
        />
        {schedule.map((entry, i) => (
          <motion.li key={entry.id} className="relative" {...rise(0.1 + i * 0.1)}>
            <span className="absolute top-2 -left-8 size-[11px] rounded-full bg-[#f7e9a8] shadow-[0_0_14px_4px_rgba(247,233,168,0.55)]" />
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-2xl font-semibold text-[#ecdcb0]">{entry.time}</span>
              <span className="text-lg font-medium">{entry.title}</span>
            </p>
            {entry.description && <p className="text-[15px] text-[#f4efe2]/90">{entry.description}</p>}
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
