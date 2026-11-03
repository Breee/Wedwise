import { useMemo } from 'react'
import { motion } from 'motion/react'

const EASE = [0.22, 1, 0.36, 1] as const

type Firefly = { x: number; y: number; size: number; delay: number; duration: number; dx: number; dy: number; blink: number }

function makeFireflies(n: number): Firefly[] {
  let seed = 1337
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, () => ({
    x: 3 + rnd() * 94,
    y: 25 + rnd() * 70,
    size: 3 + rnd() * 3,
    delay: rnd() * 8,
    duration: 14 + rnd() * 12,
    dx: (rnd() - 0.5) * 120,
    dy: (rnd() - 0.5) * 80,
    blink: 2.5 + rnd() * 3.5,
  }))
}

const TREES_BACK =
  'M0 70 L0 60 L0.0 60 L1.5 48.8 L0.9 48.8 L2.0 40.1 L1.5 40.1 L2.2 35.1 L2.8 40.1 L2.4 40.1 L3.5 48.8 L2.8 48.8 L4.4 60 L3.5 60 L5.1 48.1 L4.4 48.1 L5.5 38.8 L5.1 38.8 L5.8 33.6 L6.4 38.8 L6.0 38.8 L7.1 48.1 L6.4 48.1 L8.0 60 L7.1 60 L8.3 46.7 L7.8 46.7 L8.6 36.4 L8.3 36.4 L8.8 30.5 L9.3 36.4 L8.9 36.4 L9.7 46.7 L9.3 46.7 L10.4 60 L9.7 60 L11.5 50.0 L10.8 50.0 L12.0 42.3 L11.5 42.3 L12.3 37.8 L13.0 42.3 L12.5 42.3 L13.8 50.0 L13.0 50.0 L14.8 60 L13.8 60 L15.1 48.7 L14.5 48.7 L15.4 39.9 L15.1 39.9 L15.6 34.9 L16.2 39.9 L15.8 39.9 L16.7 48.7 L16.2 48.7 L17.4 60 L16.7 60 L18.2 44.7 L17.6 44.7 L18.6 32.8 L18.2 32.8 L18.8 26.1 L19.4 32.8 L19.0 32.8 L20.1 44.7 L19.4 44.7 L20.9 60 L20.1 60 L21.6 45.6 L20.9 45.6 L22.0 34.4 L21.6 34.4 L22.2 28.0 L22.8 34.4 L22.4 34.4 L23.5 45.6 L22.8 45.6 L24.3 60 L23.5 60 L24.7 46.6 L24.2 46.6 L25.0 36.3 L24.7 36.3 L25.2 30.3 L25.7 36.3 L25.4 36.3 L26.2 46.6 L25.7 46.6 L26.9 60 L26.2 60 L28.0 46.7 L27.3 46.7 L28.5 36.3 L28.0 36.3 L28.8 30.4 L29.6 36.3 L29.1 36.3 L30.3 46.7 L29.6 46.7 L31.4 60 L30.3 60 L32.0 47.3 L31.3 47.3 L32.5 37.4 L32.0 37.4 L32.7 31.7 L33.5 37.4 L33.0 37.4 L34.2 47.3 L33.5 47.3 L35.1 60 L34.2 60 L35.3 46.5 L34.8 46.5 L35.7 36.0 L35.3 36.0 L35.8 29.9 L36.3 36.0 L36.0 36.0 L36.8 46.5 L36.3 46.5 L37.5 60 L36.8 60 L38.4 46.0 L37.7 46.0 L38.8 35.1 L38.4 35.1 L39.1 28.9 L39.7 35.1 L39.3 35.1 L40.4 46.0 L39.7 46.0 L41.3 60 L40.4 60 L41.5 48.5 L41.0 48.5 L41.9 39.5 L41.5 39.5 L42.0 34.4 L42.5 39.5 L42.2 39.5 L43.0 48.5 L42.5 48.5 L43.6 60 L43.0 60 L44.5 45.4 L43.8 45.4 L44.9 34.1 L44.5 34.1 L45.1 27.6 L45.7 34.1 L45.3 34.1 L46.4 45.4 L45.7 45.4 L47.2 60 L46.4 60 L48.1 46.2 L47.4 46.2 L48.7 35.5 L48.1 35.5 L48.9 29.4 L49.7 35.5 L49.2 35.5 L50.5 46.2 L49.7 46.2 L51.5 60 L50.5 60 L52.3 46.2 L51.5 46.2 L52.8 35.5 L52.3 35.5 L53.1 29.4 L53.8 35.5 L53.3 35.5 L54.6 46.2 L53.8 46.2 L55.7 60 L54.6 60 L56.4 48.0 L55.6 48.0 L56.9 38.6 L56.4 38.6 L57.1 33.3 L57.9 38.6 L57.4 38.6 L58.6 48.0 L57.9 48.0 L59.6 60 L58.6 60 L60.4 47.7 L59.6 47.7 L61.0 38.1 L60.4 38.1 L61.2 32.7 L62.0 38.1 L61.5 38.1 L62.8 47.7 L62.0 47.7 L63.8 60 L62.8 60 L64.0 45.4 L63.5 45.4 L64.3 34.0 L64.0 34.0 L64.5 27.5 L65.0 34.0 L64.7 34.0 L65.5 45.4 L65.0 45.4 L66.2 60 L65.5 60 L66.8 49.4 L66.2 49.4 L67.1 41.1 L66.8 41.1 L67.3 36.4 L67.9 41.1 L67.5 41.1 L68.4 49.4 L67.9 49.4 L69.1 60 L68.4 60 L69.8 44.9 L69.2 44.9 L70.3 33.1 L69.8 33.1 L70.5 26.4 L71.1 33.1 L70.7 33.1 L71.7 44.9 L71.1 44.9 L72.5 60 L71.7 60 L73.0 46.7 L72.5 46.7 L73.4 36.4 L73.0 36.4 L73.6 30.5 L74.2 36.4 L73.8 36.4 L74.8 46.7 L74.2 46.7 L75.5 60 L74.8 60 L76.2 47.4 L75.6 47.4 L76.6 37.5 L76.2 37.5 L76.8 31.9 L77.4 37.5 L77.0 37.5 L78.0 47.4 L77.4 47.4 L78.8 60 L78.0 60 L79.5 48.2 L78.9 48.2 L80.0 39.0 L79.5 39.0 L80.2 33.8 L80.9 39.0 L80.4 39.0 L81.6 48.2 L80.9 48.2 L82.5 60 L81.6 60 L83.4 46.9 L82.6 46.9 L83.9 36.8 L83.4 36.8 L84.2 31.0 L84.9 36.8 L84.4 36.8 L85.7 46.9 L84.9 46.9 L86.7 60 L85.7 60 L87.5 46.4 L86.8 46.4 L88.1 35.9 L87.5 35.9 L88.3 29.8 L89.1 35.9 L88.6 35.9 L89.9 46.4 L89.1 46.4 L90.9 60 L89.9 60 L91.8 45.5 L91.0 45.5 L92.3 34.2 L91.8 34.2 L92.6 27.7 L93.4 34.2 L92.9 34.2 L94.2 45.5 L93.4 45.5 L95.3 60 L94.2 60 L95.4 46.5 L94.9 46.5 L95.8 36.0 L95.4 36.0 L96.0 29.9 L96.5 36.0 L96.1 36.0 L97.0 46.5 L96.5 46.5 L97.7 60 L97.0 60 L98.9 45.5 L98.1 45.5 L99.4 34.1 L98.9 34.1 L99.7 27.7 L100.5 34.1 L99.9 34.1 L101.3 45.5 L100.5 45.5 L102.3 60 L100 70 Z'
