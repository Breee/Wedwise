import { Card, CardContent } from '@/components/ui/card'

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">{label}</p>
        <p className="mt-2 font-display text-4xl text-primary">{value}</p>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
