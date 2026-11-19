import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useQuery } from '@tanstack/react-query'
import { BedDouble, Check, Home, Plus, Trash2 } from 'lucide-react'
import { t } from '@/lib/i18n'
import { api } from '@/lib/api'
import { distanceMeters, type LngLat } from '@/lib/geo'
import type { Hotel, StayKind, Travel } from '@/lib/types'
import { BaseMap, markerElement } from '@/components/public/BaseMap'
import { HEART_SVG } from '@/components/public/mapParts'
import { Panel, PlaceSearch, Row, formatMeters, isSet } from '@/components/admin/TravelEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Suggestion {
  name: string
  kind: StayKind
  website?: string
  lat: number
  lng: number
}

const svg = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

const STAY: Record<StayKind, { Icon: typeof Home; label: string; color: string; svg: string }> = {
  hotel: { Icon: BedDouble, label: 'Hotel', color: '#b58a4a', svg: svg('<path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M12 4v6"/><path d="M2 18h20"/>') },
  apartment: { Icon: Home, label: 'Ferienwohnung', color: '#7a6ea3', svg: svg('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>') },
}
const KINDS: StayKind[] = ['hotel', 'apartment']
const SAME_PLACE = 0.0004
const SHOWN = 5
const kindOf = (h: Hotel): StayKind => h.kind ?? 'hotel'
const suggestionKey = (s: Suggestion) => `sug:${s.lat},${s.lng}`

