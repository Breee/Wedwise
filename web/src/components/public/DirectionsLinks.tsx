import { appleDirectionsUrl, googleDirectionsUrl, type DirectionsMode, type LngLat } from '@/lib/geo'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function DirectionsLinks({
  to,
  name,
  mode,
  from,
  className,
}: {
  to: LngLat
  name: string
  mode: DirectionsMode
  from?: LngLat
  className?: string
}) {
  const chip = 'inline-flex min-h-10 items-center rounded-full border bg-background px-3 py-1.5 text-xs sm:min-h-0 transition-colors hover:bg-muted'
  // Android opens its own chooser with every installed navigation app.
  if (!from && /Android/i.test(navigator.userAgent)) {
    const [lng, lat] = to
    return (
      <span className={cn('flex flex-wrap gap-2', className)} onClick={(e) => e.stopPropagation()}>
        <a href={`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(name)})`} className={chip}>
          {t('In Navi-App öffnen')} ↗
        </a>
      </span>
    )
  }
  return (
    <span className={cn('flex flex-wrap gap-2', className)} onClick={(e) => e.stopPropagation()}>
      <a href={googleDirectionsUrl(to, mode, from)} target="_blank" rel="noreferrer" className={chip}>
        Google Maps ↗
      </a>
      <a href={appleDirectionsUrl(to, name, mode, from)} target="_blank" rel="noreferrer" className={chip}>
        {t('Apple Karten')} ↗
      </a>
    </span>
  )
}
