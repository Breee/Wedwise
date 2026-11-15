import { Navigation } from 'lucide-react'
import { appleDirectionsUrl, googleDirectionsUrl, type DirectionsMode, type LngLat } from '@/lib/geo'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function DirectionsLinks({
  to,
  name,
  mode,
  from,
  label,
  className,
}: {
  to: LngLat
  name: string
  mode: DirectionsMode
  from?: LngLat
  label?: string
  className?: string
}) {
  const [lng, lat] = to
  const apps = [
    { name: 'Google Maps', href: googleDirectionsUrl(to, mode, from) },
    { name: t('Apple Karten'), href: appleDirectionsUrl(to, name, mode, from) },
  ]
  if (mode === 'driving' && !from) {
    apps.push({ name: 'Waze', href: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` })
  }
  // Android offers every installed navigation app for geo: links.
  if (!from && /Android/i.test(navigator.userAgent)) {
    apps.push({ name: t('Andere App'), href: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(name)})` })
  }
  return (
    <span className={className} onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'inline-flex min-h-10 items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs transition-colors hover:bg-muted sm:min-h-0',
          )}
        >
          <Navigation className="size-3.5" /> {label ?? t('Route planen')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {apps.map((app) => (
            <DropdownMenuItem key={app.name} asChild>
              <a href={app.href} target="_blank" rel="noreferrer">
                {app.name}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