/** Map editor for the places to stay around the venue. */
export function StayEditor({ hotels, travel, onChange }: { hotels: Hotel[]; travel: Travel; onChange: (hotels: Hotel[]) => void }) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<StayKind[]>([])
  const elements = useRef(new Map<string, HTMLElement>())
  const hasVenue = isSet(travel)
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])

  // Marker handlers outlive renders; they read the latest state from here.
  const latest = useRef({ hotels, onChange })
  latest.current = { hotels, onChange }
  const setHotels = (next: Hotel[]) => latest.current.onChange(next)

  const around = `${travel.lng.toFixed(3)},${travel.lat.toFixed(3)}`
  const nearby = useQuery({
    queryKey: ['places', 'nearby', 'stay', around],
    queryFn: () => api.get<{ places: Suggestion[] }>(`/places/nearby?at=${around}&kind=stay`).then((r) => r.places),
    enabled: hasVenue,
    staleTime: Infinity,
    retry: false,
  })
  const suggestions = useMemo(
    () =>
      (nearby.data ?? [])
        .filter((s) => !hotels.some((h) => h.name === s.name || (Math.abs(h.lat - s.lat) < SAME_PLACE && Math.abs(h.lng - s.lng) < SAME_PLACE)))
        .map((s) => ({ ...s, meters: distanceMeters([s.lng, s.lat], venue) }))
        .sort((a, b) => a.meters - b.meters),
    [nearby.data, hotels, venue],
  )

  function add(hotel: Partial<Hotel> & { lat: number; lng: number }) {
    const list = latest.current.hotels
    setHotels([...list, { name: '', area: '', kind: 'hotel', priceTier: 2, note: '', url: '', bookingUrl: '', ...hotel }])
    setSelected(list.length)
  }
  const adopt = (s: Suggestion) => add({ name: s.name, kind: s.kind, url: s.website ?? '', lat: s.lat, lng: s.lng })

  useEffect(() => {
    if (!map) return
    const onClick = (e: maplibregl.MapMouseEvent) => add({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    map.on('click', onClick)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // Show the whole setup once when the map opens.
  const fitted = useRef(false)
  useEffect(() => {
    if (!map || fitted.current || !hasVenue) return
    fitted.current = true
    const bounds = new maplibregl.LngLatBounds(venue, venue)
    hotels.filter(isSet).forEach((h) => bounds.extend([h.lng, h.lat]))
    map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 0 })
  }, [map, hasVenue, venue, hotels])

  useEffect(() => {
    if (!map) return
    const markers: maplibregl.Marker[] = []
    const stop = (e: Event) => e.stopPropagation()
    const known = elements.current
    known.clear()
    const track = (key: string, el: HTMLElement) => {
      known.set(key, el)
      el.addEventListener('mouseenter', () => setHovered(key))
      el.addEventListener('mouseleave', () => setHovered(null))
    }

    for (const s of suggestions) {
      const el = markerElement(STAY[s.kind].svg, 'wed-marker wed-marker-stop wed-marker-suggestion')
      el.style.setProperty('--stop-color', STAY[s.kind].color)
      el.title = `${s.name} · ${formatMeters(s.meters)} – ${t('hinzufügen')}`
      track(suggestionKey(s), el)
      el.addEventListener('click', (e) => {
        stop(e)
        adopt(s)
      })
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map))
    }

    hotels.forEach((h, i) => {
      if (!isSet(h)) return
      const el = markerElement(STAY[kindOf(h)].svg, `wed-marker wed-marker-stop${selected === i ? ' is-selected' : ''}`)
      el.style.setProperty('--stop-color', STAY[kindOf(h)].color)
      el.title = h.name
      track(`stay:${i}`, el)
      el.addEventListener('click', (e) => {
        stop(e)
        setSelected(i)
      })
      const marker = new maplibregl.Marker({ element: el, anchor: 'center', draggable: true }).setLngLat([h.lng, h.lat]).addTo(map)
      marker.on('dragend', () => {
        const at = marker.getLngLat()
        setHotels(latest.current.hotels.map((item, j) => (j === i ? { ...item, lat: at.lat, lng: at.lng } : item)))
      })
      markers.push(marker)
    })

    if (hasVenue) {
      const el = markerElement(HEART_SVG, 'wed-marker wed-marker-venue')
      el.addEventListener('click', stop)
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(venue).addTo(map))
    }
    return () => markers.forEach((m) => m.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hotels, suggestions, selected, hasVenue, venue])

  useEffect(() => {
    const el = hovered ? elements.current.get(hovered) : undefined
    el?.classList.add('is-hovered')
    return () => el?.classList.remove('is-hovered')
  }, [hovered, hotels, suggestions, selected])

  const current = selected !== null ? hotels[selected] : undefined
  const update = (patch: Partial<Hotel>) => setHotels(hotels.map((h, i) => (i === selected ? { ...h, ...patch } : h)))
  const remove = (index: number) => {
    setHotels(hotels.filter((_, i) => i !== index))
    setSelected(null)
  }
  const flyTo = (p: { lat: number; lng: number }) => map?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), offset: [-120, -180] })

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {hasVenue
          ? t('Wählt aus den Vorschlägen, sucht eine Unterkunft oder tippt auf die Karte. Bewertungen, Preise und freie Zimmer kennt die Karte nicht – prüft sie vor dem Empfehlen selbst.')
          : t('Setzt zuerst unter „Anreise“ die Location – dann schlagen wir Unterkünfte in der Nähe vor.')}
      </p>
      <PlaceSearch
        near={hasVenue ? travel : undefined}
        initial=""
        onPick={(p) => {
          add({ name: p.name, lat: p.lat, lng: p.lng })
          flyTo(p)
        }}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_17rem]">
        <BaseMap onReady={setMap} className="h-[70svh] max-h-[640px] min-h-[360px] rounded-xl">
          {current && (
            <Panel onClose={() => setSelected(null)} title={current.name || t('Neue Unterkunft')}>
              <div className="grid max-h-[40svh] gap-3 overflow-y-auto sm:grid-cols-2">
                <Text id="stay-name" label={t('Name')} value={current.name} onChange={(v) => update({ name: v })} />
                <Text id="stay-area" label={t('Stadtteil')} value={current.area} onChange={(v) => update({ area: v })} />
                <div className="space-y-1.5">
                  <Label>{t('Art')}</Label>
                  <Select value={kindOf(current)} onValueChange={(v) => update({ kind: v as StayKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => (
                        <SelectItem key={k} value={k}>{t(STAY[k].label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('Preisklasse')}</Label>
                  <Select value={String(current.priceTier)} onValueChange={(v) => update({ priceTier: Number(v) as Hotel['priceTier'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('€ günstig')}</SelectItem>
                      <SelectItem value="2">{t('€€ mittel')}</SelectItem>
                      <SelectItem value="3">{t('€€€ gehoben')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Text id="stay-url" label={t('Website')} value={current.url} onChange={(v) => update({ url: v })} />
                <Text id="stay-booking" label={t('Booking-Link (Hotelseite)')} value={current.bookingUrl ?? ''} onChange={(v) => update({ bookingUrl: v })} />
                {!current.bookingUrl && (
                  <p className="text-xs text-amber-700 sm:col-span-2">
                    {t('Ohne Link zur Booking-Hotelseite öffnet der Button nur die Booking-Suche – und die meldet für weit entfernte Termine oft fälschlich „nicht verfügbar“.')}
                  </p>
                )}
                <Text id="stay-note" label={t('Hinweis')} value={current.note} onChange={(v) => update({ note: v })} className="sm:col-span-2" />
              </div>
              <Button type="button" size="sm" variant="ghost" className="mt-2 text-destructive" onClick={() => remove(selected!)}>
                <Trash2 /> {t('Entfernen')}
              </Button>
            </Panel>
          )}
        </BaseMap>
        <aside className="space-y-4 text-sm lg:h-[70svh] lg:max-h-[640px] lg:overflow-y-auto">
          {KINDS.map((kind) => {
            const { Icon, label, color } = STAY[kind]
            const offered = suggestions.filter((s) => s.kind === kind)
            const set = hotels.map((h, i) => ({ h, i })).filter(({ h }) => kindOf(h) === kind)
            if (offered.length === 0 && set.length === 0) return null
            const all = expanded.includes(kind)
            return (
              <section key={kind}>
                <h3 className="mb-1 flex items-center gap-1.5 font-medium">
                  <Icon className="size-4" style={{ color }} /> {t(label)}
                </h3>
                <ul className="space-y-0.5">
                  {set.map(({ h, i }) => (
                    <Row
                      key={i}
                      active={selected === i || hovered === `stay:${i}`}
                      onHover={(on) => setHovered(on ? `stay:${i}` : null)}
                      icon={<Check className="size-4 text-primary" />}
                      label={h.name || t('Ohne Namen')}
                      detail={isSet(h) && hasVenue ? formatMeters(distanceMeters([h.lng, h.lat], venue)) : undefined}
                      onClick={() => {
                        setSelected(i)
                        if (isSet(h)) flyTo(h)
                      }}
                      onRemove={() => remove(i)}
                    />
                  ))}
                  {(all ? offered : offered.slice(0, SHOWN)).map((s) => (
                    <Row
                      key={suggestionKey(s)}
                      active={hovered === suggestionKey(s)}
                      onHover={(on) => setHovered(on ? suggestionKey(s) : null)}
                      icon={<Plus className="size-4 text-muted-foreground" />}
                      label={s.name}
                      detail={formatMeters(s.meters)}
                      muted
                      onClick={() => {
                        adopt(s)
                        flyTo(s)
                      }}
                    />
                  ))}
                </ul>
                {offered.length > SHOWN && (
                  <button type="button" className="mt-1 px-2 text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setExpanded(all ? expanded.filter((k) => k !== kind) : [...expanded, kind])}>
                    {all ? t('Weniger anzeigen') : `${offered.length - SHOWN} ${t('weitere anzeigen')}`}
                  </button>
                )}
              </section>
            )
          })}
          {hotels.length === 0 && suggestions.length === 0 && <p className="text-muted-foreground">{t('Noch keine Unterkünfte.')}</p>}
        </aside>
      </div>
    </div>
  )
}

function Text({ id, label, value, onChange, className }: { id: string; label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
