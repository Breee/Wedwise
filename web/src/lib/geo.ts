import { language, locale } from '@/lib/i18n'
import { queryOptions } from '@tanstack/react-query'

export type LngLat = [number, number]

export type Profile = 'foot' | 'bike' | 'car' | 'transit'

export interface Route {
  coordinates: LngLat[]
  minutes: number
  meters: number
  estimated: boolean
}
export type WalkingRoute = Route

const ROUTER: Record<Exclude<Profile, 'transit'>, string> = {
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike',
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
}
export const WALK_MAX_MINUTES = 25
export const WALK_MAX_METERS = 2000
export const TRAM_WAIT_MINUTES = 5

export const METERS_PER_MINUTE: Record<Profile, number> = { foot: 80, bike: 250, car: 500, transit: 350 }

export function distanceMeters(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function estimateRoute(profile: Profile, from: LngLat, to: LngLat): Route {
  return estimate(profile, from, to)
}

function estimate(profile: Profile, from: LngLat, to: LngLat): Route {
  if (profile === 'transit') {
    const meters = distanceMeters(from, to)
    return { coordinates: [from, to], minutes: TRAM_WAIT_MINUTES + Math.round(meters / METERS_PER_MINUTE.transit), meters, estimated: true }
  }
  const meters = distanceMeters(from, to) * 1.3
  return { coordinates: [from, to], minutes: Math.round(meters / METERS_PER_MINUTE[profile]), meters, estimated: true }
}

let ownRouting = true

async function ownRoute(profile: Profile, from: LngLat, to: LngLat): Promise<Route | null> {
  if (!ownRouting) return null
  try {
    const res = await fetch(`/api/route?profile=${profile}&from=${from.join(',')}&to=${to.join(',')}`)
    if (res.status === 404) ownRouting = false
    if (!res.ok) return null
    const data = (await res.json()) as { minutes: number; meters: number; coords: LngLat[] }
    return { coordinates: data.coords, minutes: data.minutes, meters: data.meters, estimated: false }
  } catch {
    return null
  }
}

export async function route(profile: Profile, from: LngLat, to: LngLat): Promise<Route> {
  const estimated = () => estimate(profile, from, to)
  if (profile === 'transit') return estimated()
  const own = await ownRoute(profile, from, to)
  if (own) return own
  try {
    const res = await fetch(`${ROUTER[profile]}/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson`)
    if (!res.ok) return estimated()
    const data = (await res.json()) as {
      routes?: { duration: number; distance: number; geometry: { coordinates: LngLat[] } }[]
    }
    const r = data.routes?.[0]
    if (!r) return estimated()
    return {
      coordinates: r.geometry.coordinates,
      minutes: Math.max(1, Math.round(r.duration / 60)),
      meters: r.distance,
      estimated: false,
    }
  } catch {
    return estimated()
  }
}

export const routeQuery = (profile: Profile, from: LngLat, to: LngLat) =>
  queryOptions({
    queryKey: ['route', profile, from, to],
    queryFn: () => route(profile, from, to),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })

export const walkingRouteQuery = (from: LngLat, to: LngLat) => routeQuery('foot', from, to)

// Directions from the user's current position to a point.
export type DirectionsMode = 'driving' | 'transit' | 'walking' | 'bicycling'

const latLng = (p: LngLat) => `${p[1]},${p[0]}`

export function googleDirectionsUrl(to: LngLat, mode: DirectionsMode, from?: LngLat): string {
  const p = new URLSearchParams({ api: '1', destination: latLng(to), travelmode: mode })
  if (from) p.set('origin', latLng(from))
  return `https://www.google.com/maps/dir/?${p}`
}

export function appleDirectionsUrl(to: LngLat, name: string, mode: DirectionsMode, from?: LngLat): string {
  const flag = { driving: 'd', transit: 'r', walking: 'w', bicycling: 'c' }[mode]
  const p = new URLSearchParams({ daddr: latLng(to), q: name, dirflg: flag })
  if (from) p.set('saddr', latLng(from))
  return `https://maps.apple.com/?${p}`
}

export function formatKm(meters: number): string {
  return meters < 950 ? `${Math.round(meters / 50) * 50} m` : `${(meters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`
}

const STAY_PARAMS = { group_adults: '2', no_rooms: '1', group_children: '0' }

function withDates(url: string, checkIn: string, checkOut: string): string {
  const u = new URL(url)
  for (const [k, v] of Object.entries(STAY_PARAMS)) u.searchParams.set(k, v)
  if (checkIn) u.searchParams.set('checkin', checkIn)
  if (checkOut) u.searchParams.set('checkout', checkOut)
  return u.toString()
}

/** Property page with dates, or a Booking.com search for the given query as fallback. */
export function hotelBookingUrl(hotel: { name: string; bookingUrl?: string }, city: string, checkIn: string, checkOut: string): string {
  return hotel.bookingUrl ? withDates(hotel.bookingUrl, checkIn, checkOut) : bookingUrl(`${hotel.name} ${city}`, checkIn, checkOut)
}

/** Booking.com search; `filters` is the `nflt` value, e.g. 'ht_id=201' for apartments. */
export function bookingUrl(query: string, checkIn: string, checkOut: string, filters?: string): string {
  const u = withDates(`https://www.booking.com/searchresults.${language() === 'de' ? 'de' : 'en-gb'}.html`, checkIn, checkOut)
  const url = new URL(u)
  url.searchParams.set('ss', query)
  if (filters) url.searchParams.set('nflt', filters)
  return url.toString()
}

export function airbnbUrl(city: string, checkIn: string, checkOut: string): string {
  const p = new URLSearchParams({ adults: '2' })
  if (checkIn) p.set('checkin', checkIn)
  if (checkOut) p.set('checkout', checkOut)
  return `https://www.airbnb.${language() === 'de' ? 'de' : 'com'}/s/${encodeURIComponent(city)}/homes?${p}`
}

export function formatStayDates(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return ''
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${fmt(checkIn)} – ${fmt(checkOut)}`
}
