import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { CalendarDays, Car, ExternalLink, Footprints, Home, MapPin, Sparkles, TramFront, Wine } from 'lucide-react'
import type { Accommodation, Hotel, Stop, Travel } from '@/lib/types'
import {
  airbnbUrl,
  bookingUrl,
  distanceMeters,
  formatKm,
  formatStayDates,
  METERS_PER_MINUTE,
  routeQuery,
  TRAM_WAIT_MINUTES,
  transitDirectionsUrl,
  transitRoute,
  type TransitLine,
  WALK_MAX_MINUTES,
  type LngLat,
  type Route,
} from '@/lib/geo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'
import type { TravelMode } from './TravelMap'

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'

const TIER = { 1: { label: '€', hint: 'günstig' }, 2: { label: '€€', hint: 'mittel' }, 3: { label: '€€€', hint: 'gehoben' } } as const

const WALK_METERS_PER_MINUTE = METERS_PER_MINUTE.foot
const TRAM_METERS_PER_MINUTE = METERS_PER_MINUTE.transit

const MODE: Record<TravelMode, { label: string; Icon: typeof Footprints; intro: string }> = {
  transit: { label: 'Tram', Icon: TramFront, intro: 'Sortiert nach Fahrzeit mit der Tram bis zur Haltestelle plus kurzem Fußweg.' },
  foot: { label: 'Zu Fuß', Icon: Footprints, intro: `Nur Unterkünfte bis ${WALK_MAX_MINUTES} Minuten Fußweg – zum Feiern und Heimschlendern.` },
  car: { label: 'Auto', Icon: Car, intro: 'Sortiert nach Fahrzeit – ideal, um das Auto am Hotel stehen zu lassen.' },
}

type Ranked = Hotel & {
  foot?: Route
  car?: Route
  transit: { stop: Stop; rideMinutes: number; totalMinutes: number } | null
  minutes: number
}

