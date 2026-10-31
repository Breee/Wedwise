import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Bike, CalendarDays, Car, ChevronDown, ExternalLink, Footprints, Home, MapPin, TramFront } from 'lucide-react'
import type { Accommodation, Hotel, Stop, Travel } from '@/lib/types'
import {
  airbnbUrl,
  bookingUrl,
  hotelBookingUrl,
  distanceMeters,
  formatStayDates,
  METERS_PER_MINUTE,
  routeQuery,
  TRAM_WAIT_MINUTES,
  googleDirectionsUrl,
  transitRoute,
  type TransitLine,
  WALK_MAX_MINUTES,
  type LngLat,
  type Route,
} from '@/lib/geo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'
import { drawRoutes, drawTransitLines, fitPadding, venueMarker, type RouteFeature } from './mapParts'
import { KIND } from './TravelMap'

const INITIAL_VISIBLE = 3

const TIER = { 1: { label: '€', hint: 'günstig' }, 2: { label: '€€', hint: 'mittel' }, 3: { label: '€€€', hint: 'gehoben' } } as const
const FOOT_COLOR = '#5e7f63'

type Transit = { stop: Stop; ride: Route; totalMinutes: number }
// walk: walking is realistic (≤ WALK_MAX_MINUTES) and not slower than the tram.
type Ranked = Hotel & { foot?: Route; bike?: Route; car?: Route; transit: Transit | null; walk: boolean; minutes: number }

