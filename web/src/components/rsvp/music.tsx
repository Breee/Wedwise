import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Music, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export const GENRES = ['Pop', 'Rock', 'Hip-Hop', 'Schlager', '80er', '90er', '2000er', 'House / Electro', 'Latin', 'Soul / Funk', 'Indie'] as const

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
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(value)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3 || q === picked) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/songs?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { results?: Track[] }) => {
          setResults(d.results ?? [])
          setOpen(true)
        })
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, picked])

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder={t('Song oder Interpret suchen …')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange(e.target.value)
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {results.map((t) => {
            const label = `${t.artistName} – ${t.trackName}`
            return (
              <li key={t.trackId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQuery(label)
                    setPicked(label)
                    onChange(label)
                    setOpen(false)
                  }}
                >
                  <Music className="size-4 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{t.trackName}</span>
                    <span className="text-muted-foreground"> · {t.artistName}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
