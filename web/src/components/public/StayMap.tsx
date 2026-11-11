import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Bike, CalendarDays, Car, ChevronDown, ExternalLink, Footprints, Home, MapPin, TramFront } from 'lucide-react'
import type { Accommodation, Hotel, StayKind, Stop, Travel, Walk } from '@/lib/types'
import {
  airbnbUrl,
  bookingUrl,
  hotelBookingUrl,
  distanceMeters,
  estimateRoute,
  formatStayDates,
  METERS_PER_MINUTE,
  routeQuery,
  TRAM_WAIT_MINUTES,
  googleDirectionsUrl,
  transitRide,
  type TransitRide,
  type TransitLine,
  WALK_MAX_MINUTES,
  type LngLat,
  type Route,
} from '@/lib/geo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'
import { drawRoutes, drawTransitLines, fitPadding, venueMarker, type RouteFeature } from './mapParts'
import { ICON_SVG, KIND } from './TravelMap'

const INITIAL_VISIBLE = 3

const TIER = { 1: { label: '€', hint: 'günstig' }, 2: { label: '€€', hint: 'mittel' }, 3: { label: '€€€', hint: 'gehoben' } } as const
// Up to this walking time we only suggest walking.
const WALK_ONLY_MINUTES = 15
const FOOT_COLOR = '#5e7f63'
const stored = (w: Walk | undefined): Route | undefined => (w ? { coordinates: w.coords, minutes: w.minutes, meters: w.meters, estimated: false } : undefined)
const FOOT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4M4 13h4"/></svg>'