export function StayMap({ accommodation, travel, city }: { accommodation: Accommodation; travel: Travel; city: string }) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const hasVenue = travel.lat !== 0 || travel.lng !== 0
  const { checkIn: firstCheckIn, checkOut } = accommodation
  const arrivalDays = useMemo(() => datesBetween(firstCheckIn, checkOut), [firstCheckIn, checkOut])
  const [checkIn, setCheckIn] = useState(firstCheckIn)
  const stop = useMemo(() => travel.stops.find((s) => s.kind !== 'parking'), [travel.stops])
  const line = travel.lines.find((l) => l.kind === 'tram')

  const footRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('foot', [h.lng, h.lat], venue), enabled: hasVenue })) })
  const bikeRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('bike', [h.lng, h.lat], venue), enabled: hasVenue })) })
  const carRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('car', [h.lng, h.lat], venue), enabled: hasVenue })) })
  const stopWalk = useQuery({
    ...routeQuery('foot', stop ? [stop.lng, stop.lat] : venue, venue),
    enabled: hasVenue && !!stop,
  })

  const hotels = useMemo<Ranked[]>(() => {
    const ranked = accommodation.hotels.map((h, i): Ranked => {
      const here: LngLat = [h.lng, h.lat]
      const foot = footRoutes[i].data
      const bike = bikeRoutes[i].data
      const car = carRoutes[i].data
      const transit = viaStop(here, stop, venue, line, stopWalk.data)
      const fallbackWalk = hasVenue ? (distanceMeters(here, venue) * 1.3) / METERS_PER_MINUTE.foot : 0
      const walk = !!foot && foot.minutes <= WALK_MAX_MINUTES && (!transit || foot.minutes <= transit.totalMinutes)
      const minutes = walk ? foot!.minutes : (transit?.totalMinutes ?? foot?.minutes ?? fallbackWalk)
      return { ...h, foot, bike, car, transit, walk, minutes }
    })
    return ranked.sort((a, b) => a.minutes - b.minutes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodation.hotels, stop, venue, hasVenue, line, stopWalk.data, ...footRoutes.map((r) => r.data), ...bikeRoutes.map((r) => r.data), ...carRoutes.map((r) => r.data)])

  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? hotels : hotels.slice(0, INITIAL_VISIBLE)
  const selectedIndex = hotels.findIndex((h) => h.name === selected)
  const active = hover ?? (selectedIndex >= 0 ? selectedIndex : null)

  useEffect(() => {
    if (!map) return
    const markers: maplibregl.Marker[] = []
    const bounds = new maplibregl.LngLatBounds()
    if (hasVenue) {
      markers.push(venueMarker(map, venue))
      bounds.extend(venue)
    }
    hotels.forEach((h, i) => {
      const el = markerElement(`<span>${i + 1}</span>`, 'wed-marker wed-marker-hotel')
      el.title = h.name
      el.addEventListener('mouseenter', () => setHover(i))
      el.addEventListener('mouseleave', () => setHover(null))
      el.addEventListener('click', () => {
        setSelected(h.name)
        if (i >= INITIAL_VISIBLE) setShowAll(true)
        requestAnimationFrame(() => document.getElementById(`hotel-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
      })
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([h.lng, h.lat]).addTo(map))
      bounds.extend([h.lng, h.lat])
    })
    if (!bounds.isEmpty() && selectedIndex < 0) map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: 14, duration: 0 })
    return () => markers.forEach((m) => m.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hotels, hasVenue, venue])

  useEffect(() => {
    if (!map) return
    map.getContainer().querySelectorAll<HTMLElement>('.wed-marker-hotel').forEach((el, i) => el.classList.toggle('is-active', i === active))
  }, [map, active])

  useEffect(() => {
    if (!map) return
    drawTransitLines(map, travel.lines, KIND.tram.color)
  }, [map, travel.lines])

  // Draw the selected hotel's best route: walk, or tram + walk from the stop.
  useEffect(() => {
    if (!map) return
    const hotel = selectedIndex >= 0 ? hotels[selectedIndex] : undefined
    const features: RouteFeature[] = []
    if (hotel) {
      if (hotel.walk && hotel.foot) features.push({ route: hotel.foot, color: FOOT_COLOR, id: 0 })
      else if (hotel.transit) {
        features.push({ route: hotel.transit.ride, color: KIND.tram.color, id: 0 })
        if (stopWalk.data) features.push({ route: stopWalk.data, color: FOOT_COLOR, id: 1 })
      }
    }
    const cleanup = drawRoutes(map, features)
    if (hotel) {
      const bounds = new maplibregl.LngLatBounds(venue, venue)
      bounds.extend([hotel.lng, hotel.lat])
      features.forEach((f) => f.route.coordinates.forEach((c) => bounds.extend(c)))
      map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: 15, duration: 800 })
      if (window.innerWidth < 1024) {
        const top = map.getContainer().getBoundingClientRect().top + window.scrollY - 80
        window.scrollTo({ top, behavior: 'smooth' })
      }
    }
    return cleanup
  }, [map, hotels, selectedIndex, stopWalk.data, venue])

  const stay = formatStayDates(checkIn, checkOut)

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>Sortiert nach Weg zur Location – zu Fuß oder mit der Tram.</p>
        {arrivalDays.length > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-2" role="radiogroup" aria-label="Anreisetag">
            <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-primary" /> Anreise am</span>
            {arrivalDays.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={d === checkIn}
                onClick={() => setCheckIn(d)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  d === checkIn ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary/60',
                )}
              >
                {formatDay(d)}
              </button>
            ))}
          </div>
        )}
        {stay && (
          <p>
            Alle Links sind für <strong className="whitespace-nowrap text-foreground">{stay}</strong> vorausgefüllt.
          </p>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <BaseMap onReady={setMap} className="h-[50svh] max-h-[640px] min-h-[300px] lg:sticky lg:top-24 lg:col-span-3 lg:h-[640px]">
          {selectedIndex < 0 && (
            <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur sm:text-sm">
              Unterkunft auswählen, um den Weg zu sehen
            </div>
          )}
        </BaseMap>
        <ol className="space-y-3 lg:col-span-2">
          {visible.map((h, i) => (
            <HotelCard
              key={h.name}
              index={i}
              hotel={h}
              venue={hasVenue ? venue : null}
              active={active === i}
              selected={selectedIndex === i}
              city={city}
              checkIn={checkIn}
              checkOut={checkOut}
              onSelect={() => setSelected(selectedIndex === i ? null : h.name)}
              onEnter={() => setHover(i)}
              onLeave={() => setHover(null)}
            />
          ))}
          {!showAll && hotels.length > INITIAL_VISIBLE && (
            <li>
              <Button variant="outline" className="w-full" onClick={() => setShowAll(true)}>
                Alle {hotels.length} anzeigen <ChevronDown className="size-4" />
              </Button>
            </li>
          )}
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
            <a href={bookingUrl(city, checkIn, checkOut, 'ht_id=201')} target="_blank" rel="noreferrer">
              Booking.com <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

function viaStop(from: LngLat, stop: Stop | undefined, venue: LngLat, line: TransitLine | undefined, stopWalk: Route | undefined): Transit | null {
  if (!stop) return null
  const at: LngLat = [stop.lng, stop.lat]
  const walkMinutes = stopWalk?.minutes ?? Math.round((distanceMeters(at, venue) * 1.3) / METERS_PER_MINUTE.foot)
  const ride: Route = line
    ? transitRoute(line, from, at)
    : {
        coordinates: [from, at],
        meters: distanceMeters(from, at),
        minutes: TRAM_WAIT_MINUTES + Math.round(distanceMeters(from, at) / METERS_PER_MINUTE.transit),
        estimated: true,
      }
  return { stop, ride, totalMinutes: ride.minutes + walkMinutes }
}

function HotelCard({
  index,
  hotel,
  venue,
  active,
  selected,
  city,
  checkIn,
  checkOut,
  onSelect,
  onEnter,
  onLeave,
}: {
  index: number
  hotel: Ranked
  venue: LngLat | null
  active: boolean
  selected: boolean
  city: string
  checkIn: string
  checkOut: string
  onSelect: () => void
  onEnter: () => void
  onLeave: () => void
}) {
  const tier = TIER[hotel.priceTier] ?? TIER[2]
  return (
    <li
      id={`hotel-${index}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        'cursor-pointer rounded-2xl border bg-card p-5 transition-all',
        selected ? 'border-primary bg-primary/5 shadow-lg' : active ? 'border-primary/60 shadow-lg' : 'border-border/60',
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
          {hotel.area && (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5" /> {hotel.area}
            </p>
          )}
          {hotel.note && <p className="mt-2 text-sm text-foreground/80">{hotel.note}</p>}
          {venue && <TravelTimes hotel={hotel} venue={venue} />}
          <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            <Button asChild size="sm">
              <a href={hotelBookingUrl(hotel, city, checkIn, checkOut)} target="_blank" rel="noreferrer">
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

function TravelTimes({ hotel, venue }: { hotel: Ranked; venue: LngLat }) {
  const here: LngLat = [hotel.lng, hotel.lat]
  const primary = hotel.walk
    ? { Icon: Footprints, text: `${hotel.foot?.minutes} Min zu Fuß zur Location` }
    : hotel.transit
      ? { Icon: TramFront, text: `ca. ${hotel.transit.totalMinutes} Min mit der Tram`, href: googleDirectionsUrl(venue, 'transit', here) }
      : null
  const others: { Icon: typeof Car; minutes?: number; label: string }[] = [
    ...(!hotel.walk && hotel.foot ? [{ Icon: Footprints, minutes: hotel.foot.minutes, label: 'zu Fuß' }] : []),
    { Icon: Bike, minutes: hotel.bike?.minutes, label: 'Rad' },
    ...(hotel.car ? [{ Icon: Car, minutes: hotel.car.minutes, label: 'Auto' }] : []),
  ].filter((t) => t.minutes !== undefined)
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      {primary && (
        <p className="flex items-center gap-2 font-medium text-foreground">
          <primary.Icon className="size-4 text-primary" />
          {primary.href ? (
            <a href={primary.href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
              {primary.text} ↗
            </a>
          ) : (
            primary.text
          )}
        </p>
      )}
      {others.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {others.map(({ Icon, minutes, label }) => (
            <span key={label} className="flex items-center gap-1">
              <Icon className="size-3.5" /> {minutes} Min {label}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function datesBetween(from: string, to: string): string[] {
  const start = new Date(from)
  const end = new Date(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [from]
  const days: string[] = []
  for (const d = new Date(start); d < end && days.length < 7; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  return days.length ? days : [from]
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
