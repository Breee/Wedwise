import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { LngLat, Route } from '@/lib/geo'
import { markerElement } from './BaseMap'

export const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'

const FIT_PADDING_DESKTOP = { top: 80, bottom: 60, left: 60, right: 60 }
const FIT_PADDING_MOBILE = { top: 64, bottom: 40, left: 28, right: 28 }
/** Smaller padding on narrow maps so routes stay legible on phones. */
export function fitPadding(map: MapLibreMap) {
  return map.getContainer().clientWidth < 640 ? FIT_PADDING_MOBILE : FIT_PADDING_DESKTOP
}

export function venueMarker(map: MapLibreMap, venue: LngLat): maplibregl.Marker {
  return new maplibregl.Marker({ element: markerElement(HEART_SVG, 'wed-marker wed-marker-venue'), anchor: 'center' })
    .setLngLat(venue)
    .addTo(map)
}

export type RouteFeature = { route: Route; color: string; id: number; icon?: string }

const DASH_SEQUENCE = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
]

// Draws animated routes with a minute label at the midpoint. Returns a cleanup.
export function drawRoutes(map: MapLibreMap, routes: RouteFeature[]): () => void {
  const data = {
    type: 'FeatureCollection' as const,
    features: routes.map(({ route, color, id }) => ({
      type: 'Feature' as const,
      properties: { i: id, color },
      geometry: { type: 'LineString' as const, coordinates: route.coordinates },
    })),
  }
  const src = map.getSource('routes') as maplibregl.GeoJSONSource | undefined
  if (src) src.setData(data)
  else {
    map.addSource('routes', { type: 'geojson', data })
    const layout = { 'line-cap': 'round' as const, 'line-join': 'round' as const }
    map.addLayer({ id: 'routes-casing', type: 'line', source: 'routes', layout, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } })
    map.addLayer({ id: 'routes-line', type: 'line', source: 'routes', layout, paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-opacity': 0.55 } })
    map.addLayer({ id: 'routes-dash', type: 'line', source: 'routes', layout, paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-dasharray': [0, 4, 3] } })
  }

  const labels = routes.map(({ route, color, icon }) => {
    const c = route.coordinates
    const mid: LngLat = c.length === 2 ? [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2] : c[Math.floor(c.length / 2)]
    const el = markerElement(`${icon ?? ''}<span>${route.minutes} Min</span>`, 'wed-route-label')
    el.style.setProperty('--stop-color', color)
    return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map)
  })

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let step = 0
  let last = 0
  let frame = reduceMotion ? 0 : requestAnimationFrame(function animate(t) {
    if (t - last > 70) {
      step = (step + 1) % DASH_SEQUENCE.length
      if (map.getLayer('routes-dash')) map.setPaintProperty('routes-dash', 'line-dasharray', DASH_SEQUENCE[step])
      last = t
    }
    frame = requestAnimationFrame(animate)
  })
  return () => {
    cancelAnimationFrame(frame)
    labels.forEach((l) => l.remove())
  }
}
