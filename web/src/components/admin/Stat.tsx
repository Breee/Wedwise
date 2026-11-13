import { Card, CardContent } from '@/components/ui/card'

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="py-4 sm:py-6">
      <CardContent className="px-4 sm:px-6">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase sm:tracking-widest">{label}</p>
        <p className="mt-1 font-display text-3xl sm:mt-2 sm:text-4xl text-primary">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{hint}</p>}
      </CardContent>
    </Card>
  )
}
