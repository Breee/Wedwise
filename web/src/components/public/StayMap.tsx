import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { CalendarDays, Car, ExternalLink, Footprints, Home, MapPin, TramFront } from 'lucide-react'
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
import { drawRoutes, drawTransitLines, FIT_PADDING, venueMarker, type RouteFeature } from './mapParts'
import { KIND } from './TravelMap'

const TIER = { 1: { label: '€', hint: 'günstig' }, 2: { label: '€€', hint: 'mittel' }, 3: { label: '€€€', hint: 'gehoben' } } as const
const FOOT_COLOR = '#5e7f63'

type Transit = { stop: Stop; ride: Route; totalMinutes: number }
// walk: walking is realistic (≤ WALK_MAX_MINUTES) and not slower than the tram.
type Ranked = Hotel & { foot?: Route; car?: Route; transit: Transit | null; walk: boolean; minutes: number }

export function StayMap({ accommodation, travel, city }: { accommodation: Accommodation; travel: Travel; city: string }) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const hasVenue = travel.lat !== 0 || travel.lng !== 0
  const { checkIn, checkOut } = accommodation
  const stop = useMemo(() => travel.stops.find((s) => s.kind !== 'parking'), [travel.stops])
  const line = travel.lines[0]

  const footRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('foot', [h.lng, h.lat], venue), enabled: hasVenue })) })
  const carRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('car', [h.lng, h.lat], venue), enabled: hasVenue })) })
  const stopWalk = useQuery({
    ...routeQuery('foot', stop ? [stop.lng, stop.lat] : venue, venue),
    enabled: hasVenue && !!stop,
  })

  const hotels = useMemo<Ranked[]>(() => {
    const ranked = accommodation.hotels.map((h, i): Ranked => {
      const here: LngLat = [h.lng, h.lat]
      const foot = footRoutes[i].data
      const car = carRoutes[i].data
      const transit = viaStop(here, stop, venue, line, stopWalk.data)
      const fallbackWalk = hasVenue ? (distanceMeters(here, venue) * 1.3) / METERS_PER_MINUTE.foot : 0
      const walk = !!foot && foot.minutes <= WALK_MAX_MINUTES && (!transit || foot.minutes <= transit.totalMinutes)
      const minutes = walk ? foot!.minutes : (transit?.totalMinutes ?? foot?.minutes ?? fallbackWalk)
      return { ...h, foot, car, transit, walk, minutes }
    })
    return ranked.sort((a, b) => a.minutes - b.minutes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodation.hotels, stop, venue, hasVenue, line, stopWalk.data, ...footRoutes.map((r) => r.data), ...carRoutes.map((r) => r.data)])

  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
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
        document.getElementById(`hotel-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([h.lng, h.lat]).addTo(map))
      bounds.extend([h.lng, h.lat])
    })
    if (!bounds.isEmpty() && selectedIndex < 0) map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 })
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
      map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 15, duration: 800 })
    }
    return cleanup
  }, [map, hotels, selectedIndex, stopWalk.data, venue])

  const stay = formatStayDates(checkIn, checkOut)

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>Sortiert nach Weg zur Location – zu Fuß oder mit der Tram.</p>
        {stay && (
          <p className="flex items-center justify-center gap-2">
            <CalendarDays className="size-4 text-primary" /> Alle Links sind bereits für <strong className="text-foreground">{stay}</strong> vorausgefüllt.
          </p>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <BaseMap onReady={setMap} className="h-[380px] lg:sticky lg:top-24 lg:col-span-3 lg:h-[640px]">
          {selectedIndex < 0 && (
            <div className="pointer-events-none absolute top-4 left-4 rounded-full bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow backdrop-blur">
              Unterkunft auswählen, um den Weg zu sehen
            </div>
          )}
        </BaseMap>
        <ol className="space-y-3 lg:col-span-2">
          {hotels.map((h, i) => (
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

function TravelTimes({ hotel, venue }: { hotel: Ranked; venue: LngLat }) {
  const here: LngLat = [hotel.lng, hotel.lat]
  const fmt = (r: Route) => `${r.minutes} Min · ${formatKm(r.meters)}${r.estimated ? ' (geschätzt)' : ''}`
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {hotel.walk && hotel.foot ? (
        <li className="flex items-center gap-1.5 font-medium text-foreground">
          <Footprints className="size-3.5" /> {fmt(hotel.foot)} zu Fuß
        </li>
      ) : hotel.transit ? (
        <li className="flex items-center gap-1.5 font-medium text-foreground">
          <TramFront className="size-3.5" />
          <a href={transitDirectionsUrl(here, venue)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
            ca. {hotel.transit.totalMinutes} Min · {KIND[hotel.transit.stop.kind].label} bis {hotel.transit.stop.name}
          </a>
        </li>
      ) : null}
      {hotel.car && (
        <li className="flex items-center gap-1.5">
          <Car className="size-3.5" /> {fmt(hotel.car)}
        </li>
      )}
    </ul>
  )
}
