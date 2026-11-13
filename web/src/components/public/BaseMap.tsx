import { useEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { cn } from '@/lib/utils'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

maplibregl.setWorkerUrl(workerUrl)

export function BaseMap({
  onReady,
  className,
  children,
}: {
  onReady: (map: MapLibreMap) => void | (() => void)
  className?: string
  children?: React.ReactNode
}) {
  const container = useRef<HTMLDivElement>(null)
  const ready = useRef(onReady)
  ready.current = onReady

  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [7.85, 47.99],
      zoom: 12,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': t('Strg + Scrollen zum Zoomen'),
        'CooperativeGesturesHandler.MacHelpText': t('⌘ + Scrollen zum Zoomen'),
        'CooperativeGesturesHandler.MobileHelpText': t('Mit zwei Fingern bewegen'),
      },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    let cleanup: void | (() => void)
    map.once('load', () => {
      cleanup = ready.current(map)
    })
    return () => {
      cleanup?.()
      map.remove()
    }
  }, [])

  return (
    <div className={cn('relative overflow-hidden rounded-3xl border border-gold/40 shadow-xl shadow-primary/10', className)}>
      <div ref={container} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[oklch(0.96_0.02_80)] mix-blend-multiply" />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/60" />
      {children}
    </div>
  )
}

export function markerElement(html: string, className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  el.innerHTML = html
  return el
}
