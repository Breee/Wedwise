import { useQueries } from '@tanstack/react-query'
import { Bus, Footprints, TrainFront, TramFront } from 'lucide-react'
import { t } from '@/lib/i18n'
import { routeQuery, type LngLat } from '@/lib/geo'
import type { Stop, Travel } from '@/lib/types'

const KINDS = {
  tram: { label: 'Tram', Icon: TramFront },
  train: { label: 'S-Bahn', Icon: TrainFront },
  bus: { label: 'Bus', Icon: Bus },
} as const

type TransitStop = Stop & { kind: keyof typeof KINDS }

export function ArrivalSummary({ travel }: { travel: Travel }) {
  const venue: LngLat = [travel.lng, travel.lat]
  const stops = travel.stops.filter((s): s is TransitStop => s.kind in KINDS)
  const routes = useQueries({ queries: stops.map((s) => routeQuery('foot', [s.lng, s.lat], venue)) })
  if (stops.length === 0) return null
  const rows = stops
    .map((stop, i) => ({ stop, route: routes[i].data }))
    .sort((a, b) => (a.route?.minutes ?? Infinity) - (b.route?.minutes ?? Infinity))
  return (
    <ul className="space-y-2.5">
      {rows.map(({ stop, route }) => {
        const { Icon, label } = KINDS[stop.kind]
        return (
          <li key={`${stop.kind}:${stop.name}`} className="flex items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium">{[t(label), stop.line].filter(Boolean).join(' ')}</span>{' '}
              {t('bis')} <span className="font-medium">{stop.name}</span>
              {route && (
                <span className="text-muted-foreground">
                  {' · '}<Footprints className="mb-0.5 inline size-3.5" />{' '}
                  {route.estimated ? t('ca.') + ' ' : ''}{route.minutes} {t('Min')} {t('zu Fuß')}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
