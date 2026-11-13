import { useState } from 'react'
import { t } from '@/lib/i18n'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTRIBUTION_STATUS_LABEL } from '@/lib/format'
import type { Contribution } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ContactLinks } from './ContactLinks'
import { STATUS_TONE, fromMinutes, toMinutes, useContributionMutations } from './contributions'

const DEFAULT_DURATION = 15
const DEFAULT_START = '20:00'
const PLAN_ID = 'plan'

function duration(c: Contribution) {
  return c.durationMinutes > 0 ? c.durationMinutes : DEFAULT_DURATION
}

export function Schedule({ items, onOpen }: { items: Contribution[]; onOpen: (c: Contribution) => void }) {
  const { setScheduleAll, setSchedule } = useContributionMutations()
  const relevant = items.filter((c) => c.status !== 'rejected')
  const planned = relevant
    .filter((c) => toMinutes(c.slotTime) !== null)
    .sort((a, b) => toMinutes(a.slotTime)! - toMinutes(b.slotTime)!)
  const unplanned = relevant.filter((c) => toMinutes(c.slotTime) === null)
  const total = planned.reduce((sum, c) => sum + duration(c), 0)
  const start = planned[0]?.slotTime ?? DEFAULT_START
  const [active, setActive] = useState<Contribution | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function save(order: Contribution[], startTime = start) {
    let cursor = toMinutes(startTime) ?? toMinutes(DEFAULT_START)!
    setScheduleAll.mutate(
      order.map((c) => {
        const item = { id: c.id, slotTime: fromMinutes(cursor), durationMinutes: duration(c) }
        cursor += item.durationMinutes
        return item
      }),
    )
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActive(null)
    if (!over) return
    const activeId = Number(active.id)
    const fromIndex = planned.findIndex((c) => c.id === activeId)
    const overIndex = planned.findIndex((c) => c.id === Number(over.id))
    if (fromIndex >= 0) {
      if (overIndex < 0 || overIndex === fromIndex) return
      save(arrayMove(planned, fromIndex, overIndex))
      return
    }
    const item = unplanned.find((c) => c.id === activeId)
    if (!item || (over.id !== PLAN_ID && overIndex < 0)) return
    const next = [...planned]
    next.splice(overIndex < 0 ? next.length : overIndex, 0, item)
    save(next)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActive(relevant.find((c) => c.id === Number(active.id)) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{t('Ablaufplan')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('{n} geplant · {total} Min. gesamt · Ende {end}', { n: planned.length, total, end: fromMinutes((toMinutes(start) ?? 0) + total) })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="plan-start" className="text-sm text-muted-foreground">
                {t('Beginn')}
              </Label>
              <Input
                id="plan-start"
                type="time"
                className="w-32"
                value={start}
                disabled={planned.length === 0}
                onChange={(e) => e.target.value && save(planned, e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <PlanList planned={planned} onOpen={onOpen} onRemove={(c) => setSchedule.mutate({ id: c.id, slotTime: '', durationMinutes: c.durationMinutes })} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t('Ohne Uhrzeit')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('{n} Beiträge · in den Plan ziehen', { n: unplanned.length })}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {unplanned.length === 0 && <p className="text-sm text-muted-foreground">{t('Alles eingeplant.')}</p>}
            {unplanned.map((c) => (
              <UnplannedItem key={c.id} c={c} onOpen={onOpen} />
            ))}
          </CardContent>
        </Card>
      </div>
      <DragOverlay>
        {active && (
          <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
            <span className="font-medium">{active.title || t('Ohne Titel')}</span>
            <span className="block text-xs text-muted-foreground">{active.contactName}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function PlanList({
  planned,
  onOpen,
  onRemove,
}: {
  planned: Contribution[]
  onOpen: (c: Contribution) => void
  onRemove: (c: Contribution) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: PLAN_ID })
  return (
    <SortableContext items={planned.map((c) => c.id)} strategy={verticalListSortingStrategy}>
      <ol
        ref={setNodeRef}
        className={cn('relative min-h-24 space-y-1 rounded-lg border-l border-border pl-6 transition-colors', isOver && 'bg-muted/40')}
      >
        {planned.length === 0 && (
          <li className="py-6 text-sm text-muted-foreground">{t('Noch nichts geplant. Beiträge hierher ziehen.')}</li>
        )}
        {planned.map((c) => (
          <PlanItem key={c.id} c={c} onOpen={onOpen} onRemove={onRemove} />
        ))}
      </ol>
    </SortableContext>
  )
}

function PlanItem({ c, onOpen, onRemove }: { c: Contribution; onOpen: (c: Contribution) => void; onRemove: (c: Contribution) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id })
  const start = toMinutes(c.slotTime)!
  const end = start + duration(c)
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative flex items-start gap-1 rounded-lg transition-colors hover:bg-muted/60', isDragging && 'opacity-40')}
    >
      <span className="absolute -left-[31px] top-3 size-2.5 rounded-full border-2 border-background bg-primary" />
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('{title} verschieben', { title: c.title || t('Beitrag') })}
        className="cursor-grab touch-none rounded p-3 sm:mt-2.5 sm:p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={() => onOpen(c)} className="flex min-w-0 flex-1 items-start gap-4 px-2 py-2 text-left">
        <div className="w-28 shrink-0 font-mono text-sm tabular-nums">
          {c.slotTime}
          <span className="text-muted-foreground"> – {fromMinutes(end)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{c.title || t('Ohne Titel')}</p>
          <p className="text-xs text-muted-foreground">
            {c.contactName}{t(' · {n} Min.', { n: duration(c) })}
            {c.needs && ` · ${c.needs}`}
          </p>
          <ContactLinks phone={c.phone} messengers={c.messengers} className="mt-1" />
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs', STATUS_TONE[c.status])}>
          {CONTRIBUTION_STATUS_LABEL[c.status]}
        </span>
      </button>
      <Button variant="ghost" size="icon" className="mt-1.5 size-7" aria-label={t('Aus dem Plan entfernen')} onClick={() => onRemove(c)}>
        <X className="size-4" />
      </Button>
    </li>
  )
}

function UnplannedItem({ c, onOpen }: { c: Contribution; onOpen: (c: Contribution) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id })
  return (
    <div
      ref={setNodeRef}
      className={cn('flex items-center gap-1 rounded-lg border px-2 py-2 text-sm hover:bg-muted/60', isDragging && 'opacity-40')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('{title} verschieben', { title: c.title || t('Beitrag') })}
        className="cursor-grab touch-none rounded p-3 sm:p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={() => onOpen(c)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="font-medium">{c.title || t('Ohne Titel')}</span>
          <span className="block text-xs text-muted-foreground">{c.contactName}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs', STATUS_TONE[c.status])}>
          {CONTRIBUTION_STATUS_LABEL[c.status]}
        </span>
      </button>
    </div>
  )
}
