import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTRIBUTION_STATUS_LABEL } from '@/lib/format'
import type { Contribution } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STATUS_TONE, fromMinutes, toMinutes } from './contributions'

export function Schedule({ items, onOpen }: { items: Contribution[]; onOpen: (c: Contribution) => void }) {
  const relevant = items.filter((c) => c.status !== 'rejected')
  const planned = relevant
    .filter((c) => toMinutes(c.slotTime) !== null)
    .sort((a, b) => toMinutes(a.slotTime)! - toMinutes(b.slotTime)!)
  const unplanned = relevant.filter((c) => toMinutes(c.slotTime) === null)
  const total = planned.reduce((sum, c) => sum + c.durationMinutes, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Ablaufplan</CardTitle>
          <p className="text-sm text-muted-foreground">
            {planned.length} geplant · {total} Min. gesamt
          </p>
        </CardHeader>
        <CardContent>
          {planned.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch nichts geplant. Uhrzeit im Beitrag setzen.</p>
          )}
          <ol className="relative space-y-1 border-l border-border pl-6">
            {planned.map((c, i) => {
              const start = toMinutes(c.slotTime)!
              const end = start + c.durationMinutes
              const prev = planned[i - 1]
              const overlap = prev ? toMinutes(prev.slotTime)! + prev.durationMinutes > start : false
              return (
                <li key={c.id} className="relative">
                  <span className="absolute -left-[31px] top-3 size-2.5 rounded-full border-2 border-background bg-primary" />
                  <button
                    type="button"
                    onClick={() => onOpen(c)}
                    className={cn(
                      'flex w-full items-start gap-4 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60',
                      overlap && 'bg-amber-50',
                    )}
                  >
                    <div className="w-28 shrink-0 font-mono text-sm tabular-nums">
                      {c.slotTime}
                      {c.durationMinutes > 0 && <span className="text-muted-foreground"> – {fromMinutes(end)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.title || 'Ohne Titel'}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.contactName}
                        {c.durationMinutes > 0 && ` · ${c.durationMinutes} Min.`}
                        {c.needs && ` · ${c.needs}`}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs', STATUS_TONE[c.status])}>
                      {CONTRIBUTION_STATUS_LABEL[c.status]}
                    </span>
                    {overlap && (
                      <span role="img" aria-label="Überschneidung" title="Überschneidung mit vorherigem Beitrag">
                        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Ohne Uhrzeit</CardTitle>
          <p className="text-sm text-muted-foreground">{unplanned.length} Beiträge</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {unplanned.length === 0 && <p className="text-sm text-muted-foreground">Alles eingeplant.</p>}
          {unplanned.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/60"
            >
              <span>
                <span className="font-medium">{c.title || 'Ohne Titel'}</span>
                <span className="block text-xs text-muted-foreground">{c.contactName}</span>
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_TONE[c.status])}>
                {CONTRIBUTION_STATUS_LABEL[c.status]}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
