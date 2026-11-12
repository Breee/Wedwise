import { queryOptions } from '@tanstack/react-query'
import { api } from './api'
import type {
  Content,
  Contribution,
  ContributionNote,
  GuestView,
  InviteLink,
  InviteLinkStatus,
  Me,
  PublicContent,
  ResponseWithAttendees,
  Summary,
  Theme,
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

export const themesQuery = queryOptions({
  queryKey: ['themes'],
  queryFn: () => api.get<{ themes: Theme[] }>('/themes').then((r) => r.themes),
  staleTime: Infinity,
})

export const contentQuery = queryOptions({
  queryKey: ['content'],
  queryFn: () => api.get<Content>('/content'),
})

export const inviteLinkQuery = (link: string) =>
  queryOptions({
    queryKey: ['rsvp', 'links', link],
    queryFn: () => api.get<InviteLinkStatus>(`/rsvp/links/${encodeURIComponent(link)}`),
    retry: false,
  })

export const inviteLinksQuery = queryOptions({
  queryKey: ['invite-links'],
  queryFn: async () => (await api.get<{ links: InviteLink[] }>('/invite-links')).links ?? [],
})

export const rsvpQuery = (token: string) =>
  queryOptions({
    queryKey: ['rsvp', token],
    queryFn: () => api.get<GuestView>(`/rsvp/${encodeURIComponent(token)}`),
    retry: false,
  })

export const summaryQuery = queryOptions({
  queryKey: ['rsvp-summary'],
  queryFn: () => api.get<Summary>('/rsvp-summary'),
})

export const responsesQuery = queryOptions({
  queryKey: ['responses'],
  queryFn: async () =>
    (await api.get<{ responses: ResponseWithAttendees[] }>('/responses')).responses ?? [],
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

export const usersQuery = queryOptions({
  queryKey: ['users'],
  queryFn: async () => (await api.get<{ users: import('./types').User[] }>('/users')).users ?? [],
})