type Transit = { stop: Stop; ride: TransitRide | null; board: LngLat | null; toStop?: Route; totalMinutes: number }
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

  const footRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('foot', [h.lng, h.lat], venue), enabled: hasVenue && !h.routes?.foot })) })
  const bikeRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('bike', [h.lng, h.lat], venue), enabled: hasVenue && !h.routes?.bike })) })
  const carRoutes = useQueries({ queries: accommodation.hotels.map((h) => ({ ...routeQuery('car', [h.lng, h.lat], venue), enabled: hasVenue && !h.routes?.car })) })
  const boardings = useMemo(
    () => accommodation.hotels.map((h) => (line && stop ? transitRide(line, [h.lng, h.lat], [stop.lng, stop.lat])?.board : undefined)),
    [accommodation.hotels, line, stop],
  )
  const toStopRoutes = useQueries({
    queries: accommodation.hotels.map((h, i) => {
      const b = boardings[i]
      return { ...routeQuery('foot', [h.lng, h.lat], b ? [b.lng, b.lat] : venue), enabled: hasVenue && !!b && !h.routes?.toStop }
    }),
  })
  const stopWalkQuery = useQuery({
    ...routeQuery('foot', stop ? [stop.lng, stop.lat] : venue, venue),
    enabled: hasVenue && !!stop && !stop.walk,
  })
  const stopWalk = stored(stop?.walk) ?? stopWalkQuery.data

  const allHotels = useMemo<Ranked[]>(() => {
    const ranked = accommodation.hotels.map((h, i): Ranked => {
      const here: LngLat = [h.lng, h.lat]
      // Fall back to a straight-line estimate so the walk-vs-tram decision never waits on the router.
      const foot = stored(h.routes?.foot) ?? footRoutes[i].data ?? (hasVenue ? estimateRoute('foot', here, venue) : undefined)
      const bike = stored(h.routes?.bike) ?? bikeRoutes[i].data
      const car = stored(h.routes?.car) ?? carRoutes[i].data
      const transit = viaStop(here, stop, venue, line, stopWalk, stored(h.routes?.toStop) ?? toStopRoutes[i].data)
      const walk = !!foot && (foot.minutes <= WALK_ONLY_MINUTES || (foot.minutes <= WALK_MAX_MINUTES && (!transit || foot.minutes <= transit.totalMinutes)))
      const minutes = walk ? foot!.minutes : (transit?.totalMinutes ?? foot?.minutes ?? 0)
      return { ...h, foot, bike, car, transit, walk, minutes }
    })
    return ranked.sort((a, b) => a.minutes - b.minutes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodation.hotels, stop, venue, hasVenue, line, stopWalk, ...toStopRoutes.map((r) => r.data), ...footRoutes.map((r) => r.data), ...bikeRoutes.map((r) => r.data), ...carRoutes.map((r) => r.data)])

  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [tiers, setTiers] = useState<number[]>([])
  const [kind, setKind] = useState<StayKind | null>(null)
  const hotels = useMemo(
    () => allHotels.filter((h) => (!tiers.length || tiers.includes(h.priceTier)) && (!kind || (h.kind ?? 'hotel') === kind)),
    [allHotels, tiers, kind],
  )
  const hasApartments = allHotels.some((h) => h.kind === 'apartment')
  const toggleTier = (t: number) => setTiers((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
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
      if (hotel.walk && hotel.foot) features.push({ route: hotel.foot, color: FOOT_COLOR, id: 0, icon: FOOT_SVG })
      else if (hotel.transit) {
        const t = hotel.transit
        if (t.toStop && t.toStop.minutes > 0) features.push({ route: t.toStop, color: FOOT_COLOR, id: 0, icon: FOOT_SVG })
        if (t.ride) features.push({ route: t.ride, color: KIND.tram.color, id: 1, icon: ICON_SVG.tram })
        if (stopWalk) features.push({ route: stopWalk, color: FOOT_COLOR, id: 2, icon: FOOT_SVG })
      }
    }
    const drawable = features.filter((f) => !f.route.estimated)
    const cleanup = drawRoutes(map, drawable)
    if (hotel) {
      const bounds = new maplibregl.LngLatBounds(venue, venue)
      bounds.extend([hotel.lng, hotel.lat])
      drawable.forEach((f) => f.route.coordinates.forEach((c) => bounds.extend(c)))
      map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: 15, duration: 800 })
      if (window.innerWidth < 1024) {
        const top = map.getContainer().getBoundingClientRect().top + window.scrollY - 80
        window.scrollTo({ top, behavior: 'smooth' })
      }
    }
    return cleanup
  }, [map, hotels, selectedIndex, stopWalk, venue])

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
        <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Filter">
          {([1, 2, 3] as const).map((t) => (
            <FilterChip key={t} pressed={tiers.includes(t)} onClick={() => toggleTier(t)}>
              {TIER[t].label} <span className="text-xs opacity-80">{TIER[t].hint}</span>
            </FilterChip>
          ))}
          {hasApartments && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              <FilterChip pressed={kind === 'hotel'} onClick={() => setKind(kind === 'hotel' ? null : 'hotel')}>Hotel</FilterChip>
              <FilterChip pressed={kind === 'apartment'} onClick={() => setKind(kind === 'apartment' ? null : 'apartment')}>Ferienwohnung</FilterChip>
            </>
          )}
        </div>
        {stay && (
          <p>
            Alle Links sind für <strong className="whitespace-nowrap text-foreground">{stay}</strong> vorausgefüllt.
          </p>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <BaseMap onReady={setMap} className="h-[50svh] max-h-[640px] min-h-[300px] lg:sticky lg:top-24 lg:col-span-3 lg:h-[640px]">
          {selectedIndex < 0 ? (
            <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur sm:text-sm">
              Unterkunft auswählen, um den Weg zu sehen
            </div>
          ) : (
            <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-3 rounded-full bg-background/90 px-3 py-1.5 text-xs shadow backdrop-blur" aria-label="Legende">
              <span className="flex items-center gap-1.5"><span className="inline-block h-1 w-5 rounded-full" style={{ background: KIND.tram.color }} /><TramFront className="size-3.5" /> Tram</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-1 w-5 rounded-full" style={{ background: FOOT_COLOR }} /><Footprints className="size-3.5" /> zu Fuß</span>
            </div>
          )}
        </BaseMap>
        <ol className="space-y-3 lg:col-span-2">
          {hotels.length === 0 && (
            <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Keine Unterkunft passt zu diesem Filter.
            </li>
          )}
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
            <h3 className="text-xl">Lieber eine Ferienwohnung oder ein anderes Hotel?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Rund um die Location und in der Wiehre gibt es viele Wohnungen und weitere Hotels. Die Suchen sind mit den Daten vorausgefüllt.
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
            <a href={bookingUrl(city, checkIn, checkOut)} target="_blank" rel="noreferrer">
              Booking.com <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

function viaStop(from: LngLat, stop: Stop | undefined, venue: LngLat, line: TransitLine | undefined, stopWalk: Route | undefined, toStop: Route | undefined): Transit | null {
  if (!stop) return null
  const at: LngLat = [stop.lng, stop.lat]
  const walkMinutes = stopWalk?.minutes ?? Math.round((distanceMeters(at, venue) * 1.3) / METERS_PER_MINUTE.foot)
  const ride = line ? transitRide(line, from, at) : null
  if (!ride) {
    const minutes = TRAM_WAIT_MINUTES + Math.round(distanceMeters(from, at) / METERS_PER_MINUTE.transit)
    return { stop, ride: null, board: null, totalMinutes: minutes + walkMinutes }
  }
  const board: LngLat = [ride.board.lng, ride.board.lat]
  const toStopMinutes = toStop?.minutes ?? Math.round((distanceMeters(from, board) * 1.3) / METERS_PER_MINUTE.foot)
  return { stop, ride, board, toStop, totalMinutes: toStopMinutes + ride.minutes + walkMinutes }
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

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        pressed ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:border-primary/60',
      )}
    >
      {children}
    </button>
  )
}
