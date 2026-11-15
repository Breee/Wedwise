import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Heart, Search, Trash2, X } from 'lucide-react'
import { t } from '@/lib/i18n'
import { api } from '@/lib/api'
import { routeQuery, type LngLat } from '@/lib/geo'
import type { Stop, StopKind, Travel } from '@/lib/types'
import { BaseMap, markerElement } from '@/components/public/BaseMap'
import { ICON_SVG, KIND } from '@/components/public/TravelMap'
import { HEART_SVG, drawRoutes } from '@/components/public/mapParts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Place {
  name: string
  label: string
  lat: number
  lng: number
}

type Suggestion = Pick<Stop, 'name' | 'kind' | 'lat' | 'lng'>

const KINDS: StopKind[] = ['tram', 'bus', 'train', 'parking']
// A suggestion this close to a stop of the same kind is already on the map.
const SAME_PLACE = 0.0004
const isSet = (p: { lat: number; lng: number }) => p.lat !== 0 || p.lng !== 0
const fallbackName = (kind: StopKind) => (kind === 'parking' ? t('Parkplatz') : '')

/** Map editor for the venue and the stops and car parks around it. */
export function TravelEditor({ travel, query, onChange }: { travel: Travel; query: string; onChange: (travel: Travel) => void }) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null)
  const hasVenue = isSet(travel)
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])

  // Marker handlers outlive renders; they read the latest state from here.
  const latest = useRef({ travel, onChange })
  latest.current = { travel, onChange }
  const setStops = (stops: Stop[]) => latest.current.onChange({ ...latest.current.travel, stops })

  const nearby = useQuery({
    queryKey: ['places', 'nearby', travel.lng, travel.lat],
    queryFn: () => api.get<{ places: Suggestion[] }>(`/places/nearby?at=${travel.lng},${travel.lat}`).then((r) => r.places),
    enabled: hasVenue,
    staleTime: Infinity,
    retry: false,
  })
  const suggestions = useMemo(
    () =>
      (nearby.data ?? []).filter(
        (s) => !travel.stops.some((stop) => stop.kind === s.kind && Math.abs(stop.lat - s.lat) < SAME_PLACE && Math.abs(stop.lng - s.lng) < SAME_PLACE),
      ),
    [nearby.data, travel.stops],
  )

  const routed = useMemo(() => travel.stops.filter((s) => s.kind !== 'parking' && isSet(s)), [travel.stops])
  const routes = useQueries({ queries: routed.map((s) => ({ ...routeQuery('foot', [s.lng, s.lat], venue), enabled: hasVenue })) })
  const resolved = routes.map((r) => r.data)

  useEffect(() => {
    if (!map) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      setSelected(null)
      setPending({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    }
    map.on('click', onClick)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', onClick)
    }
  }, [map])

  // Show the whole setup once when the map opens.
  const fitted = useRef(false)
  useEffect(() => {
    if (!map || fitted.current || !hasVenue) return
    fitted.current = true
    const bounds = new maplibregl.LngLatBounds(venue, venue)
    travel.stops.filter(isSet).forEach((s) => bounds.extend([s.lng, s.lat]))
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 })
  }, [map, hasVenue, venue, travel.stops])

  useEffect(() => {
    if (!map) return
    const markers: maplibregl.Marker[] = []
    const stop = (e: Event) => e.stopPropagation()

    for (const s of suggestions) {
      const el = markerElement(ICON_SVG[s.kind], 'wed-marker wed-marker-stop wed-marker-suggestion')
      el.style.setProperty('--stop-color', KIND[s.kind].color)
      el.title = `${s.name || t(KIND[s.kind].label)} – ${t('hinzufügen')}`
      el.addEventListener('click', (e) => {
        stop(e)
        const stops = latest.current.travel.stops
        setStops([...stops, { name: s.name || fallbackName(s.kind), kind: s.kind, line: '', lat: s.lat, lng: s.lng }])
        setPending(null)
        setSelected(stops.length)
      })
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map))
    }

    travel.stops.forEach((s, i) => {
      if (!isSet(s)) return
      const el = markerElement(ICON_SVG[s.kind], `wed-marker wed-marker-stop${selected === i ? ' is-selected' : ''}`)
      el.style.setProperty('--stop-color', KIND[s.kind].color)
      el.title = s.name
      el.addEventListener('click', (e) => {
        stop(e)
        setPending(null)
        setSelected(i)
      })
      const marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true }).setLngLat([s.lng, s.lat]).addTo(map)
      marker.on('dragend', () => {
        const at = marker.getLngLat()
        setStops(latest.current.travel.stops.map((item, j) => (j === i ? { ...item, lat: at.lat, lng: at.lng } : item)))
      })
      markers.push(marker)
    })

    if (hasVenue) {
      const el = markerElement(HEART_SVG, 'wed-marker wed-marker-venue')
      el.title = t('Location – zum Verschieben ziehen')
      el.addEventListener('click', stop)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true }).setLngLat(venue).addTo(map)
      marker.on('dragend', () => {
        const at = marker.getLngLat()
        latest.current.onChange({ ...latest.current.travel, lat: at.lat, lng: at.lng })
      })
      markers.push(marker)
    }

    if (pending) {
      markers.push(new maplibregl.Marker({ element: markerElement('', 'wed-marker-pending'), anchor: 'center' }).setLngLat([pending.lng, pending.lat]).addTo(map))
    }
    return () => markers.forEach((m) => m.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, travel.stops, suggestions, selected, pending, hasVenue, venue])

  useEffect(() => {
    if (!map) return
    return drawRoutes(
      map,
      resolved.flatMap((route, i) => (route && !route.estimated ? [{ route, color: KIND[routed[i].kind].color, id: i }] : [])),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routed, ...resolved])

  const current = selected !== null ? travel.stops[selected] : undefined
  const update = (patch: Partial<Stop>) => setStops(travel.stops.map((s, i) => (i === selected ? { ...s, ...patch } : s)))

  function add(kind: StopKind) {
    if (!pending) return
    setStops([...travel.stops, { name: fallbackName(kind), kind, line: '', ...pending }])
    setSelected(travel.stops.length)
    setPending(null)
  }

  function setVenue(point: { lat: number; lng: number }, fly: boolean) {
    onChange({ ...travel, lat: point.lat, lng: point.lng })
    setPending(null)
    if (fly) map?.flyTo({ center: [point.lng, point.lat], zoom: 15 })
  }

  return (
    <div className="space-y-3">
      <PlaceSearch near={hasVenue ? travel : undefined} initial={hasVenue ? '' : query} onPick={(p) => (hasVenue ? map?.flyTo({ center: [p.lng, p.lat], zoom: 16 }) : setVenue(p, true))} />
      <p className="text-sm text-muted-foreground">
        {hasVenue
          ? t('Tippt auf einen blassen Vorschlag, um ihn zu übernehmen, oder auf eine freie Stelle, um dort etwas hinzuzufügen. Alles lässt sich verschieben.')
          : t('Sucht eure Location oder tippt auf die Karte, um sie zu setzen.')}
      </p>
      <BaseMap onReady={setMap} className="h-[70svh] max-h-[640px] min-h-[360px] rounded-xl">
        {pending && (
          <Panel onClose={() => setPending(null)} title={hasVenue ? t('Hier hinzufügen') : t('Hier ist die Location?')}>
            <div className="flex flex-wrap gap-2">
              {hasVenue &&
                KINDS.map((kind) => {
                  const { Icon, label, color } = KIND[kind]
                  return (
                    <Button key={kind} type="button" size="sm" variant="outline" onClick={() => add(kind)}>
                      <Icon style={{ color }} /> {t(label)}
                    </Button>
                  )
                })}
              <Button type="button" size="sm" variant={hasVenue ? 'ghost' : 'default'} onClick={() => setVenue(pending, false)}>
                <Heart /> {hasVenue ? t('Location hierher setzen') : t('Location setzen')}
              </Button>
            </div>
          </Panel>
        )}
        {current && (
          <Panel onClose={() => setSelected(null)} title={t(KIND[current.kind].label)}>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="stop-name">{t('Name')}</Label>
                <Input id="stop-name" value={current.name} onChange={(e) => update({ name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stop-line">{t('Linie')}</Label>
                <Input id="stop-line" value={current.line} placeholder={current.kind === 'parking' ? '–' : '1 → …'} onChange={(e) => update({ line: e.target.value })} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {KINDS.map((kind) => {
                const { Icon, label, color } = KIND[kind]
                return (
                  <Button key={kind} type="button" size="sm" variant={current.kind === kind ? 'secondary' : 'ghost'} aria-pressed={current.kind === kind} onClick={() => update({ kind })}>
                    <Icon style={{ color }} /> {t(label)}
                  </Button>
                )
              })}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={() => {
                  setStops(travel.stops.filter((_, i) => i !== selected))
                  setSelected(null)
                }}
              >
                <Trash2 /> {t('Entfernen')}
              </Button>
            </div>
          </Panel>
        )}
      </BaseMap>
      {travel.stops.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {travel.stops.map((s, i) => {
            const { Icon, color } = KIND[s.kind]
            return (
              <li key={i}>
                <Button
                  type="button"
                  size="sm"
                  variant={selected === i ? 'secondary' : 'outline'}
                  onClick={() => {
                    setPending(null)
                    setSelected(i)
                    if (isSet(s)) map?.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 15) })
                  }}
                >
                  <Icon style={{ color }} /> {s.name || t('Ohne Namen')}
                  {s.line && <span className="text-muted-foreground">· {s.line}</span>}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:w-[26rem]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={t('Schließen')} onClick={onClose}>
          <X />
        </Button>
      </div>
      {children}
    </div>
  )
}

function PlaceSearch({ near, initial, onPick }: { near?: { lat: number; lng: number }; initial: string; onPick: (place: Place) => void }) {
  const [text, setText] = useState(initial)
  const [search, setSearch] = useState(initial)
  const [open, setOpen] = useState(initial.length >= 3)

  useEffect(() => {
    const id = setTimeout(() => setSearch(text.trim()), 400)
    return () => clearTimeout(id)
  }, [text])

  const focus = near ? `&near=${near.lng},${near.lat}` : ''
  const results = useQuery({
    queryKey: ['places', search, focus],
    queryFn: () => api.get<{ places: Place[] }>(`/places?q=${encodeURIComponent(search)}${focus}`).then((r) => r.places),
    enabled: search.length >= 3,
    staleTime: Infinity,
    retry: false,
  })

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          aria-label={t('Ort suchen')}
          placeholder={t('Ort oder Adresse suchen')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
        />
      </div>
      {open && search.length >= 3 && (
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
                  setOpen(false)
                  onPick(p)
                }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
