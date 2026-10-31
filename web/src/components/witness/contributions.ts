import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { CONTRIBUTION_STATUS_LABEL } from '@/lib/format'
import type { Contribution, ContributionStatus } from '@/lib/types'

export const STATUSES = Object.keys(CONTRIBUTION_STATUS_LABEL) as ContributionStatus[]

export const STATUS_TONE: Record<ContributionStatus, string> = {
  new: 'bg-primary/15 text-primary',
  needs_clarification: 'bg-amber-100 text-amber-900',
  planning: 'bg-sky-100 text-sky-900',
  confirmed: 'bg-secondary/40 text-secondary-foreground',
  rejected: 'bg-muted text-muted-foreground line-through',
}

export function isOpen(c: Contribution) {
  return c.status === 'new' || c.status === 'needs_clarification'
}

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function useContributionMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contributions'] })
  const onError = (e: unknown) => toast.error(errorMessage(e))

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ContributionStatus }) =>
      api.put(`/contributions/${id}/status`, { status }),
    onSuccess: () => {
      invalidate()
      toast.success('Status aktualisiert.')
    },
    onError,
  })

  const setSchedule = useMutation({
    mutationFn: ({ id, slotTime, durationMinutes }: { id: number; slotTime: string; durationMinutes: number }) =>
      api.put(`/contributions/${id}/schedule`, { slotTime, durationMinutes }),
    onSuccess: () => {
      invalidate()
      toast.success('Zeitplan gespeichert.')
    },
    onError,
  })

  const setScheduleAll = useMutation({
    mutationFn: (items: { id: number; slotTime: string; durationMinutes: number }[]) =>
      api.put('/contributions/schedule', { items }),
    onSuccess: invalidate,
    onError,
  })

  const addNote = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => api.post(`/contributions/${id}/notes`, { text }),
    onSuccess: invalidate,
    onError,
  })

  return { setStatus, setSchedule, setScheduleAll, addNote }
}
