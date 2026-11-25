import { useEffect, useState, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { Heart } from 'lucide-react'
import { ApiError, api } from '@/lib/api'
import { publicContentQuery } from '@/lib/queries'
import { DuskScene, type SceneVariant } from '@/components/rsvp/DuskIntro'

const LENGTH = 6
const SCENES: SceneVariant[] = ['dusk', 'forest', 'night']
const EASE = [0.22, 1, 0.36, 1] as const

export const Route = createFileRoute('/join-us')({
  validateSearch: (s: Record<string, unknown>): { code?: string; look?: 'night' | 'envelope' } => ({
    ...(typeof s.code === 'string' ? { code: s.code } : {}),
    ...(s.look === 'night' || s.look === 'envelope' ? { look: s.look } : {}),
  }),
  component: JoinPage,
})

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH)

function JoinPage() {
  const navigate = useNavigate()
  const { code: given, look } = Route.useSearch()
  const { data } = useQuery(publicContentQuery)
  const deco = data?.theme?.decoration as SceneVariant | undefined
  const [code, setCode] = useState(() => clean(given ?? ''))
  const [focused, setFocused] = useState(false)
  const row = useAnimationControls()
  // ?look= overrides the setting, to try out the other look.
  const envelope = (look ?? data?.content.inviteOpening) === 'envelope'
  const still = useReducedMotion() ?? false

  const open = useMutation({
    mutationFn: (value: string) => api.post<{ link: string }>('/rsvp/code', { code: value }),
    // The light fills the screen before the invitation takes over.
    onSuccess: ({ link }) =>
      setTimeout(() => navigate({ to: '/rsvp/$link', params: { link }, replace: true }), !envelope ? 1500 : still ? 700 : 3300),
    onError: () => {
      setCode('')
      row.start({ x: [0, -12, 12, -8, 8, 0], transition: { duration: 0.45 } })
    },
  })

  const submit = open.mutate
  useEffect(() => {
    if (code.length === LENGTH) submit(code)
  }, [code, submit])

  const opened = open.isSuccess
  const busy = open.isPending || opened
  const hint = open.isError
    ? open.error instanceof ApiError && open.error.status === 429
      ? t('Zu viele Versuche. Bitte wartet einen Moment.')
      : t('Dieser Code passt nicht.')
    : !opened && t('Ihr findet ihn auf eurer Einladung.')
  const field = (
    <input
      value={code}
      onChange={(e) => {
        if (busy) return
        open.reset()
        setCode(clean(e.target.value))
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      readOnly={busy}
      aria-label={t('Euer Code')}
      aria-describedby="join-hint"
      autoFocus
      autoComplete="off"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="go"
      maxLength={LENGTH}
      className="absolute inset-0 z-50 size-full cursor-pointer opacity-0"
    />
  )

  if (envelope) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
        <div className="relative mx-auto max-w-xl px-6 pt-[5svh] text-center">
          <motion.h1 className="font-display text-3xl leading-tight sm:text-4xl" animate={{ opacity: opened ? 0 : 1 }}>
            {t('Euer Code')}
          </motion.h1>
          <p id="join-hint" className={`mt-2 h-10 text-sm ${open.isError ? 'text-destructive' : 'text-muted-foreground'}`} role="status">
            {hint}
          </p>
          <Envelope code={code} active={focused && !busy} opened={opened} still={still} shake={row}>
            {field}
          </Envelope>
        </div>
        {opened && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: still ? 0.3 : 2.8 }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#121c17] text-[#f4efe2]">
      <DuskScene variant={deco && SCENES.includes(deco) ? deco : 'night'} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
      <div className="relative mx-auto max-w-xl px-6 pt-[14svh] text-center [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]">
        <motion.p
          className="text-sm font-medium text-[#ecdcb0] uppercase"
          initial={{ opacity: 0, letterSpacing: '0.1em' }}
          animate={{ opacity: 1, letterSpacing: '0.45em' }}
          transition={{ duration: 1.6, ease: EASE }}
        >
          {t('Ihr seid eingeladen')}
        </motion.p>
        <motion.h1
          className="mt-5 font-display text-4xl leading-tight sm:text-5xl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
        >
          {t('Euer Code')}
        </motion.h1>

        <motion.div className="mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.7 }}>
          <div className="relative mx-auto w-fit">
            <motion.div className="flex gap-2 sm:gap-3" animate={row} aria-hidden>
              {Array.from({ length: LENGTH }, (_, i) => (
                <Slot key={i} char={code[i]} active={focused && !busy && i === code.length} lit={opened} index={i} />
              ))}
            </motion.div>
            {field}
          </div>
        </motion.div>

        <p id="join-hint" className="mt-6 h-12 text-base" role="status">
          {hint}
        </p>
      </div>

      {opened && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-[38svh] left-1/2 size-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_35%,rgba(247,233,168,0)_70%)]"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 40, opacity: [0, 1, 1] }}
          transition={{ duration: 1.3, delay: 0.5, ease: 'easeIn' }}
        />
      )}
    </div>
  )
}

