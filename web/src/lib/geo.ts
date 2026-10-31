import { queryOptions } from '@tanstack/react-query'

export type LngLat = [number, number]

export type Profile = 'foot' | 'car' | 'transit'

export interface Route {
  coordinates: LngLat[]
  minutes: number
  meters: number
  estimated: boolean
}
export type WalkingRoute = Route

const ROUTER: Record<Exclude<Profile, 'transit'>, string> = {
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
}
export const WALK_MAX_MINUTES = 25
export const WALK_MAX_METERS = 2000
export const TRAM_WAIT_MINUTES = 5

export const METERS_PER_MINUTE: Record<Profile, number> = { foot: 80, car: 500, transit: 350 }

export function distanceMeters(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function estimate(profile: Profile, from: LngLat, to: LngLat): Route {
  if (profile === 'transit') {
    const meters = distanceMeters(from, to)
    return { coordinates: [from, to], minutes: TRAM_WAIT_MINUTES + Math.round(meters / METERS_PER_MINUTE.transit), meters, estimated: true }
  }
  const meters = distanceMeters(from, to) * 1.3
  return { coordinates: [from, to], minutes: Math.round(meters / METERS_PER_MINUTE[profile]), meters, estimated: true }
}

export async function route(profile: Profile, from: LngLat, to: LngLat): Promise<Route> {
  const estimated = () => estimate(profile, from, to)
  if (profile === 'transit') return estimated()
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

export function transitDirectionsUrl(from: LngLat, to: LngLat): string {
  const p = new URLSearchParams({ api: '1', origin: `${from[1]},${from[0]}`, destination: `${to[1]},${to[0]}`, travelmode: 'transit' })
  return `https://www.google.com/maps/dir/?${p}`
}

export function formatKm(meters: number): string {
  return meters < 950 ? `${Math.round(meters / 50) * 50} m` : `${(meters / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`
}

export function bookingUrl(query: string, checkIn: string, checkOut: string): string {
  const p = new URLSearchParams({ ss: query, group_adults: '2', no_rooms: '1', lang: 'de' })
  if (checkIn) p.set('checkin', checkIn)
  if (checkOut) p.set('checkout', checkOut)
  return `https://www.booking.com/searchresults.de.html?${p}`
}

export function airbnbUrl(city: string, checkIn: string, checkOut: string): string {
  const p = new URLSearchParams({ adults: '2' })
  if (checkIn) p.set('checkin', checkIn)
  if (checkOut) p.set('checkout', checkOut)
  return `https://www.airbnb.de/s/${encodeURIComponent(city)}/homes?${p}`
}

export function formatStayDates(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return ''
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${fmt(checkIn)} – ${fmt(checkOut)}`
}
