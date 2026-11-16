import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { LngLat, Route } from '@/lib/geo'
import { markerElement } from './BaseMap'

export const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'

const FIT_PADDING_DESKTOP = { top: 80, bottom: 60, left: 60, right: 60 }
const FIT_PADDING_MOBILE = { top: 88, bottom: 120, left: 72, right: 72 }
/** Smaller padding on narrow maps so routes stay legible on phones. */
export function fitPadding(map: MapLibreMap) {
  return map.getContainer().clientWidth < 640 ? FIT_PADDING_MOBILE : FIT_PADDING_DESKTOP
}

export function venueMarker(map: MapLibreMap, venue: LngLat, name = ''): maplibregl.Marker {
  const element = markerElement(HEART_SVG, 'wed-marker wed-marker-venue')
  if (name) {
    const label = document.createElement('span')
    label.className = 'wed-venue-name'
    label.textContent = name
    element.append(label)
  }
  return new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(venue).addTo(map)
}

export type RouteFeature = { route: Route; color: string; id: number; icon?: string; walk?: boolean }

export const FOOT_COLOR = '#5e7f63'
const FOOT_PATHS = [
  'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z',
  'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z',
  'M16 17h4M4 13h4',
]

const DASH_SEQUENCE = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
]

// Space a pin (hotel, stop, venue) occupies on screen, kept free of labels.
const PIN_BOX = 28

// The point half way along a line, measured by length rather than by vertex count.
function halfway(c: LngLat[]): { at: LngLat; upright: boolean } {
  const scale = Math.cos((c[0][1] * Math.PI) / 180)
  const lengths = c.slice(1).map((p, i) => Math.hypot((p[0] - c[i][0]) * scale, p[1] - c[i][1]))
  let rest = lengths.reduce((sum, l) => sum + l, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i] && lengths[i] > 0) {
      const f = rest / lengths[i]
      const dx = (c[i + 1][0] - c[i][0]) * scale
      const dy = c[i + 1][1] - c[i][1]
      return { at: [c[i][0] + (c[i + 1][0] - c[i][0]) * f, c[i][1] + dy * f], upright: Math.abs(dy) > Math.abs(dx) }
    }
    rest -= lengths[i]
  }
  return { at: c[0], upright: false }
}

// White rounded background that stretches to fit a label.
function pill(): ImageData {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.roundRect(1, 1, size - 2, size - 2, 14)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  return ctx.getImageData(0, 0, size, size)
}

// Footprints shown in front of the minutes of a walk, the same icon as in the cards.
function footprints(): ImageData {
  const size = 28
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = FOOT_COLOR
  ctx.lineWidth = 2
  ctx.lineCap = ctx.lineJoin = 'round'
  for (const d of FOOT_PATHS) ctx.stroke(new Path2D(d))
  return ctx.getImageData(0, 0, size, size)
}

// Draws animated routes with a minute label beside each one. Returns a cleanup.

export function drawRoutes(map: MapLibreMap, routes: RouteFeature[], withLabels = true): () => void {
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

  const point = (at: LngLat, properties: Record<string, string | boolean>) => ({
    type: 'Feature' as const,
    properties,
    geometry: { type: 'Point' as const, coordinates: at },
  })
  const labelData = {
    type: 'FeatureCollection' as const,
    features: (withLabels ? routes : []).flatMap(({ route, color, walk }) => {
      const c = route.coordinates
      const middle = halfway(c)
      return [
        point(middle.at, { kind: middle.upright ? 'upright' : 'level', text: `${route.minutes} Min`, color, walk: !!walk }),
        point(c[0], { kind: 'pin' }),
        point(c[c.length - 1], { kind: 'pin' }),
      ]
    }),
  }
  const labelSrc = map.getSource('route-labels') as maplibregl.GeoJSONSource | undefined
  if (labelSrc) labelSrc.setData(labelData)
  else {
    map.addImage('route-pill', pill(), { pixelRatio: 2, stretchX: [[14, 18]], stretchY: [[14, 18]], content: [10, 6, 22, 26] })
    map.addImage('route-walk', footprints(), { pixelRatio: 2 })
    map.addImage('route-pin', new ImageData(PIN_BOX, PIN_BOX))
    map.addSource('route-labels', { type: 'geojson', data: labelData })
    // The map places these labels itself: it tries each side in turn and keeps
    // them off each other and off the pins, again on every zoom.
    // Beside the line first: left or right of an upright stretch, above or below a level one.
    const sides = { upright: ['left', 'right', 'top', 'bottom'], level: ['bottom', 'top', 'left', 'right'] } as const
    for (const kind of ['upright', 'level'] as const) {
      map.addLayer({
        id: `route-labels-${kind}`,
        type: 'symbol',
        source: 'route-labels',
        filter: ['==', ['get', 'kind'], kind],
        layout: {
          'text-field': ['case', ['get', 'walk'], ['format', ['image', 'route-walk'], {}, ['concat', ' ', ['get', 'text']], {}], ['get', 'text']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-variable-anchor': [...sides[kind]],
          'text-radial-offset': 1.5,
          'text-justify': 'auto',
          'icon-image': 'route-pill',
          'icon-text-fit': 'both',
          'icon-text-fit-padding': [3, 7, 3, 7],
        },
        paint: { 'text-color': ['get', 'color'] },
      })
    }
    // Layers further up are placed first, so the pins claim their space before the labels.
    map.addLayer({
      id: 'route-pins',
      type: 'symbol',
      source: 'route-labels',
      filter: ['==', ['get', 'kind'], 'pin'],
      layout: { 'icon-image': 'route-pin', 'icon-allow-overlap': true },
    })
  }

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
    const labels = map.getSource('route-labels') as maplibregl.GeoJSONSource | undefined
    labels?.setData({ type: 'FeatureCollection', features: [] })
  }
}
