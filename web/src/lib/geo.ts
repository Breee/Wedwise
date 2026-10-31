import { queryOptions } from '@tanstack/react-query'

export type LngLat = [number, number]

export interface WalkingRoute {
  coordinates: LngLat[]
  minutes: number
  meters: number
  estimated: boolean
}

const FOOT_ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
const WALKING_METERS_PER_MINUTE = 80

export function distanceMeters(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function estimate(from: LngLat, to: LngLat): WalkingRoute {
  const meters = distanceMeters(from, to) * 1.3
  return { coordinates: [from, to], minutes: Math.round(meters / WALKING_METERS_PER_MINUTE), meters, estimated: true }
}

export async function walkingRoute(from: LngLat, to: LngLat): Promise<WalkingRoute> {
  try {
    const res = await fetch(`${FOOT_ROUTER}/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson`)
    if (!res.ok) return estimate(from, to)
    const data = (await res.json()) as {
      routes?: { duration: number; distance: number; geometry: { coordinates: LngLat[] } }[]
    }
    const route = data.routes?.[0]
    if (!route) return estimate(from, to)
    return {
      coordinates: route.geometry.coordinates,
      minutes: Math.max(1, Math.round(route.duration / 60)),
      meters: route.distance,
      estimated: false,
    }
  } catch {
    return estimate(from, to)
  }
}

export const walkingRouteQuery = (from: LngLat, to: LngLat) =>
  queryOptions({
    queryKey: ['route', from, to],
    queryFn: () => walkingRoute(from, to),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })

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