const PAPER = 'color-mix(in oklab, var(--gold) 22%, var(--card))'
const FLAP = 'color-mix(in oklab, var(--gold) 34%, var(--card))'

// The seal is the lock: each character of the code is stamped into a notch on
// its ring, which turns one step. The full code spins the ring and the seal
// breaks.
const SWEEP = 0.7
const STEP = 360 / LENGTH

function Dial({ code, active, opened, still }: { code: string; active: boolean; opened: boolean; still: boolean }) {
  const turn = opened ? -720 : -code.length * STEP
  const spin = still
    ? { duration: 0 }
    : opened
    ? { duration: SWEEP, ease: 'easeInOut' as const }
    : { type: 'spring' as const, stiffness: 260, damping: 22 }
  return (
    <span className="relative block size-full rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary-foreground/25 ring-inset">
      <motion.span className="absolute inset-0" initial={false} animate={{ rotate: turn }} transition={spin}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 -mt-[17px] -ml-[17px] size-[34px]"
            style={{ transform: `rotate(${i * STEP}deg) translateY(-50px)` }}
          >
            <motion.span
              className={`flex size-full items-center justify-center rounded-full bg-black/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)] ${
                active && i === code.length ? 'animate-pulse ring-2 ring-primary-foreground/80' : ''
              }`}
              initial={false}
              animate={{ rotate: -turn - i * STEP, boxShadow: opened ? '0 0 12px 2px var(--gold)' : '0 0 0 0 rgba(0,0,0,0)' }}
              transition={spin}
            >
              <AnimatePresence>
                {code[i] && (
                  <motion.span
                    key={code[i]}
                    className="absolute font-display text-xl leading-none"
                    initial={{ opacity: 0, scale: 2 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, y: 26 }}
                    transition={still ? { duration: 0 } : { duration: 0.25 }}
                  >
                    {code[i]}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.span>
          </span>
        ))}
      </motion.span>
      <Heart className="absolute top-1/2 left-1/2 -mt-3 -ml-3 size-6 fill-current" />
    </span>
  )
}

