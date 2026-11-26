import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { Heart } from 'lucide-react'
import { ApiError, api } from '@/lib/api'
import { inviteLinkQuery, publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'
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
  const input = useRef<HTMLInputElement>(null)
  // ?look= overrides the setting, to try out the other look.
  const envelope = (look ?? data?.content.inviteOpening) === 'envelope'
  const still = useReducedMotion() ?? false
  // ?play= picks the way to open; reduced motion always gets the single tap.
  const game: Play = envelope ? (play === 'ribbon' && !still ? 'ribbon' : 'seal') : still || play === 'light' ? 'light' : play && NIGHT_PLAYS.includes(play) ? play : 'lantern'
  const playing = direct && !tapped && (game === 'fireflies' || game === 'stars' || game === 'ribbon')
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
  const flies = game === 'fireflies' && direct
  const guest = useQuery({ ...inviteLinkQuery(link ?? ''), enabled: flies && !!link }).data?.name
  const names = data?.event.couple?.map((c) => c.name).join(' & ') || data?.event.title

  // The light fills the screen before the invitation takes over.
  useEffect(() => {
    if (!opened || !link) return
    const wait = envelope ? (still ? 700 : direct ? 2700 : 3300) : game === 'lantern' ? 4300 : flies ? 6400 : direct ? 2400 : 1500
    // The keyboard goes away so the lantern can be seen rising.
    if (game === 'lantern') input.current?.blur()
    const timer = setTimeout(() => navigate({ to: '/rsvp/$link', params: { link }, replace: true, state: { lit: flies } }), wait)
    return () => clearTimeout(timer)
  }, [opened, link, envelope, still, direct, game, navigate])

  const hint = open.isError
    ? open.error instanceof ApiError && open.error.status === 429
      ? t('Zu viele Versuche. Bitte wartet einen Moment.')
      : t('Dieser Code passt nicht.')
    : direct
    ? !tapped &&
      {
        light: t('Tippt auf das Licht'),
        fireflies: t('Es ist endlich so weit'),
        lantern: t('Zündet die Laterne an'),
        stars: t('Verbindet die drei Sterne'),
        seal: t('Brecht das Siegel'),
        ribbon: t('Zieht an der Schleife'),
      }[game]
    : !opened && t('Ihr findet ihn auf eurer Einladung.')
  const tap = (
    <button
      type="button"
      aria-label={t('Einladung öffnen')}
      aria-describedby="join-hint"
      onClick={finish}
      className="absolute inset-0 z-50 size-full cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
  const skip = playing && (
    <button
      type="button"
      onClick={finish}
      className={`relative z-50 mx-auto block rounded-full border border-current/30 px-5 py-2.5 text-xs font-medium tracking-[0.25em] uppercase outline-none transition-opacity duration-700 focus-visible:ring-2 focus-visible:ring-current ${
        late && !flies ? 'opacity-70' : 'pointer-events-none opacity-0 focus-visible:opacity-100'
      }`}
    >
      {t('Einfach öffnen')}
    </button>
  )
  const field = (
    <input
      ref={input}
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
          <Envelope code={code} plain={direct} bare={direct && game === 'ribbon'} active={focused && !busy} opened={opened} still={still} shake={row}>
            {!direct ? field : game === 'ribbon' ? <Ribbon gone={tapped} onDone={finish} /> : !tapped && tap}
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

  const lantern = game === 'lantern'
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#121c17] text-[#f4efe2]">
      {/* Growing from the top edge, the picture moves up into the sky with the lantern. */}
      <motion.div
        className="absolute inset-0 origin-top"
        initial={false}
        animate={{ scale: lantern && opened ? 1.7 : 1 }}
        transition={{ duration: 2.8, delay: 0.9, ease: 'easeInOut' }}
      >
        <DuskScene variant={deco && SCENES.includes(deco) ? deco : 'night'} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
      </motion.div>
      <motion.div
        className="relative mx-auto max-w-xl px-6 pt-[14svh] text-center [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]"
        initial={false}
        animate={{ opacity: (lantern || flies) && opened ? 0 : 1 }}
        transition={{ duration: 0.8 }}
      >
        {!flies && (
          <motion.p
            className="text-sm font-medium text-[#ecdcb0] uppercase"
            initial={{ opacity: 0, letterSpacing: '0.1em' }}
            animate={{ opacity: 1, letterSpacing: '0.45em' }}
            transition={{ duration: 1.6, ease: EASE }}
          >
            {t('Ihr seid eingeladen')}
          </motion.p>
        )}
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

        <p
          id="join-hint"
          className={direct && game === 'light' ? 'absolute inset-x-0 top-[calc(38svh+8.5rem)] text-base' : flies ? 'font-display text-3xl text-balance' : 'mt-6 h-12 text-base'}
          role="status"
        >
          {hint}
        </p>
      </motion.div>

      {lantern && <SkyLantern lit={opened} onTap={direct && !tapped ? finish : undefined} />}
      {lantern && !direct && <Candles count={code.length} gone={opened} />}
      {flies && <Fireflies opened={opened} guest={guest} names={names} onDone={finish} />}
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

      {opened && !lantern && !flies && (
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

// Fireflies drift over the lake as points of light. A finger on the screen
// draws them in and they follow it; once most are gathered they rise,
// multiply and settle into the couple's names, which then become the real
// lettering of the invitation.
const SWARM = 28
const REVEAL = 3400

type Mote = {
  x: number
  y: number
  vx: number
  vy: number
  turn: number
  phase: number
  pace: number
  size: number
  held: boolean
  orbit: number
  spin: number
  tx: number
  ty: number
  wait: number
}

function lightSprite() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const c = canvas.getContext('2d')!
  const fill = c.createRadialGradient(32, 32, 0, 32, 32, 32)
  fill.addColorStop(0, 'rgba(255,252,232,1)')
  fill.addColorStop(0.07, 'rgba(255,241,176,0.9)')
  fill.addColorStop(0.22, 'rgba(255,206,98,0.22)')
  fill.addColorStop(1, 'rgba(255,190,70,0)')
  c.fillStyle = fill
  c.fillRect(0, 0, 64, 64)
  return canvas
}

// Where the lettering of an element sits, as points relative to the box.
function letterPoints(el: HTMLElement, box: DOMRect, most: number) {
  const node = el.firstChild
  if (!node || node.nodeType !== Node.TEXT_NODE) return []
  const text = node.textContent ?? ''
  const style = getComputedStyle(el)
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(box.width)
  canvas.height = Math.ceil(box.height)
  const c = canvas.getContext('2d', { willReadFrequently: true })!
  c.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  c.fillStyle = '#fff'
  const metrics = c.measureText('Hg')
  const up = metrics.fontBoundingBoxAscent
  const down = metrics.fontBoundingBoxDescent
  const range = document.createRange()
  for (let i = 0; i < text.length; i++) {
    range.setStart(node, i)
    range.setEnd(node, i + 1)
    const r = range.getBoundingClientRect()
    if (r.width) c.fillText(text[i], r.left - box.left, r.top - box.top + (r.height - up - down) / 2 + up)
  }
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data
  const points: [number, number][] = []
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 120) points.push([x + Math.random(), y + Math.random()])
    }
  }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[points[i], points[j]] = [points[j], points[i]]
  }
  return points.slice(0, most)
}

