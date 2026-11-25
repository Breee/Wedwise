import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
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
// What a guest does to open a link that carries its code.
const PLAYS = ['light', 'fireflies', 'lantern', 'stars', 'seal', 'ribbon'] as const
type Play = (typeof PLAYS)[number]
const NIGHT_PLAYS: Play[] = ['fireflies', 'lantern', 'stars']
const GLOW = 'bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_18%,rgba(247,233,168,0.35)_34%,rgba(247,233,168,0)_62%)]'

export const Route = createFileRoute('/join-us')({
  validateSearch: (s: Record<string, unknown>): { code?: string; look?: 'night' | 'envelope'; play?: Play } => ({
    ...(typeof s.code === 'string' ? { code: s.code } : {}),
    ...(s.look === 'night' || s.look === 'envelope' ? { look: s.look } : {}),
    ...(PLAYS.includes(s.play as Play) ? { play: s.play as Play } : {}),
  }),
  component: JoinPage,
})

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH)

function JoinPage() {
  const navigate = useNavigate()
  const { code: given, look, play } = Route.useSearch()
  const { data } = useQuery(publicContentQuery)
  const deco = data?.theme?.decoration as SceneVariant | undefined
  const [code, setCode] = useState(() => clean(given ?? ''))
  const [focused, setFocused] = useState(false)
  // A link that carries the code needs no typing: one tap opens the invitation.
  const [direct, setDirect] = useState(() => clean(given ?? '').length === LENGTH)
  const [tapped, setTapped] = useState(false)
  const row = useAnimationControls()
  // ?look= overrides the setting, to try out the other look.
  const envelope = (look ?? data?.content.inviteOpening) === 'envelope'
  const still = useReducedMotion() ?? false
  // ?play= picks the way to open; reduced motion always gets the single tap.
  const game: Play = envelope ? (play === 'ribbon' && !still ? 'ribbon' : 'seal') : play && NIGHT_PLAYS.includes(play) && !still ? play : 'light'
  const playing = direct && !tapped && game !== 'light' && game !== 'seal'
  const finish = useCallback(() => setTapped(true), [])
  // Nobody gets stuck on a game: the plain way in shows up after a while.
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => setLate(true), 8000)
    return () => clearTimeout(timer)
  }, [playing])

  const open = useMutation({
    mutationFn: (value: string) => api.post<{ link: string }>('/rsvp/code', { code: value }),
    onError: () => {
      setDirect(false)
      setCode('')
      row.start({ x: [0, -12, 12, -8, 8, 0], transition: { duration: 0.45 } })
    },
  })

  const submit = open.mutate
  useEffect(() => {
    if (code.length === LENGTH) submit(code)
  }, [code, submit])

  const opened = open.isSuccess && (!direct || tapped)
  const busy = open.isPending || open.isSuccess
  const link = open.data?.link

  // The light fills the screen before the invitation takes over.
  useEffect(() => {
    if (!opened || !link) return
    const wait = envelope ? (still ? 700 : direct ? 2700 : 3300) : direct ? 2400 : 1500
    const timer = setTimeout(() => navigate({ to: '/rsvp/$link', params: { link }, replace: true }), wait)
    return () => clearTimeout(timer)
  }, [opened, link, envelope, still, direct, navigate])

  const hint = open.isError
    ? open.error instanceof ApiError && open.error.status === 429
      ? t('Zu viele Versuche. Bitte wartet einen Moment.')
      : t('Dieser Code passt nicht.')
    : direct
    ? !tapped &&
      {
        light: t('Tippt auf das Licht'),
        fireflies: t('Fangt die drei Glühwürmchen'),
        lantern: t('Haltet die Laterne, bis sie leuchtet'),
        stars: t('Verbindet die drei Sterne'),
        seal: t('Brecht das Siegel'),
        ribbon: t('Zieht an der Schleife'),
      }[game]
    : !opened && t('Ihr findet ihn auf eurer Einladung.')
  const tap = (
    <button
      type="button"
      autoFocus
      aria-label={t('Einladung öffnen')}
      aria-describedby="join-hint"
      onClick={finish}
      className="absolute inset-0 z-50 size-full cursor-pointer rounded-lg"
    />
  )
  const skip = playing && (
    <button
      type="button"
      onClick={finish}
      className={`relative z-50 mx-auto block px-4 py-3 text-sm underline underline-offset-4 transition-opacity duration-700 ${
        late ? 'opacity-80' : 'pointer-events-none opacity-0 focus-visible:opacity-100'
      }`}
    >
      {t('Einfach öffnen')}
    </button>
  )
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
            {direct ? t('Ihr seid eingeladen') : t('Euer Code')}
          </motion.h1>
          <p id="join-hint" className={`mt-2 h-10 text-sm ${open.isError ? 'text-destructive' : 'text-muted-foreground'}`} role="status">
            {hint}
          </p>
          <Envelope code={code} plain={direct} active={focused && !busy} opened={opened} still={still} shake={row}>
            {!direct ? field : game === 'ribbon' ? <Ribbon gone={tapped} onDone={finish} /> : tap}
          </Envelope>
          <div className="mt-4">{skip}</div>
        </div>
        {opened && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: still ? 0.3 : direct ? 2.2 : 2.8 }}
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
        {!direct && (
          <>
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
          </>
        )}

        <p id="join-hint" className={direct && game === 'light' ? 'absolute inset-x-0 top-[calc(38svh+8.5rem)] text-base' : 'mt-6 h-12 text-base'} role="status">
          {hint}
        </p>
      </div>

      {direct && game === 'fireflies' && <Fireflies onDone={finish} />}
      {direct && game === 'lantern' && <Lantern onDone={finish} />}
      {direct && game === 'stars' && <Stars onDone={finish} />}
      <div className="absolute inset-x-0 bottom-[6svh]">{skip}</div>

      {direct && game === 'light' && (
        <motion.button
          type="button"
          autoFocus
          aria-label={t('Einladung öffnen')}
          aria-describedby="join-hint"
          onClick={finish}
          className="absolute top-[38svh] left-1/2 size-24 -translate-x-1/2 cursor-pointer rounded-full bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_30%,rgba(247,233,168,0)_70%)] outline-none focus-visible:ring-2 focus-visible:ring-[#f7e9a8]"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={still ? { opacity: 0.9, scale: 1 } : { opacity: [0.6, 1, 0.6], scale: [1, 1.14, 1] }}
          transition={still ? { duration: 0.6 } : { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {opened && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-[38svh] left-1/2 size-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_35%,rgba(247,233,168,0)_70%)]"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 40, opacity: [0, 1, 1] }}
          transition={direct ? { duration: 2.2, ease: 'easeInOut' } : { duration: 1.3, delay: 0.5, ease: 'easeIn' }}
        />
      )}
    </div>
  )
}

