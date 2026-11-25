import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { motion, useReducedMotion } from 'motion/react'
import { Music, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export const GENRES = ['Pop', 'Charts', 'Rock', 'Indie', 'Punk', 'Metal', 'Hardcore', 'Hip-Hop', 'R&B', 'Soul / Funk', 'Disco', 'House / Electro', 'Techno', 'Drum & Bass', 'Electro Swing', 'Jazz / Swing', 'Reggae', 'Latin', 'Schlager', '80er', '90er', '2000er'] as const

const GENRE_ICONS: [RegExp, string][] = [
  [/swing|jazz/i, '🎷'],
  [/metal/i, '🤘'],
  [/hardcore|punk/i, '🧷'],
  [/rock/i, '🎸'],
  [/hip.?hop|rap/i, '🎤'],
  [/r&b|soul|funk/i, '🕺'],
  [/disco/i, '🪩'],
  [/techno|house|electro|drum|edm/i, '🎧'],
  [/reggae/i, '🌴'],
  [/latin|salsa/i, '💃'],
  [/schlager/i, '🍻'],
  [/\d0er/i, '📼'],
  [/indie/i, '🎹'],
  [/chart|pop/i, '⭐'],
]

export const genreIcon = (genre: string) => GENRE_ICONS.find(([pattern]) => pattern.test(genre))?.[1] ?? '🎵'

export const NEEDS_OPTIONS = ['Beamer / Leinwand', 'Mikrofon', 'Musikanlage', 'Laptop-Anschluss (HDMI)', 'Platz zum Aufbauen', 'Tisch', 'Strom'] as const

const SEP = ', '
const OTHER_PREFIX = 'Sonstiges: '

export const splitList = (s: string) => s.split(SEP).map((x) => x.trim()).filter(Boolean)
export const joinList = (xs: string[]) => xs.join(SEP)

export function parseNeeds(needs: string): { selected: string[]; other: string } {
  const parts = splitList(needs)
  const other = parts.find((p) => p.startsWith(OTHER_PREFIX))
  return {
    selected: parts.filter((p) => (NEEDS_OPTIONS as readonly string[]).includes(p)),
    other: other ? other.slice(OTHER_PREFIX.length) : '',
  }
}

export function formatNeeds(selected: string[], other: string): string {
  const o = other.trim()
  return joinList([...selected, ...(o ? [OTHER_PREFIX + o] : [])])
}

export type Track = { trackId: number; trackName: string; artistName: string; cover?: string }

function Cover({ track, className }: { track: Track; className: string }) {
  const [broken, setBroken] = useState(false)
  if (!track.cover || broken) {
    return (
      <span className={`flex shrink-0 items-center justify-center bg-muted text-muted-foreground ${className}`}>
        <Music className="size-1/3" />
      </span>
    )
  }
  return <img src={track.cover} alt="" loading="lazy" className={`shrink-0 object-cover ${className}`} onError={() => setBroken(true)} />
}

// The chosen song as a record sleeve, with the record sliding out and turning.
function Chosen({ track, onChange }: { track: Track; onChange: () => void }) {
  const still = useReducedMotion()
  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center gap-4 text-center"
      initial={{ opacity: 0, scale: still ? 1 : 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="relative size-36">
        <motion.div
          aria-hidden
          className="absolute inset-1 rounded-full shadow-md"
          style={{ background: 'repeating-radial-gradient(circle, #1c1c1c 0 2px, #2b2b2b 2px 4px)' }}
          initial={{ x: 0 }}
          animate={still ? { x: '45%' } : { x: '45%', rotate: 360 }}
          transition={still ? { duration: 0 } : { x: { duration: 0.6, delay: 0.25, ease: 'easeOut' }, rotate: { duration: 4, ease: 'linear', repeat: Infinity } }}
        >
          <span className="absolute inset-[34%] rounded-full bg-primary" />
          <span className="absolute top-[38%] left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary-foreground/70" />
          <span className="absolute inset-[48%] rounded-full bg-background" />
        </motion.div>
        <Cover track={track} className="relative size-36 rounded-md shadow-lg" />
      </div>
      <p className="w-full min-w-0">
        <span className="block truncate text-lg font-semibold">{track.trackName}</span>
        <span className="block truncate text-muted-foreground">{track.artistName}</span>
      </p>
      <button type="button" className="relative text-sm text-primary underline underline-offset-4 after:absolute after:-inset-3" onClick={onChange}>
        {t('Anderes Lied')}
      </button>
    </motion.div>
  )
}

export function SongSearch({
  value,
  onChange,
  chosen,
  onChosen: setChosen,
}: {
  value: string
  onChange: (v: string) => void
  chosen: Track | null
  onChosen: (track: Track | null) => void
}) {
  const [query, setQuery] = useState(chosen ? '' : value)
  const [results, setResults] = useState<Track[]>([])
  const [state, setState] = useState<'idle' | 'searching' | 'done'>('idle')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      setState('idle')
      return
    }
    const ctrl = new AbortController()
    setState('searching')
    const timer = setTimeout(() => {
      fetch(`/api/songs?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { results?: Track[] }) => {
          setResults(d.results ?? [])
          setState('done')
        })
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [query])

  const hint =
    results.length > 0 ? '' : state === 'searching' ? t('Sucht …') : state === 'done' ? t('Nichts gefunden. Euer Text wird so übernommen.') : t('Tippt mindestens drei Buchstaben.')

  // Fixed height: results and the chosen song come and go without moving the page.
  if (chosen) {
    return (
      <div className="h-80" aria-live="polite">
        <Chosen
          track={chosen}
          onChange={() => {
            setChosen(null)
            setQuery('')
            onChange('')
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-80 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          className="pl-9"
          aria-label={t('Song oder Interpret suchen …')}
          placeholder={t('Song oder Interpret suchen …')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            e.currentTarget.blur()
          }}
        />
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none]" aria-live="polite">
          {hint && <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">{hint}</p>}
          {results.length > 0 && (
            <ul className="space-y-1 pb-8">
              {results.map((track, i) => (
                <motion.li key={track.trackId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.04 }}>
                  <button
                    type="button"
                    className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent active:bg-accent"
                    onClick={() => {
                      setChosen(track)
                      onChange(`${track.artistName} – ${track.trackName}`)
                    }}
                  >
                    <Cover track={track} className="size-10 rounded" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{track.trackName}</span>
                      <span className="block truncate text-muted-foreground">{track.artistName}</span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
        {results.length > 0 && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />}
      </div>
    </div>
  )
}
