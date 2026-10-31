import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl'
import { Footprints, ParkingCircle, TramFront, TrainFront, Bus, BedDouble } from 'lucide-react'
import type { Hotel, StopKind, Travel } from '@/lib/types'
import { distanceMeters, formatKm, walkingRouteQuery, type LngLat, type WalkingRoute } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'

export type TravelMode = 'transit' | 'foot' | 'car'

type OriginKind = StopKind | 'hotel'
type Origin = { name: string; kind: OriginKind; line: string; lat: number; lng: number }

const KIND = {
  tram: { label: 'Tram', color: '#c2554a', Icon: TramFront },
  train: { label: 'S-Bahn', color: '#5e7f63', Icon: TrainFront },
  bus: { label: 'Bus', color: '#7a6ea3', Icon: Bus },
  parking: { label: 'Parken', color: '#8a8278', Icon: ParkingCircle },
  hotel: { label: 'Unterkunft', color: '#b58a4a', Icon: BedDouble },
} satisfies Record<OriginKind, { label: string; color: string; Icon: typeof TramFront }>

const ICON_SVG: Record<OriginKind, string> = {
  tram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16M12 3v8M8 19l-2 3M18 22l-2-3M8 15h.01M16 15h.01"/></svg>',
  train: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1M9 15h.01M15 15h.01M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5ZM8 19l-2 3M16 19l2 3"/></svg>',
  bus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>',
  parking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>',
  hotel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 18h20"/></svg>',
}

const WALKABLE_METERS = 3500

const HEADER: Record<TravelMode, string> = {
  transit: 'zu Fuß von den Haltestellen',
  foot: 'zu Fuß von den Unterkünften',
  car: 'Parken direkt an der Location',
}

function originsFor(mode: TravelMode, travel: Travel, hotels: Hotel[]): Origin[] {
  switch (mode) {
    case 'transit':
      return travel.stops.filter((s) => s.kind !== 'parking')
    case 'car':
      return travel.stops.filter((s) => s.kind === 'parking')
    case 'foot':
      return hotels
        .filter((h) => distanceMeters([h.lng, h.lat], [travel.lng, travel.lat]) <= WALKABLE_METERS)
        .map((h) => ({ name: h.name, kind: 'hotel', line: '', lat: h.lat, lng: h.lng }))
  }
}

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'

export function TravelMap({
  travel,
  venueName,
  mode = 'transit',
  hotels = [],
}: {
  travel: Travel
  venueName: string
  mode?: TravelMode
  hotels?: Hotel[]
}) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const origins = useMemo(() => originsFor(mode, travel, hotels), [mode, travel, hotels])
  const walkable = useMemo(() => origins.filter((s) => s.kind !== 'parking'), [origins])
  const routes = useQueries({
    queries: walkable.map((s) => walkingRouteQuery([s.lng, s.lat], venue)),
  })
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [active, setActive] = useState<number | null>(null)

  const resolved = routes.map((r) => r.data)

  useEffect(() => {
    if (!map) return
    const venueEl = markerElement(HEART_SVG, 'wed-marker wed-marker-venue')
    const markers = [new maplibregl.Marker({ element: venueEl, anchor: 'center' }).setLngLat(venue).addTo(map)]
    for (const stop of origins) {
      const el = markerElement(ICON_SVG[stop.kind], 'wed-marker wed-marker-stop')
      el.style.setProperty('--stop-color', KIND[stop.kind].color)
      el.title = stop.name
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(map))
    }
    const bounds = new maplibregl.LngLatBounds(venue, venue)
    origins.forEach((s) => bounds.extend([s.lng, s.lat]))
    map.fitBounds(bounds, { padding: { top: 80, bottom: 60, left: 60, right: 60 }, maxZoom: 16, duration: 0 })
    return () => markers.forEach((m) => m.remove())
  }, [map, origins, venue])

  useEffect(() => {
    if (!map) return
    const features = resolved.flatMap((route, i) =>
      route
        ? [{ type: 'Feature' as const, properties: { i, color: KIND[walkable[i].kind].color }, geometry: { type: 'LineString' as const, coordinates: route.coordinates } }]
        : [],
    )
    const data = { type: 'FeatureCollection' as const, features }
    const src = map.getSource('routes') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(data)
    } else {
      map.addSource('routes', { type: 'geojson', data })
      map.addLayer({
        id: 'routes-casing',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.55 },
      })
      map.addLayer({
        id: 'routes-dash',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-dasharray': [0, 4, 3] },
      })
    }

    const labels = resolved.flatMap((route, i) => {
      if (!route) return []
      const mid = route.coordinates[Math.floor(route.coordinates.length / 2)]
      const el = markerElement(
        `<span>${route.minutes} Min</span>`,
        'wed-route-label',
      )
      el.style.setProperty('--stop-color', KIND[walkable[i].kind].color)
      return [new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map)]
    })

    const sequence = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
      [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
    ]
    let step = 0
    let frame = 0
    let last = 0
    const animate = (t: number) => {
      if (t - last > 70) {
        step = (step + 1) % sequence.length
        if (map.getLayer('routes-dash')) map.setPaintProperty('routes-dash', 'line-dasharray', sequence[step])
        last = t
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frame)
      labels.forEach((l) => l.remove())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, walkable, ...resolved])

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
    if (i === null) origins.forEach((s) => bounds.extend([s.lng, s.lat]))
    else {
      const stop = walkable[i]
      bounds.extend([stop.lng, stop.lat])
      resolved[i]?.coordinates.forEach((c) => bounds.extend(c))
    }
    map.fitBounds(bounds, { padding: { top: 80, bottom: 60, left: 60, right: 60 }, maxZoom: 16, duration: 900 })
  }

  return (
    <div className="space-y-6">
      <BaseMap onReady={setMap} className="h-[420px] md:h-[520px]">
        <div className="pointer-events-none absolute top-4 left-4 rounded-full bg-background/90 px-4 py-2 text-sm shadow backdrop-blur">
          <span className="font-display text-lg text-primary">{venueName}</span>
          <span className="ml-2 text-muted-foreground">{HEADER[mode]}</span>
        </div>
      </BaseMap>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {origins.map((stop) => {
          const i = walkable.indexOf(stop)
          const route = i >= 0 ? resolved[i] : undefined
          return (
            <StopCard
              key={`${stop.kind}-${stop.name}`}
              stop={stop}
              route={route}
              loading={i >= 0 && routes[i].isPending}
              active={active === i && i >= 0}
              onEnter={() => i >= 0 && focus(i)}
              onLeave={() => focus(null)}
            />
          )
        })}
      </div>
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
  stop: Origin
  route?: WalkingRoute
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
          <span className="mt-1 block text-sm text-muted-foreground">Fußweg wird berechnet…</span>
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
