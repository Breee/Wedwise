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
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 1.1, delay, ease: EASE },
})

export function InviteStory({ target }: { target: string }) {
  const { data } = useQuery(publicContentQuery)
  const deco = data?.theme?.decoration as SceneVariant | undefined
  const variant = deco && SCENES.includes(deco) ? deco : 'night'

  return (
    <div className="relative bg-[#121c17] text-[#f4efe2]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <DuskScene variant={variant} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/75" />
      </div>
      <div className="relative -mt-[100svh]">
        <section className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-16">
          <Welcome />
          <motion.div className="mt-12 flex justify-center text-[#d9c9a3]" {...rise(1.4)}>
            <ChevronDown className="size-6 animate-bounce" aria-hidden />
          </motion.div>
        </section>
        <section className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-16">
          <Schedule />
          <motion.a
            href={`#${target}`}
            className="group mt-12 flex h-12 items-center justify-center gap-3 rounded-full bg-[#d9c9a3] text-sm font-medium tracking-[0.2em] text-[#1b241d] uppercase shadow-[0_0_40px_rgba(217,201,163,0.35)] transition hover:bg-[#e8dcbd]"
            {...rise(0.2)}
          >
            Zur Rückmeldung
            <ChevronDown className="size-4 transition group-hover:translate-y-1" />
          </motion.a>
        </section>
      </div>
    </div>
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

function Welcome() {
  const { data } = useQuery(publicContentQuery)
  const location = data?.content.location
  const paragraphs = (data?.content.introduction?.text ?? '').split(/\n{2,}/).filter(Boolean)
  return (
    <div className="text-center [text-shadow:0_1px_18px_rgba(0,0,0,0.6)]">
      <Eyebrow>Willkommen</Eyebrow>
      <motion.h1 className="mt-5 font-display text-5xl leading-tight md:text-6xl" {...rise(0.3)}>
        Schön, dass ihr da seid
      </motion.h1>
      <GoldLine delay={0.7} />
      {paragraphs.map((t, i) => (
        <motion.p
          key={i}
          className="mt-4 font-display text-xl leading-relaxed whitespace-pre-line text-[#f4efe2]/90 italic"
          {...rise(0.9 + i * 0.35)}
        >
          {t}
        </motion.p>
      ))}
      <motion.div className="mt-10 space-y-1" {...rise(1.1 + paragraphs.length * 0.35)}>
        {data?.event.date && <p className="font-display text-3xl text-[#d9c9a3]">{formatDate(data.event.date)}</p>}
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
      <motion.h1 className="mt-5 text-center font-display text-5xl leading-tight md:text-6xl" {...rise(0.3)}>
        So feiern wir
      </motion.h1>
      <GoldLine delay={0.7} />
      <ol className="relative mx-auto mt-2 max-w-sm space-y-6 pl-8">
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
            <span className="absolute top-2.5 -left-8 size-[11px] rounded-full bg-[#f7e9a8] shadow-[0_0_14px_4px_rgba(247,233,168,0.55)]" />
            <p className="font-display text-2xl text-[#d9c9a3]">{entry.time}</p>
            <p className="text-lg font-medium">{entry.title}</p>
            {entry.description && <p className="text-sm text-[#f4efe2]/75">{entry.description}</p>}
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
