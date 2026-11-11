import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Clock, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CONTRIBUTION_STATUS_LABEL } from '@/lib/format'
import type { Contribution, ContributionStatus } from '@/lib/types'
import { STATUSES, STATUS_TONE, useContributionMutations } from './contributions'

export function Board({ items, onOpen }: { items: Contribution[]; onOpen: (c: Contribution) => void }) {
  const { setStatus } = useContributionMutations()
  const [activeId, setActiveId] = useState<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const active = items.find((c) => c.id === activeId) ?? null

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const target = e.over?.id as ContributionStatus | undefined
    const item = items.find((c) => c.id === e.active.id)
    if (!target || !item || item.status === target) return
    setStatus.mutate({ id: item.id, status: target })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(Number(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="grid gap-4 md:grid-cols-5">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            items={items.filter((c) => c.status === status)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>{active && <CardBody c={active} className="rotate-2 shadow-xl" />}</DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  items,
  onOpen,
}: {
  status: ContributionStatus
  items: Contribution[]
  onOpen: (c: Contribution) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex min-h-48 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
      aria-label={CONTRIBUTION_STATUS_LABEL[status]}
    >
      <header className="flex items-center justify-between px-1 py-1">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONE[status])}>
          {CONTRIBUTION_STATUS_LABEL[status]}
        </span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </header>
      {items.map((c) => (
        <DraggableCard key={c.id} c={c} onOpen={() => onOpen(c)} />
      ))}
    </section>
  )
}

function DraggableCard({ c, onOpen }: { c: Contribution; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={cn(isDragging && 'opacity-30')}>
      <CardBody c={c} onOpen={onOpen} handle={{ ...attributes, ...listeners }} />
    </div>
  )
}

function CardBody({
  c,
  onOpen,
  handle,
  className,
}: {
  c: Contribution
  onOpen?: () => void
  handle?: Record<string, unknown>
  className?: string
}) {
  return (
    <article className={cn('group rounded-lg border bg-card p-3 text-sm shadow-sm', className)}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="-ml-2 -mt-1.5 cursor-grab touch-none rounded p-3 sm:-ml-1 sm:mt-0.5 sm:p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`${c.title || 'Beitrag'} verschieben`}
          {...handle}
        >
          <GripVertical className="size-4" />
        </button>
        <button type="button" className="flex-1 text-left" onClick={onOpen}>
          <p className="font-medium leading-snug">{c.title || 'Ohne Titel'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{c.contactName}</p>
          {(c.slotTime || c.durationMinutes > 0) && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {c.slotTime || '–'}
              {c.durationMinutes > 0 && ` · ${c.durationMinutes} Min.`}
            </p>
          )}
        </button>
      </div>
    </article>
  )
}
