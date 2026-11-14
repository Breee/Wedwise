import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Search } from 'lucide-react'
import { t } from '@/lib/i18n'
import { api } from '@/lib/api'
import { BaseMap } from '@/components/public/BaseMap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Place {
  name: string
  label: string
  lat: number
  lng: number
}

interface Point {
  lat: number
  lng: number
}

const isSet = (p: Point) => p.lat !== 0 || p.lng !== 0

export function PlacePicker({
  value,
  near,
  query = '',
  onChange,
  className,
}: {
  value: Point
  near?: Point
  query?: string
  onChange: (point: Point, place?: Place) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setOpen(true)}>
        <MapPin className={isSet(value) ? 'text-primary' : 'text-muted-foreground'} />
        {isSet(value) ? t('Ort gesetzt – ändern') : t('Ort auf der Karte wählen')}
      </Button>
      {open && (
        <PickerDialog
          value={value}
          near={near}
          query={query}
          onClose={() => setOpen(false)}
          onPick={(point, place) => {
            onChange(point, place)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function PickerDialog({
  value,
  near,
  query,
  onClose,
  onPick,
}: {
  value: Point
  near?: Point
  query: string
  onClose: () => void
  onPick: (point: Point, place?: Place) => void
}) {
  const start = isSet(value) ? value : near && isSet(near) ? near : undefined
  const [text, setText] = useState(query)
  const [search, setSearch] = useState(query)
  const [point, setPoint] = useState<Point | undefined>(isSet(value) ? value : undefined)
  const [place, setPlace] = useState<Place>()
  const map = useRef<MapLibreMap | null>(null)
  const marker = useRef<Marker | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setSearch(text.trim()), 400)
    return () => clearTimeout(id)
  }, [text])

  const focus = near && isSet(near) ? `&near=${near.lng},${near.lat}` : ''
  const results = useQuery({
    queryKey: ['places', search, focus],
    queryFn: () => api.get<{ places: Place[] }>(`/places?q=${encodeURIComponent(search)}${focus}`).then((r) => r.places),
    enabled: search.length >= 3,
    staleTime: Infinity,
    retry: false,
  })

  function move(next: Point, fly: boolean) {
    setPoint(next)
    if (!map.current) return
    if (!marker.current) {
      marker.current = new maplibregl.Marker({ draggable: true, color: '#3F5133' })
        .setLngLat([next.lng, next.lat])
        .addTo(map.current)
      marker.current.on('dragend', () => {
        const at = marker.current!.getLngLat()
        setPlace(undefined)
        setPoint({ lat: at.lat, lng: at.lng })
      })
    } else {
      marker.current.setLngLat([next.lng, next.lat])
    }
    if (fly) map.current.flyTo({ center: [next.lng, next.lat], zoom: 16 })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Ort wählen')}</DialogTitle>
          <DialogDescription>{t('Sucht nach Name oder Adresse, oder tippt auf die Karte. Die Markierung lässt sich verschieben.')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            aria-label={t('Ort suchen')}
            placeholder={t('z. B. Musikhochschule Freiburg')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {search.length >= 3 && (
          <ul className="max-h-40 overflow-y-auto rounded-md border text-sm">
            {results.isLoading && <li className="px-3 py-2 text-muted-foreground">{t('Suche …')}</li>}
            {results.isError && <li className="px-3 py-2 text-muted-foreground">{t('Die Suche ist gerade nicht verfügbar – tippt auf die Karte.')}</li>}
            {results.data?.length === 0 && <li className="px-3 py-2 text-muted-foreground">{t('Nichts gefunden.')}</li>}
            {results.data?.map((p) => (
              <li key={`${p.lat},${p.lng}`}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    setPlace(p)
                    move(p, true)
                  }}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <BaseMap
          className="h-[45svh] max-h-[420px] min-h-[260px] rounded-xl"
          onReady={(m) => {
            map.current = m
            m.getCanvas().style.cursor = 'crosshair'
            if (start) m.jumpTo({ center: [start.lng, start.lat], zoom: 15 })
            if (point) move(point, false)
            m.on('click', (e) => {
              setPlace(undefined)
              move({ lat: e.lngLat.lat, lng: e.lngLat.lng }, false)
            })
            return () => {
              marker.current = null
              map.current = null
            }
          }}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('Abbrechen')}
          </Button>
          <Button type="button" disabled={!point} onClick={() => point && onPick(point, place)}>
            {t('Übernehmen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
