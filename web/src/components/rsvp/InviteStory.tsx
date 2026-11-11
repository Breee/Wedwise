import { useEffect, type ReactNode } from 'react'
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

export function InviteStory({ target }: { target: string }) {
  const { data } = useQuery(publicContentQuery)
  const deco = data?.theme?.decoration as SceneVariant | undefined
  const variant = deco && SCENES.includes(deco) ? deco : 'night'

  useEffect(() => {
    const root = document.documentElement
    root.style.scrollSnapType = 'y mandatory'
    return () => {
      root.style.scrollSnapType = ''
    }
  }, [])

  return (
    <div className="relative bg-[#121c17] text-[#f4efe2]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <DuskScene variant={variant} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/75" />
      </div>
      <div className="relative -mt-[100svh]">
        <Page id="invite-title" next="invite-schedule">
          <Title />
        </Page>
        <Page id="invite-schedule" next={target} label="Zur Rückmeldung">
          <Schedule />
        </Page>
      </div>
    </div>
  )
}

function Page({ id, next, label, children }: { id: string; next: string; label?: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="mx-auto flex min-h-svh max-w-xl snap-start snap-always flex-col justify-center px-6 pt-8 pb-4"
    >
      <div className="flex flex-1 flex-col justify-center">{children}</div>
      <button
        type="button"
        aria-label={label ?? 'Weiter'}
        onClick={() => document.getElementById(next)?.scrollIntoView({ behavior: 'smooth' })}
        className="mx-auto mt-6 flex min-h-12 flex-col items-center justify-center gap-1 px-6 text-[#d9c9a3]"
      >
        {label && <span className="text-xs tracking-[0.3em] uppercase">{label}</span>}
        <ChevronDown className="size-7 animate-bounce" aria-hidden />
      </button>
    </section>
  )
}

function Eyebrow({ children }: { children: string }) {
  return (
    <motion.p
      className="text-center text-xs text-[#d9c9a3] uppercase"
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

function Title() {
  const { data } = useQuery(publicContentQuery)
  const location = data?.content.location
  const names = data?.event.couple?.map((c) => c.name).join(' & ') || data?.event.title
  return (
    <div className="text-center [text-shadow:0_1px_18px_rgba(0,0,0,0.6)]">
      <Eyebrow>Ihr seid eingeladen</Eyebrow>
      <motion.h1 className="mt-6 font-display text-5xl leading-tight text-balance md:text-7xl" {...rise(0.4)}>
        {names}
      </motion.h1>
      <GoldLine delay={0.9} />
      {data?.event.date && (
        <motion.p className="font-display text-2xl text-[#d9c9a3]" {...rise(1.2)}>
          {formatDate(data.event.date)}
        </motion.p>
      )}
      <motion.div className="mt-8 space-y-1" {...rise(1.5)}>
        {location?.name && <p className="text-sm tracking-[0.25em] uppercase">{location.name}</p>}
        {location?.address && <p className="text-sm text-[#f4efe2]/70">{location.address}</p>}
      </motion.div>
    </div>
  )
}

function Schedule() {
  const { data } = useQuery(publicContentQuery)
  const schedule = [...(data?.content.schedule ?? [])].sort((a, b) => a.order - b.order)
  return (
    <div className="[text-shadow:0_1px_18px_rgba(0,0,0,0.6)]">
      <Eyebrow>Unser Tag</Eyebrow>
      <motion.h2 className="mt-5 text-center font-display text-4xl leading-tight sm:text-5xl md:text-6xl" {...rise(0.3)}>
        So feiern wir
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
              <span className="font-display text-xl text-[#d9c9a3]">{entry.time}</span>
              <span className="font-medium">{entry.title}</span>
            </p>
            {entry.description && <p className="text-sm text-[#f4efe2]/75">{entry.description}</p>}
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
