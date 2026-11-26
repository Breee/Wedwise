import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { motion, useReducedMotion } from 'motion/react'
import { Pointer } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { DuskScene, type SceneVariant } from '@/components/rsvp/DuskIntro'

// How the fireflies write the names: one letter after the other, or all of
// them at once along the whole line.
export type Writing = 'letters' | 'sweep'

const SCENES: SceneVariant[] = ['dusk', 'forest', 'night']
const SHADOW = '[text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]'
// Seconds of the opening before the invitation takes over.
const PLAYS = 5800
const PLAYS_STILL = 700

// The night picture behind the code page and the opening. It fills the screen
// by default; a smaller stage sets --stage-s and --stage-l to its own height.
export function Stage({ scene, className, style, children }: { scene?: string; className: string; style?: CSSProperties; children: ReactNode }) {
  const variant = SCENES.find((s) => s === scene) ?? 'night'
  return (
    <div className={`@container-[size] overflow-hidden bg-[#121c17] text-[#f4efe2] ${className}`} style={style}>
      <div className="absolute inset-x-0 top-0 h-[var(--stage-l,100lvh)]">
        <DuskScene variant={variant} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
      </div>
      {children}
    </div>
  )
}

// What a guest sees before the invitation: a greeting, a light to tap, and
// fireflies that write the couple's names. onDone tells whether the names are
// on screen in the place the invitation shows them.
export function Opening({
  dear,
  headline,
  names,
  date,
  venue,
  writing,
  onDone,
}: {
  dear?: string
  headline: string
  names?: string
  date?: string
  venue?: string
  writing: Writing
  onDone?: (lit: boolean) => void
}) {
  const still = useReducedMotion() ?? false
  const [opened, setOpened] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (!opened) return
    const timer = setTimeout(() => done.current?.(!still), still ? PLAYS_STILL : PLAYS)
    return () => clearTimeout(timer)
  }, [opened, still])

  return (
    <>
      <motion.div
        className={`relative mx-auto max-w-xl px-6 pt-[calc(var(--stage-s,100svh)*0.14)] text-center ${SHADOW}`}
        initial={false}
        animate={{ opacity: opened ? 0 : 1 }}
        transition={{ duration: 0.8 }}
      >
        <p id="join-hint" className="font-display text-3xl text-balance" role="status">
          {dear && <span className="mb-3 block text-xl text-[#ecdcb0]">{dear}</span>}
          {headline}
        </p>
      </motion.div>
      {still ? (
        <span
          aria-hidden
          className="absolute top-[calc(var(--stage-s,100svh)*0.5)] left-1/2 size-24 -translate-1/2 rounded-full bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_30%,rgba(247,233,168,0)_70%)]"
        />
      ) : (
        <Fireflies opened={opened} names={names} date={date} venue={venue} writing={writing} onDone={() => setOpened(true)} />
      )}
      {/* The fireflies are for fingers; this is the way in for everyone else. */}
      {!opened && (
        <button
          type="button"
          aria-describedby="join-hint"
          onClick={() => setOpened(true)}
          className={
            still
              ? 'absolute inset-0 size-full cursor-pointer text-transparent outline-none focus-visible:ring-2 focus-visible:ring-[#f7e9a8] focus-visible:ring-inset'
              : 'absolute bottom-[6%] left-1/2 -translate-x-1/2 rounded-full border border-current/30 px-5 py-2.5 text-xs font-medium tracking-[0.25em] uppercase opacity-0 outline-none focus-visible:opacity-80 focus-visible:ring-2 focus-visible:ring-current'
          }
        >
          {t('Einladung öffnen')}
        </button>
      )}
    </>
  )
}

