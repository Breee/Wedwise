import { queryOptions } from '@tanstack/react-query'
import { api } from './api'
import type {
  Content,
  Contribution,
  ContributionNote,
  Guest,
  Invitation,
  Me,
  PublicContent,
  RsvpView,
  Summary,
} from './types'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => api.get<Me>('/auth/me'),
  staleTime: 60_000,
})

export const publicContentQuery = queryOptions({
  queryKey: ['content', 'public'],
  queryFn: () => api.get<PublicContent>('/content/public'),
})

export const contentQuery = queryOptions({
  queryKey: ['content'],
  queryFn: () => api.get<Content>('/content'),
})

export const rsvpQuery = (token: string) =>
  queryOptions({
    queryKey: ['rsvp', token],
    queryFn: () => api.get<RsvpView>(`/rsvp/${encodeURIComponent(token)}`),
  })

export const summaryQuery = queryOptions({
  queryKey: ['rsvp-summary'],
  queryFn: () => api.get<Summary>('/rsvp-summary'),
})

export const invitationsQuery = queryOptions({
  queryKey: ['invitations'],
  queryFn: async () => (await api.get<{ invitations: Invitation[] }>('/invitations')).invitations ?? [],
})

export const guestsQuery = queryOptions({
  queryKey: ['guests'],
  queryFn: async () => (await api.get<{ guests: Guest[] }>('/guests')).guests ?? [],
})

export const contributionsQuery = queryOptions({
  queryKey: ['contributions'],
  queryFn: async () =>
    (await api.get<{ contributions: Contribution[] }>('/contributions')).contributions ?? [],
})

export const contributionQuery = (id: number) =>
  queryOptions({
    queryKey: ['contributions', id],
    queryFn: () => api.get<Contribution & { notes: ContributionNote[] }>(`/contributions/${id}`),
  })
