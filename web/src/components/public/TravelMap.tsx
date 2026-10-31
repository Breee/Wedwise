import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl'
import { Footprints, ParkingCircle, TramFront, TrainFront, Bus } from 'lucide-react'
import type { Stop, StopKind, Travel } from '@/lib/types'
import { formatKm, routeQuery, type LngLat, type Route } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'
import { drawRoutes, drawTransitLines, FIT_PADDING, venueMarker } from './mapParts'

export type TravelMode = 'transit' | 'car'

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

const HEADER: Record<TravelMode, string> = {
  transit: 'Haltestellen & Fußweg zur Location',
  car: 'Parken an der Location',
}

export function TravelMap({ travel, venueName, mode = 'transit' }: { travel: Travel; venueName: string; mode?: TravelMode }) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const stops = useMemo(
    () => travel.stops.filter((s) => (mode === 'car' ? s.kind === 'parking' : s.kind !== 'parking')),
    [mode, travel.stops],
  )
  // Only transit stops have a walking leg to draw.
  const routed = useMemo(() => stops.filter((s) => s.kind !== 'parking'), [stops])
  const routes = useQueries({ queries: routed.map((s) => routeQuery('foot', [s.lng, s.lat], venue)) })
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const resolved = routes.map((r) => r.data)

  useEffect(() => {
    if (!map) return
    const markers = [venueMarker(map, venue)]
    for (const stop of stops) {
      const el = markerElement(ICON_SVG[stop.kind], 'wed-marker wed-marker-stop')
      el.style.setProperty('--stop-color', KIND[stop.kind].color)
      el.title = stop.name
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(map))
    }
    const bounds = new maplibregl.LngLatBounds(venue, venue)
    stops.forEach((s) => bounds.extend([s.lng, s.lat]))
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 16, duration: 0 })
    return () => markers.forEach((m) => m.remove())
  }, [map, stops, venue])

  useEffect(() => {
    if (!map) return
    drawTransitLines(map, mode === 'transit' ? travel.lines : [], KIND.tram.color)
  }, [map, mode, travel.lines])

  useEffect(() => {
    if (!map) return
    return drawRoutes(
      map,
      resolved.flatMap((route, i) => (route ? [{ route, color: KIND[routed[i].kind].color, id: i }] : [])),
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
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: 16, duration: 900 })
  }

  return (
    <div className="space-y-6">
      <BaseMap onReady={setMap} className="h-[420px] md:h-[520px]">
        <div className="pointer-events-none absolute top-4 left-4 rounded-full bg-background/90 px-4 py-2 text-sm shadow backdrop-blur">
          <span className="font-display text-lg text-primary">{venueName}</span>
          <span className="ml-2 text-muted-foreground">{HEADER[mode]}</span>
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
                loading={i >= 0 && routes[i].isPending}
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
  return (
    <button
      type="button"
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
        {stop.kind === 'parking' ? (
          <span className="mt-1 block text-sm text-muted-foreground">direkt an der Location</span>
        ) : loading ? (
          <span className="mt-1 block text-sm text-muted-foreground">Route wird berechnet…</span>
        ) : route ? (
          <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Footprints className="size-3.5" /> {route.minutes} Min · {formatKm(route.meters)}
            {route.estimated && ' (geschätzt)'}
          </span>
        ) : null}
      </span>
    </button>
  )
}
