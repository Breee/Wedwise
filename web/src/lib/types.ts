export type Role = 'couple' | 'witness' | 'admin'

export interface Me {
  authenticated: boolean
  id?: number
  username?: string
  email?: string
  displayName?: string
  role?: Role
  permissions: string[]
}

export interface Hero {
  eyebrow: string
  headline: string
  subtitle: string
  note: string
  image?: string
}

export interface Location {
  name: string
  address: string
  description: string
  navigationUrl: string
  transport: string
  parking: string
}

export interface ScheduleEntry {
  id: number
  time: string
  title: string
  description: string
  order: number
}

export interface FAQEntry {
  id: number
  question: string
  answer: string
  order: number
}

export interface Content {
  hero: Hero
  introduction: { text: string }
  location: Location
  schedule: ScheduleEntry[]
  faq: FAQEntry[]
  updatedAt?: string
}

export interface EventInfo {
  title: string
  couple: { name: string; role: string }[]
  date: string
  venue: {
    name: string
    address: string
    city: string
    mapUrl: string
    description: string
    navigationUrl: string
    transport: string
    parking: string
  }
  hero: Hero
}

export interface PublicContent {
  event: EventInfo
  content: Content
}

export type RsvpStatus = 'yes' | 'no'

export type Diet = 'none' | 'vegetarian' | 'vegan' | 'other'

export interface Attendee {
  id?: number
  name: string
  isChild: boolean
  diet: Diet | ''
  allergies: string
}

export interface ContributionRequest {
  title: string
  description: string
  needs: string
  phone: string
}

export interface RsvpSubmit {
  contactName: string
  email: string
  phone: string
  status: RsvpStatus
  message: string
  musicGenres: string
  musicSong: string
  attendees: Omit<Attendee, 'id'>[]
  contribution: ContributionRequest | null
}

export interface Response {
  id: number
  contactName: string
  email: string
  phone: string
  status: RsvpStatus
  message: string
  musicGenres: string
  musicSong: string
  submittedAt: string
  updatedAt: string
}

export interface GuestView extends Response {
  editToken: string
  attendees: Attendee[]
  contribution: ContributionRequest | null
}

export interface ResponseWithAttendees extends Response {
  attendees: Attendee[]
}

export interface InviteLinkStatus {
  pinRequired: boolean
  unlocked: boolean
}

export interface InviteLink {
  id: number
  token: string
  hasPin: boolean
  active: boolean
  responses: number
  createdAt: string
  updatedAt: string
}

export interface Summary {
  responses: number
  statusCounts: Record<string, number>
  attendeesAttending: number
  children: number
  dietCounts: Record<string, number>
  allergies: { name: string; allergies: string }[]
}

export type ContributionStatus = 'new' | 'needs_clarification' | 'planning' | 'confirmed' | 'rejected'

export interface Contribution {
  id: number
  responseId: number
  contactName: string
  title: string
  description: string
  needs: string
  phone: string
  status: ContributionStatus
  slotTime: string
  durationMinutes: number
  createdAt: string
  updatedAt: string
}

export interface ContributionNote {
  id: number
  contributionId: number
  authorUserId: number
  text: string
  createdAt: string
}