// Fireflies drift over the lake as points of light. A finger on the screen
// draws them in and they follow it; once most are gathered they rise,
// multiply and settle into the couple's names, which then become the real
// lettering of the invitation.
const SWARM = 28
// Seconds a firefly takes to reach the names, and to fly along its stretch.
const ARRIVE = 1.1
const GLIDE = 1.5
const CROSS = 1.9
// Between two lines, and along the date or the place.
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
  parent?: Mote
  start?: number
  span?: number
  lo?: number
  hi?: number
  mid?: number
  // Further lines to fly along after the names, and when its light goes out.
  // When the real lettering comes up under a spark, in seconds.
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
  const letters: DOMRect[] = []
  for (let i = 0; i < text.length; i++) {
    range.setStart(node, i)
    range.setEnd(node, i + 1)
    const r = range.getBoundingClientRect()
    if (!r.width || !text[i].trim()) continue
    c.fillText(text[i], r.left - box.left, r.top - box.top + (r.height - up - down) / 2 + up)
    letters.push(r)
  }
  // Each point remembers which letter it belongs to: the one it lies in, or
  // the nearest where two overlap.
  const letterAt = (x: number, y: number) => {
    let best = 0
    let near = Infinity
    letters.forEach((r, i) => {
      const inside = y >= r.top - box.top && y <= r.bottom - box.top
      const far = Math.abs(x - (r.left - box.left + r.width / 2)) + (inside ? 0 : 10000)
      if (far < near) {
        near = far
        best = i
      }
    })
    return best
  }
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data
  const points: [number, number, number][] = []
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 120) points.push([x + Math.random(), y + Math.random(), letterAt(x, y)])
    }
  }
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[points[i], points[j]] = [points[j], points[i]]
  }
  return points.slice(0, most)
}

