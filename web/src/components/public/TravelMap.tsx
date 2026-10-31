import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl'
import { Footprints, ParkingCircle, TramFront, TrainFront, Bus } from 'lucide-react'
import type { Stop, StopKind, Travel } from '@/lib/types'
import { appleDirectionsUrl, distanceMeters, formatKm, googleDirectionsUrl, routeQuery, type LngLat, type Route } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'
import { drawRoutes,
  drawBikeLines, drawTransitLines, fitPadding, venueMarker } from './mapParts'

export const KIND = {
  tram: { label: 'Tram', color: '#c2554a', Icon: TramFront },
  train: { label: 'S-Bahn', color: '#5e7f63', Icon: TrainFront },
  bus: { label: 'Bus', color: '#7a6ea3', Icon: Bus },
  parking: { label: 'Parken', color: '#8a8278', Icon: ParkingCircle },
} satisfies Record<StopKind, { label: string; color: string; Icon: typeof TramFront }>

export const ICON_SVG: Record<StopKind, string> = {
  tram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16M12 3v8M8 19l-2 3M18 22l-2-3M8 15h.01M16 15h.01"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1M9 15h.01M15 15h.01M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5ZM8 19l-2 3M16 19l2 3"/></svg>',
  bus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>',
  parking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>',
}

// Parking this close to the venue are "at the location" – no own marker or route.
const AT_VENUE_METERS = 150
const BIKE_COLOR = '#5e7f63'
const isAtVenue = (stop: Stop, venue: LngLat) => distanceMeters([stop.lng, stop.lat], venue) <= AT_VENUE_METERS
const hasLeg = (kind: StopKind) => kind !== 'parking'

export type TravelMode = 'transit' | 'bike' | 'car'
const MODE_KINDS: Record<TravelMode, StopKind[]> = {
  transit: ['tram', 'train', 'bus'],
  bike: [],
  car: ['parking'],
}
const HEADER: Record<TravelMode, string> = {
  transit: 'Haltestellen & Fußwege',
  bike: 'Mit dem Rad',
  car: 'Parken',
}

