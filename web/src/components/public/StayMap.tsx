import { useEffect, useMemo, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { BedDouble, CalendarDays, ExternalLink, Home, MapPin } from 'lucide-react'
import type { Accommodation, Hotel, Travel } from '@/lib/types'
import { airbnbUrl, bookingUrl, distanceMeters, formatKm, formatStayDates, type LngLat } from '@/lib/geo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BaseMap, markerElement } from './BaseMap'

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'

const TIER = { 1: { label: '€', hint: 'günstig' }, 2: { label: '€€', hint: 'mittel' }, 3: { label: '€€€', hint: 'gehoben' } } as const

export function StayMap({ accommodation, travel, city }: { accommodation: Accommodation; travel: Travel; city: string }) {
  const venue = useMemo<LngLat>(() => [travel.lng, travel.lat], [travel.lat, travel.lng])
  const hasVenue = travel.lat !== 0 || travel.lng !== 0
  const { checkIn, checkOut } = accommodation
  const hotels = useMemo(
    () =>
      accommodation.hotels
        .map((h) => ({ ...h, meters: hasVenue ? distanceMeters([h.lng, h.lat], venue) : 0 }))
        .sort((a, b) => a.meters - b.meters),
    [accommodation.hotels, hasVenue, venue],
  )
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    if (!map) return
    const markers: maplibregl.Marker[] = []
    const bounds = new maplibregl.LngLatBounds()
    if (hasVenue) {
      markers.push(new maplibregl.Marker({ element: markerElement(HEART_SVG, 'wed-marker wed-marker-venue'), anchor: 'center' }).setLngLat(venue).addTo(map))
      bounds.extend(venue)
    }
    hotels.forEach((h, i) => {
      const el = markerElement(`<span>${i + 1}</span>`, 'wed-marker wed-marker-hotel')
      el.title = h.name
      el.addEventListener('mouseenter', () => setActive(i))
      el.addEventListener('mouseleave', () => setActive(null))
      el.addEventListener('click', () => document.getElementById(`hotel-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
      markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([h.lng, h.lat]).addTo(map))
      bounds.extend([h.lng, h.lat])
    })
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 })
    return () => markers.forEach((m) => m.remove())
  }, [map, hotels, hasVenue, venue])

  useEffect(() => {
    if (!map) return
    map.getContainer().querySelectorAll<HTMLElement>('.wed-marker-hotel').forEach((el, i) => el.classList.toggle('is-active', i === active))
  }, [map, active])

  const stay = formatStayDates(checkIn, checkOut)

  return (
    <div className="space-y-8">
      {stay && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4 text-primary" /> Alle Links sind bereits für <strong className="text-foreground">{stay}</strong> vorausgefüllt.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <BaseMap onReady={setMap} className="h-[380px] lg:sticky lg:top-24 lg:col-span-3 lg:h-[640px]" />
        <ol className="space-y-3 lg:col-span-2">
          {hotels.map((h, i) => (
            <HotelCard
              key={h.name}
              index={i}
              hotel={h}
              meters={h.meters}
              active={active === i}
              city={city}
              checkIn={checkIn}
              checkOut={checkOut}
              onEnter={() => {
                setActive(i)
                map?.easeTo({ center: [h.lng, h.lat], duration: 600 })
              }}
              onLeave={() => setActive(null)}
            />
          ))}
        </ol>
      </div>
      <div className="rounded-3xl border border-gold/40 bg-card/70 p-6 md:flex md:items-center md:justify-between md:gap-6">
        <div className="flex items-start gap-3">
          <Home className="mt-1 size-5 shrink-0 text-sage" />
          <div>
            <h3 className="text-xl">Lieber eine Ferienwohnung?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Rund um die Location und in der Wiehre gibt es viele Wohnungen. Die Suchen sind mit den Daten vorausgefüllt.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 md:mt-0">
          <Button asChild variant="outline">
            <a href={airbnbUrl(city, checkIn, checkOut)} target="_blank" rel="noreferrer">
              Airbnb <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={bookingUrl(`${city} Ferienwohnung`, checkIn, checkOut)} target="_blank" rel="noreferrer">
              Booking.com <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

function HotelCard({
  index,
  hotel,
  meters,
  active,
  city,
  checkIn,
  checkOut,
  onEnter,
  onLeave,
}: {
  index: number
  hotel: Hotel
  meters: number
  active: boolean
  city: string
  checkIn: string
  checkOut: string
  onEnter: () => void
  onLeave: () => void
}) {
  const tier = TIER[hotel.priceTier] ?? TIER[2]
  return (
    <li
      id={`hotel-${index}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        'rounded-2xl border bg-card p-5 transition-all',
        active ? 'border-primary shadow-lg' : 'border-border/60',
      )}
    >
      <div className="flex items-start gap-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg text-primary-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-xl leading-tight">{hotel.name}</h3>
            <span className="shrink-0 rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-foreground/80" title={tier.hint}>
              {tier.label}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {hotel.area && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {hotel.area}
              </span>
            )}
            {meters > 0 && (
              <span className="flex items-center gap-1">
                <BedDouble className="size-3.5" /> {formatKm(meters)} zur Location
              </span>
            )}
          </p>
          {hotel.note && <p className="mt-2 text-sm text-foreground/80">{hotel.note}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href={bookingUrl(`${hotel.name} ${city}`, checkIn, checkOut)} target="_blank" rel="noreferrer">
                Verfügbarkeit prüfen
              </a>
            </Button>
            {hotel.url && (
              <Button asChild size="sm" variant="ghost">
                <a href={hotel.url} target="_blank" rel="noreferrer">
                  Website <ExternalLink className="size-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
