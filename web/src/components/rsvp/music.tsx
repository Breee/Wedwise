import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Check, Music, Search } from 'lucide-react'
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

type Track = { trackId: number; trackName: string; artistName: string }

export function SongSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<Track[]>([])
  const [state, setState] = useState<'idle' | 'searching' | 'done'>('idle')
  const [picked, setPicked] = useState(value)
  const [pickedId, setPickedId] = useState(0)

  useEffect(() => {
    const q = query.trim()
    // A picked song keeps its list, so the choice stays visible.
    if (q === picked) return
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
  }, [query, picked])

  const hint =
    results.length > 0 ? '' : state === 'searching' ? t('Sucht …') : state === 'done' ? t('Nichts gefunden. Euer Text wird so übernommen.') : t('Tippt mindestens drei Buchstaben.')

  return (
    <div className="space-y-3">
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
            setPicked('')
            onChange(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            e.currentTarget.blur()
          }}
        />
      </div>
      {/* Fixed height: results come and go without moving the page. */}
      <div className="h-64 overflow-y-auto overscroll-contain rounded-md border" aria-live="polite">
        {hint && <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">{hint}</p>}
        {results.length > 0 && (
          <ul className="divide-y">
            {results.map((track) => {
              const label = `${track.artistName} – ${track.trackName}`
              const on = track.trackId === pickedId && label === picked
              return (
                <li key={track.trackId}>
                  <button
                    type="button"
                    aria-pressed={on}
                    className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm ${on ? 'bg-primary/10' : 'hover:bg-accent'}`}
                    onClick={() => {
                      setQuery(label)
                      setPicked(label)
                      setPickedId(track.trackId)
                      onChange(label)
                    }}
                  >
                    {on ? <Check className="size-4 shrink-0 text-primary" /> : <Music className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{track.trackName}</span>
                      <span className="block truncate text-muted-foreground">{track.artistName}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