const TREES_FRONT =
  'M0 70 L0 66 L0.0 66 L1.9 47.8 L1.1 47.8 L2.4 33.6 L1.9 33.6 L2.7 25.5 L3.5 33.6 L3.0 33.6 L4.3 47.8 L3.5 47.8 L5.4 66 L4.3 66 L5.9 49.2 L5.2 49.2 L6.3 36.1 L5.9 36.1 L6.5 28.6 L7.2 36.1 L6.8 36.1 L7.9 49.2 L7.2 49.2 L8.8 66 L7.9 66 L9.8 48.3 L9.0 48.3 L10.3 34.6 L9.8 34.6 L10.6 26.7 L11.4 34.6 L10.9 34.6 L12.2 48.3 L11.4 48.3 L13.3 66 L12.2 66 L13.6 52.2 L13.0 52.2 L14.0 41.6 L13.6 41.6 L14.2 35.4 L14.8 41.6 L14.4 41.6 L15.4 52.2 L14.8 52.2 L16.2 66 L15.4 66 L17.7 48.2 L16.8 48.2 L18.4 34.3 L17.7 34.3 L18.7 26.3 L19.7 34.3 L19.1 34.3 L20.7 48.2 L19.7 48.2 L22.0 66 L20.7 66 L22.8 53.7 L21.9 53.7 L23.4 44.1 L22.8 44.1 L23.7 38.6 L24.6 44.1 L24.0 44.1 L25.5 53.7 L24.6 53.7 L26.7 66 L25.5 66 L27.0 51.3 L26.4 51.3 L27.5 39.9 L27.0 39.9 L27.7 33.4 L28.3 39.9 L27.9 39.9 L28.9 51.3 L28.3 51.3 L29.8 66 L28.9 66 L31.0 52.2 L30.1 52.2 L31.6 41.4 L31.0 41.4 L31.9 35.3 L32.8 41.4 L32.2 41.4 L33.7 52.2 L32.8 52.2 L34.9 66 L33.7 66 L35.1 48.0 L34.5 48.0 L35.5 34.0 L35.1 34.0 L35.7 26.0 L36.3 34.0 L35.9 34.0 L36.9 48.0 L36.3 48.0 L37.7 66 L36.9 66 L38.3 49.9 L37.7 49.9 L38.7 37.3 L38.3 37.3 L38.9 30.2 L39.5 37.3 L39.1 37.3 L40.1 49.9 L39.5 49.9 L40.9 66 L40.1 66 L41.7 49.1 L41.0 49.1 L42.2 36.0 L41.7 36.0 L42.5 28.5 L43.2 36.0 L42.7 36.0 L43.9 49.1 L43.2 49.1 L44.8 66 L43.9 66 L46.2 48.0 L45.2 48.0 L46.8 33.9 L46.2 33.9 L47.2 25.9 L48.1 33.9 L47.5 33.9 L49.1 48.0 L48.1 48.0 L50.4 66 L49.1 66 L51.4 50.7 L50.4 50.7 L52.1 38.7 L51.4 38.7 L52.4 31.9 L53.4 38.7 L52.7 38.7 L54.4 50.7 L53.4 50.7 L55.7 66 L54.4 66 L55.8 52.1 L55.2 52.1 L56.2 41.2 L55.8 41.2 L56.4 35.0 L57.0 41.2 L56.6 41.2 L57.6 52.1 L57.0 52.1 L58.5 66 L57.6 66 L59.0 50.0 L58.4 50.0 L59.4 37.5 L59.0 37.5 L59.6 30.4 L60.2 37.5 L59.8 37.5 L60.8 50.0 L60.2 50.0 L61.6 66 L60.8 66 L62.5 52.9 L61.8 52.9 L63.0 42.7 L62.5 42.7 L63.3 36.8 L64.0 42.7 L63.5 42.7 L64.8 52.9 L64.0 52.9 L65.8 66 L64.8 66 L66.3 49.9 L65.6 49.9 L66.7 37.4 L66.3 37.4 L66.9 30.2 L67.6 37.4 L67.1 37.4 L68.2 49.9 L67.6 49.9 L69.1 66 L68.2 66 L70.4 54.0 L69.4 54.0 L71.0 44.7 L70.4 44.7 L71.3 39.3 L72.3 44.7 L71.6 44.7 L73.2 54.0 L72.3 54.0 L74.4 66 L73.2 66 L75.5 52.0 L74.5 52.0 L76.1 41.2 L75.5 41.2 L76.4 35.0 L77.4 41.2 L76.8 41.2 L78.4 52.0 L77.4 52.0 L79.7 66 L78.4 66 L80.1 47.8 L79.4 47.8 L80.6 33.7 L80.1 33.7 L80.8 25.7 L81.6 33.7 L81.1 33.7 L82.3 47.8 L81.6 47.8 L83.3 66 L82.3 66 L84.1 51.0 L83.3 51.0 L84.7 39.3 L84.1 39.3 L84.9 32.6 L85.7 39.3 L85.2 39.3 L86.5 51.0 L85.7 51.0 L87.6 66 L86.5 66 L88.4 49.7 L87.6 49.7 L89.0 37.0 L88.4 37.0 L89.3 29.7 L90.1 37.0 L89.5 37.0 L90.9 49.7 L90.1 49.7 L92.0 66 L90.9 66 L92.8 50.3 L92.0 50.3 L93.4 38.0 L92.8 38.0 L93.7 31.1 L94.5 38.0 L94.0 38.0 L95.3 50.3 L94.5 50.3 L96.5 66 L95.3 66 L97.2 47.5 L96.4 47.5 L97.7 33.2 L97.2 33.2 L98.0 25.0 L98.8 33.2 L98.2 33.2 L99.5 47.5 L98.8 47.5 L100.6 66 L99.5 66 L101.6 51.2 L100.7 51.2 L102.2 39.7 L101.6 39.7 L102.5 33.1 L103.3 39.7 L102.7 39.7 L104.2 51.2 L103.3 51.2 L105.4 66 L100 70 Z'