function Fireflies({ opened, guest, names, onDone }: { opened: boolean; guest?: string; names?: string; onDone: () => void }) {
  const { data } = useQuery(publicContentQuery)
  const date = data?.event.date
  const venue = data?.content.location?.name
  const canvas = useRef<HTMLCanvasElement>(null)
  const lettering = useRef<HTMLParagraphElement>(null)
  const motes = useRef<Mote[]>([])
  const finger = useRef({ x: 0, y: 0, down: false, since: 0, fromX: 0, fromY: 0, all: false, used: false })
  const form = useRef<{ at: number; x: number; y: number } | null>(null)
  const done = useRef(onDone)
  const count = useRef(0)
  done.current = onDone
  const [shown, setShown] = useState(false)
  // Whoever waits is told where to tap.
  const [nudge, setNudge] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setNudge(!finger.current.used), 4000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const c = el.getContext('2d')!
    const sprite = lightSprite()
    let width = 0
    let height = 0
    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = el.clientWidth
      height = el.clientHeight
      el.width = width * ratio
      el.height = height * ratio
      c.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    fit()
    const watch = new ResizeObserver(fit)
    watch.observe(el)
    motes.current = Array.from({ length: SWARM }, (_, i) => ({
      // A few already circle the light in the middle.
      x: i < 4 ? width / 2 : width * (0.06 + Math.random() * 0.88),
      y: i < 4 ? height / 2 : height * (0.3 + Math.random() * 0.56),
      vx: 0,
      vy: 0,
      turn: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      pace: 0.5 + Math.random() * 0.7,
      size: 1 + Math.random() * 1.1,
      held: i < 4,
      orbit: 14 + (i % 9) * 7,
      spin: (i % 2 ? 1 : -1) * (0.4 + Math.random() * 0.5),
      tx: 0,
      ty: 0,
      wait: 0,
    }))

    let frame = 0
    let last = performance.now()
    let full = false
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const time = now / 1000
      const hand = finger.current
      const shape = form.current
      const since = shape ? (now - shape.at) / 1000 : 0

      // Fading the last frame instead of clearing it leaves a short trail.
      c.globalCompositeOperation = 'destination-out'
      c.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt * 13)})`
      c.fillRect(0, 0, width, height)
      c.globalCompositeOperation = 'lighter'

      const reach = hand.all ? Infinity : hand.down ? Math.min(130 + ((now - hand.since) / 1000) * 70, 280) : 0
      // Caught lights gather in the middle of the picture.
      const midX = width / 2
      const midY = height * 0.5
      // The light to tap: it breathes, and goes out as the names form.
      const lamp = shape ? Math.max(0, 1 - since / 1.2) : 1
      if (lamp) {
        const breath = Math.sin(time * 1.3)
        c.globalAlpha = (0.5 + 0.12 * breath) * lamp
        c.drawImage(sprite, midX - 40 - 5 * breath, midY - 40 - 5 * breath, 80 + 10 * breath, 80 + 10 * breath)
        c.globalAlpha = 0.12 * lamp
        c.drawImage(sprite, midX - 110, midY - 110, 220, 220)
      }
      let held = 0
      const swell = 0.35 + 0.65 * (count.current / SWARM)
      for (const m of motes.current) {
        let alpha: number
        let radius: number
        if (shape) {
          const age = since - m.wait
          if (age < 0) continue
          const pull = 5 + 27 * Math.min(1, age / 2.4) ** 2
          const loose = 36 * Math.max(0, 1 - age / 2)
          m.vx += ((m.tx - m.x) * pull - m.vx * Math.sqrt(pull) * 1.5 + Math.cos(m.phase + time * 3) * loose) * dt
          m.vy += ((m.ty - m.y) * pull - m.vy * Math.sqrt(pull) * 1.5 + Math.sin(m.phase * 1.7 + time * 3) * loose) * dt
          // The lights dim while the lettering comes up underneath them.
          const fade = Math.max(0, 1 - Math.max(0, since - REVEAL / 1000 + 0.2) / 2.2)
          alpha = (0.45 + 0.2 * Math.sin(time * 4 + m.phase)) * fade * Math.min(1, age / 0.7)
          m.size += (0.75 - m.size) * Math.min(1, dt * 2)
          radius = 1 + m.size * 2.4
        } else {
          const dx = (hand.all ? midX : hand.x) - m.x
          const dy = (hand.all ? midY : hand.y) - m.y
          const far = Math.hypot(dx, dy)
          if (!m.held && hand.used && far < reach) {
            const pull = hand.all ? 500 : 700 * (1 - far / reach) + 120
            m.vx += (dx / (far || 1)) * pull * dt
            m.vy += (dy / (far || 1)) * pull * dt
            if (far < 46) m.held = true
          }
          if (m.held) {
            const angle = time * m.spin + m.phase
            m.vx += ((midX + Math.cos(angle) * m.orbit * swell - m.x) * 14 - m.vx * 6) * dt
            m.vy += ((midY + Math.sin(angle) * m.orbit * 0.8 * swell - m.y) * 14 - m.vy * 6) * dt
            held++
          } else {
            m.turn += (Math.random() - 0.5) * 1.5 * dt
            m.vx += Math.cos(m.turn) * 9 * dt
            m.vy += Math.sin(m.turn) * 9 * dt
            // Kept over the lake and the shore, away from the edges.
            if (m.x < width * 0.05) m.vx += 40 * dt
            if (m.x > width * 0.95) m.vx -= 40 * dt
            if (m.y < height * 0.28) m.vy += 40 * dt
            if (m.y > height * 0.88) m.vy -= 40 * dt
            const drag = Math.exp(-dt * (far < reach && hand.used ? 2.5 : 0.7))
            m.vx *= drag
            m.vy *= drag
          }
          const blink = Math.max(0, Math.sin(time * m.pace + m.phase))
          alpha = m.held ? 0.5 + 0.2 * blink : 0.1 + 0.9 * blink * blink
          radius = m.size * (m.held ? 5 : 7)
        }
        m.x += m.vx * dt
        m.y += m.vy * dt
        if (alpha <= 0.01) continue
        c.globalAlpha = alpha
        c.drawImage(sprite, m.x - radius, m.y - radius, radius * 2, radius * 2)
        if (!shape && m.y < height * 0.66) {
          // A faint streak on the water below each light.
          const below = height * 0.7 + (height * 0.66 - m.y) * 0.22
          c.globalAlpha = alpha * (m.held ? 0.05 : 0.14)
          c.drawImage(sprite, m.x - radius * 0.8, below - radius * 2.2, radius * 1.6, radius * 4.4)
        }
      }

      // The gathered light warms the scene around it.
      if (!shape && held) {
        const glow = 40 + held * 3.5
        c.globalAlpha = 0.08 + 0.14 * (held / SWARM)
        c.drawImage(sprite, midX - glow, midY - glow, glow * 2, glow * 2)
        count.current = held
      } else if (shape && since < 2) {
        // It drifts up to where the names form, and thins out.
        const ease = 1 - (1 - since / 2) ** 2
        const glow = (40 + count.current * 3.5) * (1 + ease)
        c.globalAlpha = (0.08 + 0.14 * (count.current / SWARM)) * (1 - ease)
        c.drawImage(sprite, midX + (shape.x - midX) * ease - glow, midY + (shape.y - midY) * ease - glow, glow * 2, glow * 2)
      }
      c.globalAlpha = 1

      if (!shape && !full && held >= SWARM * 0.7) {
        full = true
        hand.all = true
        setTimeout(() => done.current(), 500)
      }
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      watch.disconnect()
    }
  }, [])

  // The lights leave the finger and take the shape of the names.
  useEffect(() => {
    if (!opened) return
    let timer = 0
    let gone = false
    document.fonts.ready.then(() => {
      const el = canvas.current
      const text = lettering.current
      if (gone || !el || !text) return
      const stage = el.getBoundingClientRect()
      const box = text.getBoundingClientRect()
      const points = letterPoints(text, box, stage.width < 640 ? 900 : 1500)
      const held = motes.current.filter((m) => m.held)
      const from = held.length
        ? { x: held.reduce((sum, m) => sum + m.x, 0) / held.length, y: held.reduce((sum, m) => sum + m.y, 0) / held.length }
        : { x: stage.width / 2, y: stage.height * 0.6 }
      const all = motes.current
      while (all.length < points.length) {
        const angle = Math.random() * Math.PI * 2
        const speed = 15 + Math.random() * 80
        all.push({
          x: from.x,
          y: from.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          turn: 0,
          phase: Math.random() * Math.PI * 2,
          pace: 1,
          size: 0.75,
          held: false,
          orbit: 0,
          spin: 0,
          tx: 0,
          ty: 0,
          wait: Math.random() * 1.6,
        })
      }
      all.forEach((m, i) => {
        const point = points[i % (points.length || 1)] ?? [box.width / 2, box.height / 2]
        m.tx = box.left - stage.left + point[0]
        m.ty = box.top - stage.top + point[1]
      })
      form.current = { at: performance.now(), x: box.left - stage.left + box.width / 2, y: box.top - stage.top + box.height / 2 }
      timer = window.setTimeout(() => setShown(true), REVEAL)
    })
    return () => {
      gone = true
      clearTimeout(timer)
    }
  }, [opened])

  const place = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    finger.current.x = e.clientX - box.left
    finger.current.y = e.clientY - box.top
  }

  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      {!opened && (
        <div
          aria-hidden
          className="absolute inset-0 touch-none"
          onPointerDown={(e) => {
            place(e)
            setNudge(false)
            Object.assign(finger.current, { down: true, used: true, since: performance.now(), fromX: e.clientX, fromY: e.clientY })
          }}
          onPointerMove={(e) => finger.current.down && place(e)}
          onPointerUp={(e) => {
            const hand = finger.current
            hand.down = false
            // A single tap is enough: every light comes to it.
            if (performance.now() - hand.since < 300 && Math.hypot(e.clientX - hand.fromX, e.clientY - hand.fromY) < 12) hand.all = true
          }}
          onPointerCancel={() => (finger.current.down = false)}
        />
      )}
      <motion.p
        className="pointer-events-none absolute inset-x-0 top-[calc(50svh+4.5rem)] text-center text-sm tracking-wide text-[#ecdcb0] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: nudge && !opened ? 0.9 : 0 }}
        transition={{ duration: 1.2 }}
      >
        {t('Tippt auf das Licht')}
      </motion.p>
      {/* Laid out like the first page of the invitation, so the lettering stays put when that page takes over. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="mx-auto flex min-h-svh max-w-xl flex-col px-6 pt-8 pb-4">
          <div className="flex flex-1 flex-col justify-center text-center [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]">
            <motion.div initial={false} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: 1.6, delay: 0.8 }}>
              {guest && <p className="mb-5 font-display text-3xl text-[#ecdcb0] text-balance">{t('Für {name}', { name: guest })}</p>}
              <p className="text-sm font-medium tracking-[0.45em] text-[#ecdcb0] uppercase">{t('Ihr seid eingeladen')}</p>
            </motion.div>
            <motion.p
              ref={lettering}
              className="mt-6 font-display text-5xl leading-tight text-balance md:text-7xl"
              initial={false}
              animate={{ opacity: shown ? 1 : 0, filter: shown ? 'blur(0px)' : 'blur(6px)' }}
              transition={{ duration: 2, ease: 'easeInOut' }}
            >
              {names}
            </motion.p>
            <div className="invisible" aria-hidden>
              <div className="my-6 h-px" />
              {date && <p className="font-display text-3xl">{formatDate(date)}</p>}
              {venue && <p className="mt-6 text-base font-medium tracking-[0.25em] uppercase">{venue}</p>}
            </div>
          </div>
          <div className="mt-6 min-h-12" />
        </div>
      </div>
    </>
  )
}

// A paper lantern at the water. Lit, it lifts off into the sky, more lanterns
// follow in the distance, and its light becomes the invitation.
const PAPER_LANTERN = 'M12 22C12 6 84 6 84 22L88 66C90 92 78 108 72 114L24 114C18 108 6 92 8 66Z'
const AWAY = [
  { left: '12%', size: 20, up: 46, delay: 0.5 },
  { left: '27%', size: 14, up: 38, delay: 0.1 },
  { left: '70%', size: 16, up: 42, delay: 0.3 },
  { left: '84%', size: 24, up: 50, delay: 0.7 },
  { left: '40%', size: 11, up: 34, delay: 0.9 },
  { left: '61%', size: 12, up: 36, delay: 1.1 },
]

function SkyLantern({ lit, onTap }: { lit: boolean; onTap?: () => void }) {
  return (
    <>
      {lit &&
        AWAY.map((l) => (
          <motion.span
            key={l.left}
            aria-hidden
            className="pointer-events-none absolute top-[66svh] rounded-[45%_45%_35%_35%] bg-[radial-gradient(circle_at_50%_85%,#fff6cf,#f3b25e_60%,#b9602a)] shadow-[0_0_14px_4px_rgba(243,178,94,0.45)]"
            style={{ left: l.left, width: l.size, height: l.size * 1.3 }}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 0.9, 0.9], y: `-${l.up}vh`, x: [0, 8, -4] }}
            transition={{ duration: 3.4, delay: 1 + l.delay, ease: 'easeOut' }}
          />
        ))}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-[calc(50svh+9rem)] left-1/2 -ml-8 h-20 w-16 rounded-full bg-[#f3b25e] blur-xl"
        initial={false}
        animate={lit ? { opacity: [0, 0.55, 0], y: [0, 0, 70] } : { opacity: 0, y: 0 }}
        transition={{ duration: 3.2, times: [0, 0.3, 1] }}
      />
      <motion.div
        className="absolute top-[50svh] left-1/2 -ml-12 h-32 w-24"
        initial={{ opacity: 0 }}
        animate={lit ? { opacity: 1, y: '-28vh', x: [0, 12, -6, 0], scale: 0.85 } : { opacity: 1, y: 0, x: 0, scale: 1 }}
        transition={lit ? { duration: 2.8, delay: 0.9, ease: 'easeInOut' } : { duration: 1.2, delay: 0.6 }}
      >
        <motion.span
          aria-hidden
          className={`pointer-events-none absolute -inset-16 rounded-full ${GLOW}`}
          initial={false}
          animate={lit ? { opacity: 1, scale: 1.1 } : onTap ? { opacity: [0.15, 0.4, 0.15], scale: 1 } : { opacity: 0.12, scale: 1 }}
          transition={lit ? { duration: 0.9 } : { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <svg aria-hidden viewBox="0 0 96 128" className="relative size-full overflow-visible">
          <defs>
            <radialGradient id="sky-lit" cx="50%" cy="92%" r="95%">
              <stop offset="0" stopColor="#fff8d8" />
              <stop offset="0.35" stopColor="#fbd98a" />
              <stop offset="0.75" stopColor="#ee9a45" />
              <stop offset="1" stopColor="#b9602a" />
            </radialGradient>
            <linearGradient id="sky-dark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#cdbb93" stopOpacity="0.85" />
              <stop offset="1" stopColor="#8f7f62" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <path d={PAPER_LANTERN} fill="url(#sky-dark)" stroke="#d9c9a3" strokeOpacity="0.6" />
          <path d="M30 11Q23 62 30 114M48 10V114M66 11Q73 62 66 114" fill="none" stroke="#2c2015" strokeOpacity="0.25" />
          <motion.g initial={false} animate={{ opacity: lit ? 1 : 0 }} transition={{ duration: 0.9 }}>
            <path d={PAPER_LANTERN} fill="url(#sky-lit)" />
            <path d="M30 11Q23 62 30 114M48 10V114M66 11Q73 62 66 114" fill="none" stroke="#b9602a" strokeOpacity="0.3" />
          </motion.g>
          <ellipse cx="48" cy="114" rx="24" ry="4" fill="none" stroke="#2c2015" strokeOpacity="0.75" strokeWidth="2" />
          <motion.path
            d="M48 96C41 105 43 115 48 115 53 115 55 105 48 96Z"
            fill="#fff6cf"
            style={{ transformOrigin: '48px 115px' }}
            initial={false}
            animate={lit ? { opacity: 1, scale: [0, 1.3, 1] } : { opacity: 0, scale: 0 }}
            transition={{ duration: 0.7 }}
          />
        </svg>
        {onTap && (
          <button
            type="button"
            aria-label={t('Einladung öffnen')}
            aria-describedby="join-hint"
            onClick={onTap}
            className="absolute -inset-5 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#f7e9a8]"
          />
        )}
      </motion.div>
      {lit && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-[calc(22svh+2rem)] left-1/2 -ml-12 size-24 rounded-full bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_35%,rgba(247,233,168,0)_70%)]"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 40, opacity: [0, 1, 1] }}
          transition={{ duration: 1.3, delay: 3, ease: 'easeIn' }}
        />
      )}
    </>
  )
}

// One candle on the water for each character of a typed code.
function Candles({ count, gone }: { count: number; gone: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-[76svh] flex justify-center gap-6"
      animate={{ opacity: gone ? 0 : 1 }}
      transition={{ duration: 1.2, delay: 1.2 }}
    >
      {Array.from({ length: LENGTH }, (_, i) => {
        const on = i < count
        return (
          <span key={i} data-candle={on ? 'lit' : 'dark'} className="relative flex flex-col items-center" style={{ marginTop: i % 2 ? 12 : 0 }}>
            <motion.span className={`absolute -top-5 size-12 rounded-full ${GLOW}`} initial={false} animate={{ opacity: on ? 0.9 : 0, scale: on ? 1 : 0.4 }} />
            <motion.span
              className="h-3.5 w-2 origin-bottom rounded-[50%_50%_50%_50%/65%_65%_35%_35%] bg-[#fff6cf]"
              initial={false}
              animate={on ? { opacity: 1, scaleY: [0, 1.4, 1] } : { opacity: 0.12, scaleY: 1 }}
              transition={{ duration: 0.4 }}
            />
            <span className="mt-0.5 h-1.5 w-4 rounded-sm bg-[#d9c9a3]/60" />
            <motion.span className="mt-1 h-9 w-1.5 rounded-full bg-gradient-to-b from-[#f7e9a8]/70 to-transparent blur-[2px]" initial={false} animate={{ opacity: on ? 1 : 0 }} />
          </span>
        )
      })}
    </motion.div>
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

// A satin ribbon tied around the envelope in place of a seal; pulling the bow
// undoes it.
const SATIN = 'color-mix(in oklab, var(--gold) 82%, black)'
const SHEEN = 'color-mix(in oklab, var(--gold) 70%, white)'

function Ribbon({ gone, onDone }: { gone: boolean; onDone: () => void }) {
  const along = (deg: number) => ({ background: `linear-gradient(${deg}deg, ${SATIN}, var(--gold) 30%, ${SHEEN} 50%, var(--gold) 70%, ${SATIN})` })
  return (
    <>
      <motion.span aria-hidden className="absolute inset-y-0 left-1/2 z-[35] -ml-2 w-4 shadow-[0_1px_3px_rgba(0,0,0,0.25)]" style={along(90)} animate={{ scaleY: gone ? 0 : 1, opacity: gone ? 0 : 1 }} transition={{ duration: 0.5 }} />
      <motion.span aria-hidden className="absolute inset-x-0 top-[55%] z-[35] -mt-2 h-4 shadow-[0_1px_3px_rgba(0,0,0,0.25)]" style={along(180)} animate={{ scaleX: gone ? 0 : 1, opacity: gone ? 0 : 1 }} transition={{ duration: 0.5 }} />
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
        className="absolute top-[55%] left-1/2 z-50 -mt-[52px] -ml-[90px] h-[120px] w-[180px] cursor-grab touch-none outline-none active:cursor-grabbing"
        animate={{ opacity: gone ? 0 : 1, scale: gone ? 0.8 : 1 }}
        transition={{ duration: 0.4 }}
      >
        <svg viewBox="0 0 180 120" className="size-full [filter:drop-shadow(0_3px_4px_rgba(0,0,0,0.3))]">
          <defs>
            <linearGradient id="bow-left" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={SHEEN} />
              <stop offset="0.55" stopColor="var(--gold)" />
              <stop offset="1" stopColor={SATIN} />
            </linearGradient>
            <linearGradient id="bow-right" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={SHEEN} />
              <stop offset="0.55" stopColor="var(--gold)" />
              <stop offset="1" stopColor={SATIN} />
            </linearGradient>
          </defs>
          <path d="M84 56 62 112 76 104 86 116 94 60Z" fill={SATIN} />
          <path d="M96 56 118 112 104 104 94 116 86 60Z" fill={SATIN} />
          <path d="M90 50C66 14 22 4 10 26 0 46 22 78 90 54Z" fill="url(#bow-left)" />
          <path d="M90 50C114 14 158 4 170 26 180 46 158 78 90 54Z" fill="url(#bow-right)" />
          <path d="M82 50C62 30 36 24 28 34 24 44 44 58 82 52Z" fill={SATIN} opacity="0.45" />
          <path d="M98 50C118 30 144 24 152 34 156 44 136 58 98 52Z" fill={SATIN} opacity="0.45" />
          <rect x="78" y="38" width="24" height="26" rx="8" fill="var(--gold)" />
          <rect x="82" y="40" width="6" height="22" rx="3" fill={SHEEN} opacity="0.6" />
        </svg>
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
const LINING = 'color-mix(in oklab, var(--primary) 55%, var(--card))'
const INSIDE = 'color-mix(in oklab, color-mix(in oklab, var(--gold) 45%, var(--card)) 80%, black)'
const SIDE = 'color-mix(in oklab, black 6%, ' + PAPER + ')'
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
  bare,
  active,
  opened,
  still,
  shake,
  children,
}: {
  code: string
  plain: boolean
  // Tied with a ribbon instead of sealed.
  bare: boolean
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
      className={`relative mx-auto h-[300px] w-full max-w-[21.5rem] ${plain ? 'mt-[clamp(3.5rem,16svh,12rem)]' : 'mt-3 sm:mt-[clamp(3.5rem,16svh,12rem)]'}`}
      initial={still ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <motion.div className="absolute inset-0 rounded-lg shadow-[0_18px_30px_-12px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.12)]" style={{ background: INSIDE }} {...drop} />
      <motion.div
        aria-hidden
        className="absolute inset-x-4 top-2 bottom-2 z-10 flex flex-col items-center gap-3 rounded-md bg-card pt-10 shadow-[0_2px_10px_rgba(0,0,0,0.25)] ring-1 ring-black/5 before:absolute before:inset-2 before:rounded-sm before:border before:border-[color:var(--gold)] before:opacity-60"
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
      <motion.div aria-hidden className="absolute inset-0 z-20 overflow-hidden rounded-lg" {...drop}>
        <svg viewBox="0 0 344 300" preserveAspectRatio="none" className="size-full">
          <defs>
            <filter id="fold" x="-10%" y="-20%" width="120%" height="140%">
              <feDropShadow dx="0" dy="-2" stdDeviation="3" floodColor="#000" floodOpacity="0.22" />
            </filter>
            <linearGradient id="front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={SIDE} />
              <stop offset="1" stopColor={PAPER} />
            </linearGradient>
          </defs>
          <path d="M0 0 172 165 0 300Z" fill={SIDE} />
          <path d="M344 0 172 165 344 300Z" fill={SIDE} />
          <path d="M0 300 172 156 344 300Z" fill="url(#front)" filter="url(#fold)" />
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
              background: move ? LINING : `linear-gradient(180deg, ${FLAP}, color-mix(in oklab, black 5%, ${FLAP}))`,
              clipPath: 'polygon(0 0, 100% 0, 54% 96%, 50% 100%, 46% 96%)',
              transition: `background 0s ${sweep + 0.8}s`,
            }}
          />
        </motion.div>
      </motion.div>
      {!bare && <motion.div aria-hidden className="absolute top-[55%] left-1/2 z-40 -mt-[76px] -ml-[76px] size-[152px]" animate={shake}>
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
      </motion.div>}
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
