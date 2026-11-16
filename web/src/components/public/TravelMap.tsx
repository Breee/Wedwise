import { useEffect, useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl'
import { Footprints, ParkingCircle, TramFront, TrainFront, Bus } from 'lucide-react'
import type { Stop, StopKind, Travel } from '@/lib/types'
import { distanceMeters, formatKm, routeQuery, type LngLat, type Route } from '@/lib/geo'
import { DirectionsLinks } from './DirectionsLinks'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'
import { drawRoutes, fitPadding, FOOT_COLOR, venueMarker } from './mapParts'

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
const isAtVenue = (stop: Stop, venue: LngLat) => distanceMeters([stop.lng, stop.lat], venue) <= AT_VENUE_METERS
type TransitLine = { stops: { name: string; lat: number; lng: number }[]; coords: [number, number][] }
const hasLeg = (kind: StopKind) => kind !== 'parking'

export type TravelMode = 'transit' | 'bike' | 'car'
const MODE_KINDS: Record<TravelMode, StopKind[]> = {
  transit: ['tram', 'train', 'bus'],
  bike: [],
  car: ['parking'],
}
export function TravelMap({ travel, venueName, mode = 'transit' }: { travel: Travel; venueName: string; mode?: TravelMode }) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const stops = useMemo(() => travel.stops.filter((s) => MODE_KINDS[mode].includes(s.kind)), [travel.stops, mode])
  // Only transit stops have a walking leg to draw.
  const routed = useMemo(() => stops.filter((s) => hasLeg(s.kind)), [stops])
  const routes = useQueries({
    queries: routed.map((s) => routeQuery('foot', [s.lng, s.lat], venue)),
  })
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const [whole, setWhole] = useState(false)
  const resolved: (Route | undefined)[] = routes.map((r) => r.data)
  const lineStop = routed[0]
  const line = useQuery({
    queryKey: ['route', 'line', lineStop?.kind, lineStop?.line, lineStop?.lng, lineStop?.lat],
    queryFn: () =>
      api
        .get<TransitLine>(`/route/line?to=${lineStop.lng},${lineStop.lat}&kind=${lineStop.kind}&line=${encodeURIComponent(lineStop.line ?? '')}`)
        .catch(() => null),
    enabled: !!lineStop,
    staleTime: Infinity,
    retry: false,
  }).data

  useEffect(() => {
    if (!map) return
    const markers = [venueMarker(map, venue, venueName)]
    for (const stop of stops) {
      if (isAtVenue(stop, venue)) continue
      const el = markerElement(ICON_SVG[stop.kind], 'wed-marker wed-marker-stop')
      el.style.setProperty('--stop-color', KIND[stop.kind].color)
      el.title = stop.name
      const label = document.createElement('span')
      label.className = 'wed-venue-name'
      label.textContent = stop.name
      el.append(label)
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(map))
    }
    setActive(null)
    setWhole(false)
    return () => markers.forEach((m) => m.remove())
  }, [map, stops, venue, mode])

  // Close-up by default; the whole line only after a tap on it.
  useEffect(() => {
    if (!map) return
    const bounds = new maplibregl.LngLatBounds(venue, venue)
    stops.forEach((s) => bounds.extend([s.lng, s.lat]))
    if (whole && line) {
      line.coords.forEach((c) => bounds.extend(c))
      map.fitBounds(bounds, { padding: 36, duration: 800 })
    } else {
      map.fitBounds(bounds, { padding: fitPadding(map), maxZoom: mode === 'transit' ? 16 : 14, duration: whole ? 0 : 600 })
    }
  }, [map, stops, venue, mode, whole, line])

  useEffect(() => {
    if (!map || !line) return
    const layers = ['transit-line-hit', 'transit-line-stops']
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const present = layers.filter((id) => map.getLayer(id))
      const hit = present.length > 0 && map.queryRenderedFeatures(e.point, { layers: present }).length > 0
      setWhole(hit)
    }
    const canvas = map.getCanvas()
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const present = layers.filter((id) => map.getLayer(id))
      canvas.style.cursor = present.length > 0 && map.queryRenderedFeatures(e.point, { layers: present }).length > 0 ? 'pointer' : ''
    }
    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
      canvas.style.cursor = ''
    }
  }, [map, line])

  useEffect(() => {
    if (!map || !line || !lineStop) return
    const color = KIND[lineStop.kind].color
    map.addSource('transit-line', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.coords } },
          ...line.stops.map((s) => ({
            type: 'Feature' as const,
            properties: { name: s.name === lineStop.name ? '' : s.name },
            geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
          })),
        ],
      },
    })
    const before = map.getLayer('routes-casing') ? 'routes-casing' : undefined
    map.addLayer(
      {
        id: 'transit-line',
        type: 'line',
        source: 'transit-line',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': 3, 'line-opacity': 0.5 },
      },
      before,
    )
    map.addLayer(
      {
        id: 'transit-line-hit',
        type: 'line',
        source: 'transit-line',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': color, 'line-width': 22, 'line-opacity': 0 },
      },
      before,
    )
    map.addLayer(
      {
        id: 'transit-line-stops',
        type: 'circle',
        source: 'transit-line',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 3.5, 'circle-color': '#fff', 'circle-stroke-color': color, 'circle-stroke-width': 1.5 },
      },
      before,
    )
    map.addLayer({
      id: 'transit-line-names',
      type: 'symbol',
      source: 'transit-line',
      filter: ['==', ['geometry-type'], 'Point'],
      minzoom: 13,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.7,
      },
      paint: { 'text-color': color, 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    })
    return () => {
      if (!map.getStyle()) return
      for (const id of ['transit-line-names', 'transit-line-stops', 'transit-line-hit', 'transit-line']) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource('transit-line')) map.removeSource('transit-line')
    }
  }, [map, line, lineStop])

  useEffect(() => {
    if (!map) return
    return drawRoutes(
      map,
      resolved.flatMap((route, i) => (route && !route.estimated ? [{ route, color: FOOT_COLOR, id: i, walk: true }] : [])),
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

  const focus = setActive

  return (
    <div className="space-y-6">
      <BaseMap onReady={setMap} className="h-[60svh] max-h-[520px] min-h-[320px]" />
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
          {t(label)}
          {stop.line && <span className="rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: color }}>{stop.line}</span>}
        </span>
        <span className="mt-0.5 block truncate font-medium">{stop.name}</span>
        {!hasLeg(stop.kind) ? (
          <span className="mt-1 block text-sm text-muted-foreground">{t('direkt an der Location')}</span>
        ) : loading ? (
          <span className="mt-1 block text-sm text-muted-foreground">{t('Route wird berechnet…')}</span>
        ) : route ? (
          <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Footprints className="size-3.5" /> {route.estimated ? t('ca.') + ' ' : ''}{route.minutes} {t('Min')} · {formatKm(route.meters)}
          </span>
        ) : null}
        <DirectionsLinks to={to} name={stop.name} mode={travelMode} className="mt-3" />
      </span>
    </div>
  )
}