// A sealed envelope seen from the back. Once the seal breaks, the flap lifts
// and the card rises out; then the envelope drops away and leaves the card.
function Envelope({
  code,
  active,
  opened,
  still,
  shake,
  children,
}: {
  code: string
  active: boolean
  opened: boolean
  still: boolean
  shake: ReturnType<typeof useAnimationControls>
  children: ReactNode
}) {
  const move = opened && !still
  const drop = {
    animate: move ? { y: '140%', opacity: 0 } : { y: '0%', opacity: 1 },
    transition: { duration: 0.6, delay: SWEEP + 1.7, ease: 'easeIn' as const },
  }
  return (
    <motion.div
      className="relative mx-auto mt-3 h-[300px] w-full max-w-[21.5rem]"
      initial={still ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <motion.div className="absolute inset-0 rounded-lg shadow-lg" style={{ background: FLAP }} {...drop} />
      <motion.div
        aria-hidden
        className="absolute inset-x-3 top-2 bottom-2 z-10 flex flex-col items-center gap-3 rounded-md border bg-card pt-9 shadow-sm"
        animate={{ y: move ? '-40%' : '0%' }}
        transition={{ duration: 0.8, delay: SWEEP + 1, ease: EASE }}
      >
        <span className="font-display text-xl">{t('Ihr seid eingeladen')}</span>
        <Heart className="size-4 fill-current text-primary" />
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute inset-0 z-20 rounded-lg"
        style={{ background: PAPER, clipPath: 'polygon(0 0, 50% 55%, 100% 0, 100% 100%, 0 100%)' }}
        {...drop}
      />
      {/* The flap is edge-on halfway through, which hides its move behind the card. */}
      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[55%] [perspective:900px]"
        style={{ zIndex: move ? 5 : 30, transition: `z-index 0s ${SWEEP + 0.75}s` }}
        {...drop}
      >
        <motion.div
          className="size-full origin-top rounded-t-lg"
          style={{ background: FLAP, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
          animate={{ rotateX: move ? 180 : 0, filter: move ? 'brightness(0.9)' : 'brightness(0.97)' }}
          transition={{ duration: 0.6, delay: SWEEP + 0.45, ease: 'easeInOut' }}
        />
      </motion.div>
      <motion.div aria-hidden className="absolute top-[55%] left-1/2 z-40 -mt-[76px] -ml-[76px] size-[152px]" animate={shake}>
        <motion.div
          className="relative size-full"
          animate={move ? { scale: [1, 0.92, 1] } : { scale: 1 }}
          transition={{ duration: 0.25, delay: SWEEP }}
        >
          {[0, 1].map((side) => (
            <motion.span
              key={side}
              className="absolute inset-0"
              style={{ clipPath: side ? 'polygon(52% 0, 100% 0, 100% 100%, 46% 100%, 56% 60%, 44% 40%)' : 'polygon(0 0, 52% 0, 44% 40%, 56% 60%, 46% 100%, 0 100%)' }}
              animate={opened ? { x: side ? 30 : -30, y: 90, rotate: side ? 28 : -28, opacity: 0 } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
              transition={still ? { duration: 0 } : { duration: 0.5, delay: opened ? SWEEP + 0.2 : 0, ease: 'easeIn' }}
            >
              <Dial code={code} active={active} opened={opened} still={still} />
            </motion.span>
          ))}
        </motion.div>
      </motion.div>
      {children}
    </motion.div>
  )
}

// One character of the code. A typed character lands like a firefly settling.
function Slot({ char, active, lit, index }: { char?: string; active: boolean; lit: boolean; index: number }) {
  return (
    <motion.span
      className={`relative flex h-14 w-11 items-center justify-center rounded-lg border bg-black/35 backdrop-blur-sm sm:h-16 sm:w-13 ${
        char || active ? 'border-[#f7e9a8]' : 'border-[#d9c9a3]/45'
      }`}
      animate={
        lit
          ? { y: [0, -10, 0], boxShadow: '0 0 28px 6px rgba(247,233,168,0.85)' }
          : { y: 0, boxShadow: char ? '0 0 16px 2px rgba(247,233,168,0.45)' : '0 0 0 0 rgba(247,233,168,0)' }
      }
      transition={lit ? { duration: 0.5, delay: index * 0.07 } : { duration: 0.3 }}
    >
      {char ? (
        <motion.span
          key={char}
          className="font-display text-3xl text-[#fff6cf]"
          initial={{ opacity: 0, scale: 2.2, filter: 'blur(8px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        >
          {char}
        </motion.span>
      ) : (
        active && <span className="h-7 w-px animate-pulse bg-[#f7e9a8]" />
      )}
    </motion.span>
  )
}