// Three fireflies drift about. A ring around each shows where to tap; each
// one caught flies into the jar, which glows a little more.
const FLIES = [
  { left: '22%', top: '30svh', x: [0, 26, -18, 10, 0], y: [0, -20, 12, 24, 0], time: 9, rest: [-13, 10] },
  { left: '78%', top: '58svh', x: [0, -24, 14, -8, 0], y: [0, 18, -22, 8, 0], time: 11, rest: [12, 2] },
  { left: '30%', top: '72svh', x: [0, 20, 30, -12, 0], y: [0, -16, 10, -24, 0], time: 10, rest: [-1, 26] },
]

function Fireflies({ onDone }: { onDone: () => void }) {
  const [caught, setCaught] = useState<number[]>([])
  const full = caught.length === FLIES.length
  useEffect(() => {
    if (!full) return
    const timer = setTimeout(onDone, 1100)
    return () => clearTimeout(timer)
  }, [full, onDone])
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute top-[44svh] left-1/2 h-32 w-24 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className={`absolute -inset-10 rounded-full ${GLOW}`}
          animate={{ opacity: full ? 1 : caught.length * 0.22, scale: full ? 1.5 : 1 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
        <motion.svg
          viewBox="0 0 96 128"
          className="absolute inset-0 size-full fill-none stroke-[#ecdcb0] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]"
          initial={{ opacity: 0 }}
          animate={{ opacity: full ? 0 : 0.75 }}
          transition={{ duration: 1, delay: full ? 0.5 : 0.4 }}
        >
          <rect x="26" y="4" width="44" height="12" rx="3" />
          <path d="M30 16v8C18 30 12 38 12 50v56c0 10 7 18 18 18h36c11 0 18-8 18-18V50c0-12-6-20-18-26v-8" />
          <path d="M22 54v40" opacity="0.5" />
        </motion.svg>
        <div className="absolute inset-x-0 -bottom-8 flex justify-center gap-2">
          {FLIES.map((_, i) => (
            <motion.span
              key={i}
              className="size-2 rounded-full border border-[#ecdcb0]"
              animate={{ backgroundColor: i < caught.length ? '#f7e9a8' : 'rgba(247,233,168,0)', scale: i < caught.length ? [1, 1.6, 1] : 1, opacity: full ? 0 : 1 }}
              transition={{ duration: 0.5 }}
            />
          ))}
        </div>
      </div>
      {FLIES.map((fly, i) => {
        const got = caught.includes(i)
        return (
          <motion.div
            key={i}
            aria-hidden
            className="absolute size-20 -translate-x-1/2 -translate-y-1/2"
            initial={{ left: fly.left, top: fly.top, opacity: 0 }}
            animate={{ left: got ? '50%' : fly.left, top: got ? '44svh' : fly.top, opacity: 1 }}
            transition={{ left: { duration: 0.9, ease: EASE }, top: { duration: 0.9, ease: EASE }, opacity: { duration: 1.2, delay: 0.5 + i * 0.3 } }}
          >
            <motion.button
              type="button"
              tabIndex={-1}
              data-fly={got ? 'caught' : 'free'}
              className={`relative block size-full touch-manipulation outline-none ${got ? 'pointer-events-none' : 'cursor-pointer'}`}
              animate={got ? { x: fly.rest[0], y: fly.rest[1] } : { x: fly.x, y: fly.y }}
              transition={got ? { duration: 0.9, ease: EASE } : { duration: fly.time, repeat: Infinity, ease: 'easeInOut' }}
              onPointerDown={() => setCaught((c) => (c.includes(i) ? c : [...c, i]))}
            >
              <motion.span
                className={`absolute inset-0 rounded-full ${GLOW}`}
                animate={got ? { scale: 0.45, opacity: [1, 0.7, 1] } : { scale: 1, opacity: [0.6, 1, 0.75, 1, 0.6] }}
                transition={got ? { scale: { duration: 0.9, ease: EASE }, opacity: { duration: 2.4, repeat: Infinity } } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              />
              {got ? (
                <motion.span
                  className="absolute inset-2 rounded-full border-2 border-[#f7e9a8]"
                  initial={{ scale: 0.5, opacity: 0.9 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              ) : (
                <motion.span
                  className="absolute inset-2 rounded-full border border-[#f7e9a8]"
                  animate={{ scale: [0.45, 1.15], opacity: [0.8, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.9, delay: 1.5 + i * 0.6, ease: 'easeOut' }}
                />
              )}
            </motion.button>
          </motion.div>
        )
      })}
    </>
  )
}

// A dark lantern that brightens for as long as a finger rests on it.
const HOLD = 1600

function Lantern({ onDone }: { onDone: () => void }) {
  const [held, setHeld] = useState(false)
  const [lit, setLit] = useState(false)
  useEffect(() => {
    if (!held || lit) return
    const timer = setTimeout(() => {
      setLit(true)
      onDone()
    }, HOLD)
    return () => clearTimeout(timer)
  }, [held, lit, onDone])
  const on = held || lit
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-lantern={lit ? 'lit' : 'dark'}
      className="absolute top-[36svh] left-1/2 flex h-44 w-28 -translate-x-1/2 cursor-pointer touch-none flex-col items-center outline-none select-none [-webkit-touch-callout:none]"
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <motion.span
        className={`pointer-events-none absolute -inset-12 rounded-full ${GLOW}`}
        initial={false}
        animate={{ opacity: on ? 0.9 : 0, scale: on ? 1 : 0.6 }}
        transition={{ duration: on ? HOLD / 1000 : 0.4, ease: 'linear' }}
      />
      <span className="size-6 rounded-full border-2 border-[#d9c9a3]/70" />
      <span className="-mt-1 h-3 w-16 rounded-t-md bg-[#d9c9a3]/70" />
      <span className="relative w-20 flex-1 overflow-hidden rounded-b-xl border-2 border-t-0 border-[#d9c9a3]/70 bg-black/45">
        <motion.span
          className="absolute inset-0 bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_45%,rgba(247,233,168,0.25)_100%)]"
          initial={false}
          animate={{ opacity: on ? 1 : 0.1 }}
          transition={{ duration: on ? HOLD / 1000 : 0.4, ease: 'linear' }}
        />
      </span>
      <span className="h-2 w-24 rounded-sm bg-[#d9c9a3]/70" />
    </button>
  )
}

// Three stars to join with a finger, by dragging through them or tapping each.
const STARS = [
  { x: 26, y: 38 },
  { x: 72, y: 46 },
  { x: 44, y: 64 },
]

function Stars({ onDone }: { onDone: () => void }) {
  const stage = useRef<HTMLDivElement>(null)
  const [joined, setJoined] = useState<number[]>([])
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const done = joined.length === STARS.length
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(onDone, 800)
    return () => clearTimeout(timer)
  }, [done, onDone])
  const touch = (e: PointerEvent) => {
    const box = stage.current!.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    setAt({ x: (x / box.width) * 100, y: (y / box.height) * 100 })
    const hit = STARS.findIndex((s) => Math.hypot((s.x / 100) * box.width - x, (s.y / 100) * box.height - y) < 40)
    if (hit >= 0) setJoined((j) => (j.includes(hit) ? j : [...j, hit]))
  }
  const path = joined.map((i) => STARS[i])
  if (done) path.push(path[0])
  else if (at && path.length) path.push(at)
  return (
    <div
      ref={stage}
      aria-hidden
      className="absolute inset-0 cursor-pointer touch-none select-none"
      onPointerDown={touch}
      onPointerMove={(e) => at && touch(e)}
      onPointerUp={() => setAt(null)}
      onPointerCancel={() => setAt(null)}
    >
      <svg className="absolute inset-0 size-full">
        {path.slice(1).map((to, i) => (
          <line key={i} x1={`${path[i].x}%`} y1={`${path[i].y}%`} x2={`${to.x}%`} y2={`${to.y}%`} stroke="#f7e9a8" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
        ))}
      </svg>
      {STARS.map((star, i) => {
        const on = joined.includes(i)
        return (
          <motion.span
            key={i}
            data-star={on ? 'joined' : 'free'}
            className={`absolute size-16 -translate-x-1/2 -translate-y-1/2 rounded-full ${GLOW}`}
            style={{ left: `${star.x}%`, top: `${star.y}%` }}
            animate={on ? { scale: 1.3, opacity: 1 } : { scale: [0.7, 0.9, 0.7], opacity: [0.6, 1, 0.6] }}
            transition={on ? { duration: 0.4 } : { duration: 3 + i * 0.7, repeat: Infinity, ease: 'easeInOut' }}
          />
        )
      })}
    </div>
  )
}

// A ribbon tied around the envelope; pulling the bow undoes it.
function Ribbon({ gone, onDone }: { gone: boolean; onDone: () => void }) {
  const band = { background: 'var(--gold)' }
  const loop = { borderColor: 'var(--gold)' }
  return (
    <>
      <motion.span aria-hidden className="absolute inset-y-0 left-1/2 z-[35] -ml-2.5 w-5 shadow-sm" style={band} animate={{ scaleY: gone ? 0 : 1, opacity: gone ? 0 : 1 }} transition={{ duration: 0.5 }} />
      <motion.span aria-hidden className="absolute inset-x-0 top-[88%] z-[35] -mt-2.5 h-5 shadow-sm" style={band} animate={{ scaleX: gone ? 0 : 1, opacity: gone ? 0 : 1 }} transition={{ duration: 0.5 }} />
      <motion.button
        type="button"
        tabIndex={-1}
        aria-hidden
        data-bow
        drag={!gone}
        dragSnapToOrigin
        onDrag={(_, info) => {
          if (Math.hypot(info.offset.x, info.offset.y) > 70) onDone()
        }}
        className="absolute top-[88%] left-1/2 z-50 -mt-8 -ml-14 h-16 w-28 cursor-grab touch-none outline-none active:cursor-grabbing"
        animate={{ opacity: gone ? 0 : 1 }}
        transition={{ duration: 0.4 }}
      >
        <span className="absolute top-2 left-1 h-11 w-14 -rotate-12 rounded-[50%] border-[7px]" style={loop} />
        <span className="absolute top-2 right-1 h-11 w-14 rotate-12 rounded-[50%] border-[7px]" style={loop} />
        <span className="absolute top-1/2 left-1/2 -mt-3.5 -ml-3.5 size-7 rounded-md shadow-sm" style={band} />
      </motion.button>
    </>
  )
}

const PAPER = 'color-mix(in oklab, var(--gold) 22%, var(--card))'
const FLAP = 'color-mix(in oklab, var(--gold) 34%, var(--card))'

// The seal is the lock: each character of the code is stamped into a notch on
// its ring, which turns one step. The full code spins the ring and the seal
// breaks.
const SWEEP = 0.7
const LINING = 'color-mix(in oklab, var(--primary) 16%, var(--card))'
// Wax: pressed in at the rim, with a soft shine from the upper left.
const WAX =
  'relative block size-full rounded-full bg-primary text-primary-foreground ring-2 ring-primary-foreground/25 ring-inset shadow-[inset_0_3px_6px_rgba(255,255,255,0.22),inset_0_-6px_10px_rgba(0,0,0,0.28)]'
const GLOSS = (
  <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_26%,rgba(255,255,255,0.3),rgba(255,255,255,0)_45%)]" />
)
const STEP = 360 / LENGTH