export function TravelMap({ travel, venueName, mode = 'transit' }: { travel: Travel; venueName: string; mode?: TravelMode }) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const stops = useMemo(() => travel.stops.filter((s) => MODE_KINDS[mode].includes(s.kind)), [travel.stops, mode])
  // Only transit stops have a walking leg to draw.
  const routed = useMemo(() => stops.filter((s) => hasLeg(s.kind)), [stops])
  // Stored walking routes win; the external router is only a fallback.
  const routes = useQueries({
    queries: routed.map((s) => ({ ...routeQuery('foot', [s.lng, s.lat], venue), enabled: !s.walk })),
  })
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const resolved: (Route | undefined)[] = routed.map((s, i) =>
    s.walk ? { coordinates: s.walk.coords, minutes: s.walk.minutes, meters: s.walk.meters, estimated: false } : routes[i].data,
  )

  useEffect(() => {
    if (!map) return
    const markers = [venueMarker(map, venue)]
    for (const stop of stops) {
      if (isAtVenue(stop, venue)) continue
      const el = markerElement(ICON_SVG[stop.kind], 'wed-marker wed-marker-stop')
      el.style.setProperty('--stop-color', KIND[stop.kind].color)
      el.title = stop.name
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(map))
    }
    const bounds = new maplibregl.LngLatBounds(venue, venue)
    stops.forEach((s) => bounds.extend([s.lng, s.lat]))
    map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: mode === 'car' ? 14 : 16, duration: 0 })
    setActive(null)
    return () => markers.forEach((m) => m.remove())
  }, [map, stops, venue, mode])

  useEffect(() => {
    if (!map) return
    drawTransitLines(map, mode === 'transit' ? travel.lines : [], KIND.tram.color)
    const clear = drawBikeLines(map, mode === 'bike' ? travel.lines : [], BIKE_COLOR)
    if (mode === 'bike' && travel.lines.some((l) => l.kind === 'bike')) {
      const bounds = new maplibregl.LngLatBounds(venue, venue)
      travel.lines.filter((l) => l.kind === 'bike').forEach((l) => l.coords.forEach((c) => bounds.extend(c)))
      map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: 15, duration: 0 })
    }
    return clear
  }, [map, mode, travel.lines, venue])

  useEffect(() => {
    if (!map) return
    return drawRoutes(
      map,
      resolved.flatMap((route, i) => (route && !route.estimated ? [{ route, color: KIND[routed[i].kind].color, id: i }] : [])),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routed, ...resolved])

  useEffect(() => {
    if (!map || !map.getLayer('routes-line')) return
    const highlight = (on: number, off: number): number | ExpressionSpecification =>
      active === null ? on : ['case', ['==', ['get', 'i'], active], on, off]
    map.setPaintProperty('routes-line', 'line-opacity', highlight(0.55, 0.15))
    map.setPaintProperty('routes-dash', 'line-opacity', highlight(1, 0.2))
  }, [map, active])

  const focus = (i: number | null) => {
    setActive(i)
    if (!map) return
    const bounds = new maplibregl.LngLatBounds(venue, venue)
    if (i === null) stops.forEach((s) => bounds.extend([s.lng, s.lat]))
    else {
      bounds.extend([routed[i].lng, routed[i].lat])
      resolved[i]?.coordinates.forEach((c) => bounds.extend(c))
    }
    map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: 16, duration: 900 })
  }

  return (
    <div className="space-y-6">
      <BaseMap onReady={setMap} className="h-[60svh] max-h-[520px] min-h-[320px]">
        <div className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-5rem)] truncate rounded-full bg-background/90 px-3 py-1.5 text-xs shadow backdrop-blur sm:text-sm">
          <span className="font-display text-base text-primary sm:text-lg">{venueName}</span>
          <span className="ml-2 hidden text-muted-foreground sm:inline">{HEADER[mode]}</span>
        </div>
      </BaseMap>
      {stops.length > 0 && (
        <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {stops.map((stop) => {
            const i = routed.indexOf(stop)
            return (
              <StopCard
                key={`${stop.kind}-${stop.name}`}
                stop={stop}
                route={i >= 0 ? resolved[i] : undefined}
                loading={i >= 0 && !resolved[i] && routes[i].isPending}
                active={i >= 0 && active === i}
                onEnter={() => i >= 0 && focus(i)}
                onLeave={() => focus(null)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function StopCard({
  stop,
  route,
  loading,
  active,
  onEnter,
  onLeave,
}: {
  stop: Stop
  route?: Route
  loading: boolean
  active: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const { Icon, label, color } = KIND[stop.kind]
  const to: LngLat = [stop.lng, stop.lat]
  const travelMode = stop.kind === 'parking' ? 'driving' : 'transit'
  return (
    <div
      tabIndex={0}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={cn(
        'flex items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg',
        active ? 'border-primary shadow-lg' : 'border-border/60',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs tracking-wider text-muted-foreground uppercase">
          {label}
          {stop.line && <span className="rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: color }}>{stop.line}</span>}
        </span>
        <span className="mt-0.5 block truncate font-medium">{stop.name}</span>
        {!hasLeg(stop.kind) ? (
          <span className="mt-1 block text-sm text-muted-foreground">direkt an der Location</span>
        ) : loading ? (
          <span className="mt-1 block text-sm text-muted-foreground">Route wird berechnet…</span>
        ) : route ? (
          <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Footprints className="size-3.5" /> {route.estimated ? 'ca. ' : ''}{route.minutes} Min · {formatKm(route.meters)}
          </span>
        ) : null}
        <span className="mt-3 flex flex-wrap gap-2 text-xs">
          <a href={googleDirectionsUrl(to, travelMode)} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1.5 hover:bg-muted">
            Google Maps ↗
          </a>
          <a href={appleDirectionsUrl(to, stop.name, travelMode)} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1.5 hover:bg-muted">
            Apple Karten ↗
          </a>
        </span>
      </span>
    </div>
  )
}
