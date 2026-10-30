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

export type RsvpStatus = 'yes' | 'no' | 'maybe' | 'pending'

export interface Attendee {
  id?: number
  name: string
  attending: boolean
  isChild: boolean
  diet: string
  allergies: string
  notes: string
}

export interface RsvpView {
  invitation: { name: string; maxGuests: number; token: string }
  status: RsvpStatus
  message: string
  attendees: Attendee[]
  submitted: boolean
}

export interface RsvpSubmit {
  status: RsvpStatus
  message: string
  attendees: Omit<Attendee, 'id'>[]
}

export interface Summary {
  invitations: number
  activeInvitations: number
  respondedInvitations: number
  statusCounts: Record<string, number>
  attendeesTotal: number
  attendeesAttending: number
  children: number
  dietCounts: Record<string, number>
  allergies: string[]
}

export interface Invitation {
  id: number
  name: string
  token: string
  maxGuests: number
  active: boolean
  isPublic: boolean
  createdAt: string
  updatedAt: string
  url?: string
}

export interface Guest {
  id: number
  displayName: string
  email: string
  invitationId: number
  notes: string
  createdAt: string
  updatedAt: string
}

export type ContributionStatus = 'new' | 'needs_clarification' | 'planning' | 'confirmed' | 'rejected'

export interface Contribution {
  id: number
  invitationId: number
  title: string
  category: string
  description: string
  participants: string
  durationMinutes: number
  technicalRequirements: string
  equipment: string
  preferredTime: string
  contactInformation: string
  status: ContributionStatus
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

export type ContributionRequest = Omit<Contribution, 'id' | 'invitationId' | 'createdAt' | 'updatedAt' | 'status'> & {
  status?: ContributionStatus
}
