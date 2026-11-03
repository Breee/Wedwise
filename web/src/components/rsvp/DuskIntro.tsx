import { useMemo } from 'react'
import { motion } from 'motion/react'

const EASE = [0.22, 1, 0.36, 1] as const

type Firefly = { x: number; y: number; size: number; delay: number; duration: number; dx: number; dy: number; blink: number }

function makeFireflies(n: number): Firefly[] {
  let seed = 1337
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, () => ({
    x: 3 + rnd() * 94,
    y: 35 + rnd() * 60,
    size: 3 + rnd() * 3,
    delay: rnd() * 8,
    duration: 18 + rnd() * 14,
    dx: (rnd() - 0.5) * 120,
    dy: (rnd() - 0.5) * 80,
    blink: 2.5 + rnd() * 3.5,
  }))
}

/** Painted Waldsee at dusk with drifting mist and fireflies. */
export function DuskScene() {
  const flies = useMemo(() => makeFireflies(26), [])
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#1c2a22]">
      <motion.picture
        className="absolute inset-0 block"
        initial={{ scale: 1.04, opacity: 0 }}
        animate={{ scale: [1.04, 1.1], opacity: 1 }}
        transition={{ scale: { duration: 45, ease: 'linear', repeat: Infinity, repeatType: 'mirror' }, opacity: { duration: 2 } }}
      >
        <source media="(max-aspect-ratio: 4/5)" srcSet="/decor/lake-portrait.jpg" />
        <img src="/decor/lake.jpg" alt="" className="size-full object-cover" draggable={false} />
      </motion.picture>
      {/* dusk tint + legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(18,30,26,0.7) 0%, rgba(18,30,26,0.45) 30%, rgba(18,30,26,0.05) 55%, rgba(18,30,26,0.35) 100%)',
        }}
      />
      {/* mist on the water */}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-x-[-20%]"
          style={{
            top: `${58 + i * 9}%`,
            height: '16%',
            background: 'linear-gradient(to bottom, transparent, rgba(236,238,228,0.28), transparent)',
            filter: 'blur(14px)',
          }}
          animate={{ x: i ? ['-4%', '4%', '-4%'] : ['4%', '-4%', '4%'], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 30 + i * 11, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      {/* fireflies */}
      {flies.map((f, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ left: `${f.x}%`, top: `${f.y}%`, width: f.size, height: f.size }}
          animate={{
            x: [0, f.dx * 0.4, f.dx, f.dx * 0.6, 0],
            y: [0, f.dy * 0.6, f.dy, f.dy * 0.3, 0],
          }}
          transition={{ duration: f.duration, delay: f.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.span
            className="block size-full rounded-full"
            style={{
              background: '#f7e9a8',
              boxShadow: '0 0 10px 4px rgba(247,233,168,0.7), 0 0 26px 10px rgba(247,233,168,0.25)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.2, 0.9, 0] }}
            transition={{ duration: f.blink, delay: f.delay, repeat: Infinity, repeatDelay: f.blink * 0.5, ease: 'easeInOut' }}
          />
        </motion.span>
      ))}
    </div>
  )
}

export function DuskTitle({ title, date }: { title: string; date: string }) {
  return (
    <div className="relative flex flex-col items-center" style={{ marginTop: '-38vh', textShadow: '0 2px 24px rgba(0,0,0,0.5)' }}>
      <motion.p
        className="text-xs font-medium text-[#d9c9a3] uppercase"
        initial={{ opacity: 0, letterSpacing: '0.1em' }}
        animate={{ opacity: 1, letterSpacing: '0.45em' }}
        transition={{ duration: 1.6, ease: EASE, delay: 0.3 }}
      >
        Ihr seid eingeladen
      </motion.p>
      <div className="mt-6 overflow-hidden pb-1">
        <motion.h1
          className="font-display text-5xl leading-tight font-medium text-[#f4efe2] md:text-7xl"
          style={{ textShadow: '0 2px 24px rgba(0,0,0,0.35)' }}
          initial={{ opacity: 0, y: '105%', filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.8, ease: EASE, delay: 1.2 }}
        >
          {title}
        </motion.h1>
      </div>
      <motion.div
        className="my-3 h-px w-[min(80vw,28rem)]"
        style={{ background: 'linear-gradient(to right, transparent, #d9c9a3, transparent)' }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: 'easeInOut', delay: 0.8 }}
      />
      <motion.p
        className="font-display text-xl text-[#d9c9a3]/90 md:text-2xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 2.4 }}
      >
        {date}
      </motion.p>
    </div>
  )
}