function Dial({ code, plain, active, opened, still }: { code: string; plain: boolean; active: boolean; opened: boolean; still: boolean }) {
  // A link that carries the code leaves a plain seal, which a tap breaks.
  if (plain) {
    return (
      <span className={WAX}>
        {GLOSS}
        <span className="absolute inset-4 rounded-full ring-1 ring-primary-foreground/30" />
        <Heart className="absolute top-1/2 left-1/2 -mt-5 -ml-5 size-10 fill-current" />
      </span>
    )
  }
  const turn = opened ? -720 : -code.length * STEP
  const spin = still
    ? { duration: 0 }
    : opened
    ? { duration: SWEEP, ease: 'easeInOut' as const }
    : { type: 'spring' as const, stiffness: 260, damping: 22 }
  return (
    <span className={WAX}>
      {GLOSS}
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
  plain,
  active,
  opened,
  still,
  shake,
  children,
}: {
  code: string
  plain: boolean
  active: boolean
  opened: boolean
  still: boolean
  shake: ReturnType<typeof useAnimationControls>
  children: ReactNode
}) {
  const move = opened && !still
  const sweep = plain ? 0 : SWEEP
  const drop = {
    animate: move ? { y: '140%', opacity: 0 } : { y: '0%', opacity: 1 },
    transition: { duration: 0.6, delay: sweep + 1.7, ease: 'easeIn' as const },
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
        animate={move ? { y: ['0%', '-40%', '-40%', '0%'], scale: [1, 1, 1, 6] } : { y: '0%', scale: 1 }}
        transition={{ duration: 1.6, times: [0, 0.5, 0.62, 1], delay: sweep + 1, ease: [EASE, 'linear', 'easeIn'] }}
      >
        <motion.span
          className="flex flex-col items-center gap-3"
          animate={{ opacity: move ? 0 : 1 }}
          transition={{ duration: 0.3, delay: sweep + 1.9 }}
        >
          <span className="font-display text-xl">{t('Ihr seid eingeladen')}</span>
          <Heart className="size-4 fill-current text-primary" />
        </motion.span>
      </motion.div>
      <motion.div
        aria-hidden
        className="absolute inset-0 z-20 rounded-lg"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, black 7%, ${PAPER}), ${PAPER} 55%)`,
          clipPath: 'polygon(0 0, 50% 55%, 100% 0, 100% 100%, 0 100%)',
        }}
        {...drop}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full fill-none stroke-black/10">
          <path d="M0 100 50 55 100 100" vectorEffect="non-scaling-stroke" />
        </svg>
      </motion.div>
      {/* The flap is edge-on halfway through, which hides its move behind the card. */}
      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[55%] [perspective:900px]"
        style={{ zIndex: move ? 5 : 30, transition: `z-index 0s ${sweep + 0.8}s` }}
        {...drop}
      >
        <motion.div
          className="size-full origin-top"
          animate={{
            rotateX: move ? 180 : 0,
            filter: move ? 'drop-shadow(0 0 0 rgba(0,0,0,0))' : 'drop-shadow(0 3px 4px rgba(0,0,0,0.2))',
          }}
          transition={{ duration: 0.7, delay: sweep + 0.45, ease: 'easeInOut' }}
        >
          <div
            className="size-full rounded-t-lg"
            style={{
              background: move ? LINING : FLAP,
              clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
              transition: `background 0s ${sweep + 0.8}s`,
            }}
          />
        </motion.div>
      </motion.div>
      <motion.div aria-hidden className="absolute top-[55%] left-1/2 z-40 -mt-[76px] -ml-[76px] size-[152px]" animate={shake}>
        {plain && !opened && !still && (
          <motion.span
            className="absolute inset-1 rounded-full border-2 border-primary"
            animate={{ scale: [1, 1.4], opacity: [0.55, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.9, delay: 1.2, ease: 'easeOut' }}
          />
        )}
        <motion.div
          className="relative size-full [filter:drop-shadow(0_3px_5px_rgba(0,0,0,0.35))]"
          animate={move ? { scale: [1, 0.92, 1] } : { scale: 1 }}
          transition={{ duration: 0.25, delay: sweep }}
        >
          {[0, 1].map((side) => (
            <motion.span
              key={side}
              className="absolute inset-0"
              style={{ clipPath: side ? 'polygon(52% 0, 100% 0, 100% 100%, 46% 100%, 56% 60%, 44% 40%)' : 'polygon(0 0, 52% 0, 44% 40%, 56% 60%, 46% 100%, 0 100%)' }}
              // The seal cracks apart first, then the halves fall.
              animate={
                opened
                  ? { x: [0, side ? 5 : -5, side ? 30 : -30], y: [0, 0, 90], rotate: [0, side ? 4 : -4, side ? 28 : -28], opacity: [1, 1, 0] }
                  : { x: 0, y: 0, rotate: 0, opacity: 1 }
              }
              transition={still ? { duration: 0 } : { duration: 0.7, times: [0, 0.3, 1], delay: opened ? sweep + 0.1 : 0, ease: 'easeIn' }}
            >
              <Dial code={code} plain={plain} active={active} opened={opened} still={still} />
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