function Fireflies({ opened, names, date, venue, writing, onDone }: { opened: boolean; names?: string; date?: string; venue?: string; writing: Writing; onDone: () => void }) {
  const [rest, setRest] = useState(false)
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
    const born = performance.now()
    motes.current = Array.from({ length: SWARM }, (_, i) => {
      const phase = Math.random() * Math.PI * 2
      const orbit = 30 + (i % 9) * 6
      const spin = 0.9 + Math.random() * 0.6
      // A few already circle the light in the middle: they start on their
      // ring, at the speed they keep.
      const circling = i < 8
      const angle = (born / 1000) * spin + phase
      const ring = orbit * 0.9
      return {
        x: circling ? width / 2 + Math.cos(angle) * ring : width * (0.06 + Math.random() * 0.88),
        y: circling ? height / 2 + Math.sin(angle) * ring * 0.7 : height * (0.3 + Math.random() * 0.56),
        vx: circling ? -Math.sin(angle) * ring * spin : 0,
        vy: circling ? Math.cos(angle) * ring * 0.7 * spin : 0,
        turn: Math.random() * Math.PI * 2,
        phase,
        pace: 0.5 + Math.random() * 0.7,
        size: 1 + Math.random() * 1.1,
        held: circling,
        orbit,
        spin,
        tx: 0,
        ty: 0,
        wait: 0,
      }
    })

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
      // Everything fades in instead of popping up.
      const rise = Math.min(1, (now - born) / 1500)

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
      const lamp = shape ? Math.max(0, 1 - since / 1.2) : rise
      if (lamp) {
        const breath = Math.sin(time * 1.3)
        c.globalAlpha = (0.5 + 0.12 * breath) * lamp
        c.drawImage(sprite, midX - 40 - 5 * breath, midY - 40 - 5 * breath, 80 + 10 * breath, 80 + 10 * breath)
        c.globalAlpha = 0.12 * lamp
        c.drawImage(sprite, midX - 110, midY - 110, 220, 220)
      }
      let held = 0
      const swell = 0.9 + 0.35 * (count.current / SWARM)
      for (const m of motes.current) {
        let alpha: number
        let radius: number
        if (shape) {
          if (m.parent) {
            // A spark: dropped by its firefly as that passes, it settles into the letter.
            const age = since - m.wait
            if (age < 0) continue
            if (m.held) {
              m.held = false
              m.x = m.parent.x
              m.y = m.parent.y
              m.vx = m.parent.vx * 0.2 + (Math.random() - 0.5) * 40
              m.vy = m.parent.vy * 0.2 + (Math.random() - 0.5) * 40
            }
            const pull = 14 + 26 * Math.min(1, age / 0.8)
            m.vx += ((m.tx - m.x) * pull - m.vx * Math.sqrt(pull) * 1.6) * dt
            m.vy += ((m.ty - m.y) * pull - m.vy * Math.sqrt(pull) * 1.6) * dt
            // The lights dim while the lettering comes up underneath them.
            const fade = Math.max(0, 1 - Math.max(0, since - REVEAL / 1000 + 0.2) / 2.2)
            alpha = (0.75 + 0.25 * Math.sin(time * 4 + m.phase)) * fade * Math.min(1, age / 0.3)
            radius = 0.6 + m.size * 2.35
          } else {
            // A firefly: it flies to its stretch of the names, then along it.
            const start = m.start ?? ARRIVE
            const span = m.span ?? GLIDE
            const lo = m.lo ?? m.x
            const hi = m.hi ?? lo
            const mid = m.mid ?? m.y
            // In a swarm each one circles the point that moves along the names.
            const round = m.start === undefined ? 0 : m.orbit
            const along = Math.min(1, Math.max(0, (since - start) / span))
            const turn = m.spin || 3
            const goalX = lo + (hi - lo) * along + Math.cos(time * turn + m.phase) * round
            const goalY = mid + (round ? Math.sin(time * turn + m.phase) * round * 0.8 : Math.sin(time * 5 + m.phase) * 7)
            const pull = 6 + 54 * Math.min(1, since / ARRIVE) ** 2
            m.vx += ((goalX - m.x) * pull - m.vx * Math.sqrt(pull) * 1.6) * dt
            m.vy += ((goalY - m.y) * pull - m.vy * Math.sqrt(pull) * 1.6) * dt
            alpha = 0.6 * Math.max(0, 1 - Math.max(0, since - (start + span)) / 0.6)
            radius = m.size * (6 - 2.8 * Math.min(1, since / ARRIVE))
          }
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
            const ring = m.orbit * swell * (1 + 0.18 * Math.sin(time * 0.7 + m.phase * 3))
            m.vx += ((midX + Math.cos(angle) * ring - m.x) * 40 - m.vx * 9) * dt
            m.vy += ((midY + Math.sin(angle) * ring * 0.7 - m.y) * 40 - m.vy * 9) * dt
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
          alpha = (m.held ? 0.5 + 0.2 * blink : 0.1 + 0.9 * blink * blink) * rise
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
      } else if (shape && since < 1.2) {
        // It goes out with the light as the fireflies leave for the names.
        const glow = 40 + count.current * 3.5
        c.globalAlpha = (0.08 + 0.14 * (count.current / SWARM)) * (1 - since / 1.2)
        c.drawImage(sprite, midX - glow, midY - glow, glow * 2, glow * 2)
      }
      c.globalAlpha = 1

      // A tap, or most of them caught: they fly straight to the names.
      if (!shape && !full && (hand.all || held >= SWARM * 0.7)) {
        full = true
        hand.all = true
        done.current()
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
    let later = 0
    let gone = false
    document.fonts.ready.then(() => {
      const el = canvas.current
      const text = lettering.current
      if (gone || !el || !text) return
      const stage = el.getBoundingClientRect()
      const box = text.getBoundingClientRect()
      const points = letterPoints(text, box, stage.width < 640 ? 1800 : 3000)
      const all = motes.current
      const left = box.left - stage.left
      const top = box.top - stage.top
      // The fireflies share the names from left to right and drop their sparks
      // as they fly along their part: a letter each, one after the other, or
      // equal stretches of the line all at once.
      const flies = [...all].sort((a, b) => a.x - b.x)
      points.sort((a, b) => a[0] - b[0])
      let parts: [number, number, number][][] = []
      if (writing === 'letters') {
        for (const point of points) (parts[point[2]] ??= []).push(point)
        parts = parts.filter(Boolean)
      } else {
        const share = Math.ceil(points.length / flies.length) || 1
        for (let i = 0; i < points.length; i += share) parts.push(points.slice(i, i + share))
      }
      const swarm = writing === 'letters'
      const from = left + (points[0]?.[0] ?? 0)
      const to = left + (points[points.length - 1]?.[0] ?? 0)
      const crew: Mote[][] = parts.map(() => [])
      if (swarm) {
        // One swarm crosses the names; each letter lights up as it passes.
        for (const fly of flies) {
          fly.lo = from
          fly.hi = to
          fly.mid = top + box.height / 2
          fly.start = ARRIVE
          fly.span = CROSS
          fly.orbit = 6 + Math.random() * 24
          fly.spin = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 3)
        }
      } else {
        flies.forEach((fly, i) => crew[Math.min(parts.length - 1, Math.floor((i * parts.length) / flies.length))]?.push(fly))
      }
      parts.forEach((own, i) => {
        const team = swarm ? flies : crew[i].length ? crew[i] : flies.slice(0, 1)
        const lo = left + own[0][0]
        const hi = left + own[own.length - 1][0]
        const start = swarm && to > from ? ARRIVE + (CROSS * (lo - from)) / (to - from) : ARRIVE
        const span = swarm && to > from ? Math.max(0.25, (CROSS * (hi - lo)) / (to - from)) : GLIDE
        for (const fly of crew[i]) {
          fly.lo = lo
          fly.hi = hi
          fly.mid = top + box.height / 2
        }
        own.forEach((point, n) => {
          all.push({
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            turn: 0,
            phase: Math.random() * Math.PI * 2,
            pace: 1,
            size: 0.75,
            held: true,
            orbit: 0,
            spin: 0,
            tx: left + point[0],
            ty: top + point[1],
            wait: start + span * (hi > lo ? (left + point[0] - lo) / (hi - lo) : Math.random()),
            parent: team[swarm ? Math.floor(Math.random() * team.length) : n % team.length],
          })
        })
      })
      form.current = { at: performance.now(), x: box.left - stage.left + box.width / 2, y: box.top - stage.top + box.height / 2 }
      timer = window.setTimeout(() => setShown(true), REVEAL)
      later = window.setTimeout(() => setRest(true), REVEAL + 300)
    })
    return () => {
      gone = true
      clearTimeout(timer)
      clearTimeout(later)
    }
  }, [opened, writing])

  const place = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    finger.current.x = e.clientX - box.left
    finger.current.y = e.clientY - box.top
  }

  return (
    <>
      {/* The last lights fade before the invitation page takes over. */}
      <motion.canvas
        ref={canvas}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        initial={false}
        animate={{ opacity: opened ? 0 : 1 }}
        transition={{ duration: 1, delay: opened ? 4.8 : 0 }}
      />
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
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-[calc(var(--stage-s,100svh)*0.5+0.5rem)] left-[calc(50%-1rem)] text-[#f6ecd0] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: nudge && !opened ? 1 : 0 }}
        transition={{ duration: 1.2 }}
      >
        <motion.div animate={{ y: [18, 0, 0, 18], scale: [1, 0.9, 0.9, 1] }} transition={{ duration: 1.8, times: [0, 0.35, 0.55, 1], repeat: Infinity, ease: 'easeInOut' }}>
          <Pointer className="size-11" strokeWidth={1.5} />
        </motion.div>
      </motion.div>
      {/* Laid out like the first page of the invitation, so the lettering stays put when that page takes over. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="mx-auto flex min-h-[var(--stage-s,100svh)] max-w-xl flex-col px-6 pt-8 pb-4">
          <div className="flex flex-1 flex-col justify-center text-center [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]">
            <motion.div initial={false} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: 1.6, delay: 0.8 }}>
              <p className="text-sm font-medium tracking-[0.45em] text-[#ecdcb0] uppercase">{t('Ihr seid eingeladen')}</p>
            </motion.div>
            <motion.p
              ref={lettering}
              className="mt-6 font-display text-5xl leading-tight text-balance @3xl:text-7xl"
              initial={false}
              animate={{ opacity: shown ? 1 : 0, filter: shown ? 'blur(0px)' : 'blur(6px)' }}
              transition={{ duration: 2, ease: 'easeInOut' }}
            >
              {names}
            </motion.p>
            <motion.div initial={false} animate={{ opacity: rest ? 1 : 0 }} transition={{ duration: 1.2, ease: 'easeInOut' }}>
              <div className="mx-auto my-6 h-px w-32 bg-gradient-to-r from-transparent via-[#d9c9a3] to-transparent" />
              {date && (
                <p className="font-display text-3xl text-[#ecdcb0]">
                  {formatDate(date)}
                </p>
              )}
              {venue && (
                <p className="mt-6 text-base font-medium tracking-[0.25em] uppercase">
                  {venue}
                </p>
              )}
            </motion.div>
          </div>
          <div className="mt-6 min-h-12" />
        </div>
      </div>
    </>
  )
}