export function StayMap({
  accommodation,
  travel,
  city,
  mode,
  onModeChange,
}: {
  accommodation: Accommodation
  travel: Travel
  city: string
  mode: TravelMode
  onModeChange: (mode: TravelMode) => void
}) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const hasVenue = travel.lat !== 0 || travel.lng !== 0
  const { checkIn, checkOut } = accommodation
  const stops = useMemo(() => travel.stops.filter((s) => s.kind !== 'parking'), [travel.stops])

  const footRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('foot', [h.lng, h.lat], venue), enabled: hasVenue })) })
  const carRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('car', [h.lng, h.lat], venue), enabled: hasVenue })) })

  const hotels = useMemo<Ranked[]>(() => {
    const ranked = accommodation.hotels.map((h, i): Ranked => {
      const here: LngLat = [h.lng, h.lat]
      const foot = footRoutes[i].data
      const car = carRoutes[i].data
      const transit = viaStop(here, stops[0], venue, travel.lines[0])
      const fallbackWalk = hasVenue ? (distanceMeters(here, venue) * 1.3) / WALK_METERS_PER_MINUTE : 0
      const minutes =
        mode === 'foot' ? (foot?.minutes ?? fallbackWalk)
        : mode === 'car' ? (car?.minutes ?? fallbackWalk / 6)
        : (transit?.totalMinutes ?? foot?.minutes ?? fallbackWalk)
      return { ...h, foot, car, transit, minutes }
    })
    const sorted = ranked.sort((a, b) => a.minutes - b.minutes)
    return mode === 'foot' ? sorted.filter((h) => h.minutes <= WALK_MAX_MINUTES) : sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodation.hotels, stops, venue, hasVenue, mode, ...footRoutes.map((r) => r.data), ...carRoutes.map((r) => r.data)])

  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    if (!map) return
    const markers: maplibregl.Marker[] = []
    const bounds = new maplibregl.LngLatBounds()
    if (hasVenue) {
      markers.push(new maplibregl.Marker({ element: markerElement(HEART_SVG, 'wed-marker wed-marker-venue'), anchor: 'center' }).setLngLat(venue).addTo(map))
      bounds.extend(venue)
    }
    hotels.forEach((h, i) => {
      const el = markerElement(`<span>${i + 1}</span>`, 'wed-marker wed-marker-hotel')
      el.title = h.name
      el.addEventListener('mouseenter', () => setActive(i))
      el.addEventListener('mouseleave', () => setActive(null))
      el.addEventListener('click', () => document.getElementById(`hotel-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
      markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([h.lng, h.lat]).addTo(map))
      bounds.extend([h.lng, h.lat])
    })
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 })
    return () => markers.forEach((m) => m.remove())
  }, [map, hotels, hasVenue, venue])

  useEffect(() => {
    if (!map) return
    map.getContainer().querySelectorAll<HTMLElement>('.wed-marker-hotel').forEach((el, i) => el.classList.toggle('is-active', i === active))
  }, [map, active])

  const stay = formatStayDates(checkIn, checkOut)

  return (
    <div className="space-y-8">
      <div className="space-y-4 text-center">
        <div role="radiogroup" aria-label="Anreise" className="inline-flex rounded-full border bg-card p-1 shadow-sm">
          {(Object.keys(MODE) as TravelMode[]).map((m) => {
            const { label, Icon } = MODE[m]
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => onModeChange(m)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors',
                  mode === m ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground">{MODE[mode].intro}</p>
        {mode === 'car' && (
          <p className="mx-auto flex max-w-xl items-start gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-left text-sm">
            <Wine className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Es wird wahrscheinlich angestoßen – parkt am besten am Hotel und kommt zu Fuß oder mit der Tram zur Location.
              Deshalb zeigen wir euch auch diese Wege.
            </span>
          </p>
        )}
        {stay && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4 text-primary" /> Alle Links sind bereits für <strong className="text-foreground">{stay}</strong> vorausgefüllt.
          </p>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <BaseMap onReady={setMap} className="h-[380px] lg:sticky lg:top-24 lg:col-span-3 lg:h-[640px]" />
        <ol className="space-y-3 lg:col-span-2">
          {hotels.length === 0 && (
            <li className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
              Keine Unterkunft liegt in Gehweite – schaut bei Tram oder Auto.
            </li>
          )}
          {hotels.map((h, i) => (
            <HotelCard
              key={h.name}
              index={i}
              hotel={h}
              mode={mode}
              venue={hasVenue ? venue : null}
              active={active === i}
              city={city}
              checkIn={checkIn}
              checkOut={checkOut}
              onEnter={() => {
                setActive(i)
                map?.easeTo({ center: [h.lng, h.lat], duration: 600 })
              }}
              onLeave={() => setActive(null)}
            />
          ))}
        </ol>
      </div>
      <div className="rounded-3xl border border-gold/40 bg-card/70 p-6 md:flex md:items-center md:justify-between md:gap-6">
        <div className="flex items-start gap-3">
          <Home className="mt-1 size-5 shrink-0 text-sage" />
          <div>
            <h3 className="text-xl">Lieber eine Ferienwohnung?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Rund um die Location und in der Wiehre gibt es viele Wohnungen. Die Suchen sind mit den Daten vorausgefüllt.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
          <Button asChild variant="outline">
            <a href={airbnbUrl(city, checkIn, checkOut)} target="_blank" rel="noreferrer">
              Airbnb <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={bookingUrl(`${city} Ferienwohnung`, checkIn, checkOut)} target="_blank" rel="noreferrer">
              Booking.com <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

function viaStop(from: LngLat, stop: Stop | undefined, venue: LngLat, line?: TransitLine): Ranked['transit'] {
  if (!stop) return null
  const at: LngLat = [stop.lng, stop.lat]
  const walkMinutes = Math.round((distanceMeters(at, venue) * 1.3) / WALK_METERS_PER_MINUTE)
  if (line) {
    const ride = transitRoute(line, from, at)
    return { stop, rideMinutes: ride.minutes, totalMinutes: ride.minutes + walkMinutes }
  }
  const rideMinutes = Math.round(distanceMeters(from, at) / TRAM_METERS_PER_MINUTE)
  return { stop, rideMinutes, totalMinutes: TRAM_WAIT_MINUTES + rideMinutes + walkMinutes }
}

function HotelCard({
  index,
  hotel,
  mode,
  venue,
  active,
  city,
  checkIn,
  checkOut,
  onEnter,
  onLeave,
}: {
  index: number
  hotel: Ranked
  mode: TravelMode
  venue: LngLat | null
  active: boolean
  city: string
  checkIn: string
  checkOut: string
  onEnter: () => void
  onLeave: () => void
}) {
  const tier = TIER[hotel.priceTier] ?? TIER[2]
  return (
    <li
      id={`hotel-${index}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        'rounded-2xl border bg-card p-5 transition-all',
        active ? 'border-primary shadow-lg' : 'border-border/60',
      )}
    >
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg text-primary-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xl leading-tight">{hotel.name}</h3>
            <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-foreground/80" title={tier.hint}>
              {tier.label}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {index === 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Sparkles className="size-3.5" /> Unser Tipp für {MODE[mode].label}
              </span>
            )}
            {hotel.area && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {hotel.area}
              </span>
            )}
          </p>
          {hotel.note && <p className="mt-2 text-sm text-foreground/80">{hotel.note}</p>}
          {venue && <TravelTimes hotel={hotel} mode={mode} venue={venue} />}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href={bookingUrl(`${hotel.name} ${city}`, checkIn, checkOut)} target="_blank" rel="noreferrer">
                Verfügbarkeit prüfen
              </a>
            </Button>
            {hotel.url && (
              <Button asChild size="sm" variant="ghost">
                <a href={hotel.url} target="_blank" rel="noreferrer">
                  Website <ExternalLink className="size-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

function TravelTimes({ hotel, mode, venue }: { hotel: Ranked; mode: TravelMode; venue: LngLat }) {
  const here: LngLat = [hotel.lng, hotel.lat]
  const row = (m: TravelMode) => cn('flex items-center gap-1.5', mode === m ? 'font-medium text-foreground' : 'text-muted-foreground')
  const fmt = (r?: Route) => (r ? `${r.minutes} Min · ${formatKm(r.meters)}${r.estimated ? ' (geschätzt)' : ''}` : '…')
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <li className={row('transit')}>
        <TramFront className="size-3.5" />
        {hotel.transit ? (
          <a href={transitDirectionsUrl(here, venue)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            ca. {hotel.transit.totalMinutes} Min · {hotel.transit.stop.kind === 'tram' ? 'Tram' : 'Bahn'} bis {hotel.transit.stop.name}
          </a>
        ) : (
          <a href={transitDirectionsUrl(here, venue)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
            Verbindung anzeigen
          </a>
        )}
      </li>
      <li className={cn(row('foot'), hotel.foot && hotel.foot.minutes > WALK_MAX_MINUTES && 'line-through opacity-60')}>
        <Footprints className="size-3.5" /> {fmt(hotel.foot)}
      </li>
      <li className={row('car')}>
        <Car className="size-3.5" /> {fmt(hotel.car)}
      </li>
    </ul>
  )
}