/** Forest-and-lake-at-dusk scene: gradient sky, tree silhouettes, mist and fireflies. */
export function DuskScene() {
  const flies = useMemo(() => makeFireflies(30), [])
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, #15211a 0%, #22352a 38%, #3d5a44 58%, #8a9a7b 66%, #d9c9a3 70%, #2a3a2f 71%, #15211a 100%)',
        }}
      />
      {/* lake glow */}
      <motion.div
        className="absolute inset-x-0"
        style={{
          top: '66%',
          height: '34%',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(217,201,163,0.35), transparent 60%)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 3, delay: 0.5 }}
      />
      {/* tree lines */}
      <svg className="absolute inset-x-0 w-full" style={{ top: '46%', height: '25%' }} viewBox="0 0 100 70" preserveAspectRatio="none">
        <path d={TREES_BACK} fill="#1c2b22" opacity="0.85" />
        <path d={TREES_FRONT} fill="#0f1a14" />
      </svg>
      {/* reflected tree line */}
      <svg
        className="absolute inset-x-0 w-full"
        style={{ top: '70%', height: '18%', transform: 'scaleY(-1)', opacity: 0.35, filter: 'blur(2px)' }}
        viewBox="0 0 100 70"
        preserveAspectRatio="none"
      >
        <path d={TREES_FRONT} fill="#0f1a14" />
      </svg>
      {/* mist on the water */}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-x-[-20%]"
          style={{
            top: `${68 + i * 4}%`,
            height: '10%',
            background: 'linear-gradient(to bottom, transparent, rgba(232,236,226,0.22), transparent)',
            filter: 'blur(10px)',
          }}
          animate={{ x: i ? ['-4%', '4%', '-4%'] : ['4%', '-4%', '4%'], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 28 + i * 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      {/* fireflies */}
      {flies.map((f, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: f.size,
            height: f.size,
            background: '#f5e6a3',
            boxShadow: '0 0 10px 4px rgba(245,230,163,0.7), 0 0 26px 10px rgba(245,230,163,0.25)',
          }}
          initial={{ opacity: 0 }}
          animate={{
            x: [0, f.dx * 0.4, f.dx, f.dx * 0.6, 0],
            y: [0, f.dy * 0.6, f.dy, f.dy * 0.3, 0],
          }}
          transition={{ duration: f.duration, delay: f.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.span
            className="block size-full rounded-full"
            style={{ background: '#f5e6a3' }}
            animate={{ opacity: [0, 1, 0.15, 0.9, 0] }}
            transition={{ duration: f.blink, delay: f.delay, repeat: Infinity, repeatDelay: f.blink * 0.6, ease: 'easeInOut' }}
          />
        </motion.span>
      ))}
    </div>
  )
}

export function DuskTitle({ title, date }: { title: string; date: string }) {
  return (
    <div className="relative flex flex-col items-center" style={{ marginTop: '-12vh' }}>
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
