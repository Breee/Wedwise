import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'
import { DuskScene, type SceneVariant } from './DuskIntro'

export type StoryStep = 'welcome' | 'schedule'

const EASE = [0.22, 1, 0.36, 1] as const
const SCENES: SceneVariant[] = ['dusk', 'forest', 'night']

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 24, filter: 'blur(10px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 1.1, delay, ease: EASE },
})

export function InviteStory({
  step,
  onStep,
  onDone,
}: {
  step: StoryStep
  onStep: (step: StoryStep) => void
  onDone: () => void
}) {
  const { data } = useQuery(publicContentQuery)
  const deco = data?.theme?.decoration as SceneVariant | undefined
  const variant = deco && SCENES.includes(deco) ? deco : 'night'

  return (
    <motion.div
      className="fixed inset-0 z-40 overflow-hidden bg-[#121c17] text-[#f4efe2]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <DuskScene variant={variant} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/75" />

      <div className="absolute inset-0 overflow-y-auto [scrollbar-width:none]">
        <div className="mx-auto flex min-h-full max-w-xl flex-col px-6 pt-10 pb-8">
          <div className="flex justify-center gap-2" aria-label={`Schritt ${step === 'welcome' ? 1 : 2} von 3`}>
            {(['welcome', 'schedule', 'form'] as const).map((s) => (
              <span
                key={s}
                className={`h-px transition-all duration-700 ${
                  s === step ? 'w-10 bg-[#d9c9a3]' : 'w-5 bg-[#d9c9a3]/30'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className="flex flex-1 flex-col justify-center py-10"
              exit={{ opacity: 0, y: -16, filter: 'blur(8px)' }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              {step === 'welcome' ? <Welcome /> : <Schedule />}
            </motion.div>
          </AnimatePresence>

          <motion.div className="flex items-center gap-3" {...rise(1.2)} key={`nav-${step}`}>
            {step === 'schedule' && (
              <button
                type="button"
                onClick={() => onStep('welcome')}
                aria-label="Zurück"
                className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[#d9c9a3]/40 bg-black/25 text-[#d9c9a3] backdrop-blur-sm transition hover:bg-black/40"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => (step === 'welcome' ? onStep('schedule') : onDone())}
              className="group flex h-12 flex-1 items-center justify-center gap-3 rounded-full bg-[#d9c9a3] text-sm font-medium tracking-[0.2em] text-[#1b241d] uppercase shadow-[0_0_40px_rgba(217,201,163,0.35)] transition hover:bg-[#e8dcbd]"
            >
              {step === 'welcome' ? 'Zum Ablauf' : 'Zur Rückmeldung'}
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

function Eyebrow({ children }: { children: string }) {
  return (
    <motion.p
      className="text-center text-xs text-[#d9c9a3] uppercase"
      initial={{ opacity: 0, letterSpacing: '0.1em' }}
      animate={{ opacity: 1, letterSpacing: '0.45em' }}
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
      animate={{ scaleX: 1, opacity: 1 }}
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
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.6 + schedule.length * 0.35, delay: 0.9, ease: 'easeOut' }}
        />
        {schedule.map((entry, i) => (
          <motion.li key={entry.id} className="relative" {...rise(1 + i * 0.35)}>
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
