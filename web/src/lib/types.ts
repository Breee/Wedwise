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
  bike: string
  image?: string
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

export type StopKind = 'tram' | 'train' | 'bus' | 'parking'

export interface Stop {
  name: string
  kind: StopKind
  line: string
  lat: number
  lng: number
  walk?: Walk
}

export interface Walk {
  minutes: number
  meters: number
  coords: [number, number][]
}

export interface LineStop {
  name: string
  lat: number
  lng: number
}

export type LineKind = 'tram' | 'bike'

export interface TransitLine {
  name: string
  kind: LineKind
  color: string
  coords: [number, number][]
  stops: LineStop[]
}

export interface Travel {
  lat: number
  lng: number
  stops: Stop[]
  lines: TransitLine[]
}

export type StayKind = 'hotel' | 'apartment'

export interface Hotel {
  name: string
  area: string
  kind?: StayKind
  lat: number
  lng: number
  priceTier: 1 | 2 | 3
  note: string
  url: string
  bookingUrl: string
  routes?: { foot?: Walk; bike?: Walk; car?: Walk; toStop?: Walk }
}

export interface Accommodation {
  checkIn: string
  checkOut: string
  hotels: Hotel[]
}

export interface ThemeColors {
  background: string
  foreground: string
  card: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  border: string
  ring: string
  gold: string
  sage: string
  blush: string
}

export interface Theme {
  name: string
  label: string
  decoration: 'none' | 'botanical' | 'dusk' | 'forest' | 'night'
  colors: ThemeColors
  fonts: { display: string; script: string; body: string }
}

export interface Content {
  theme: string
  hero: Hero
  introduction: { text: string }
  location: Location
  travel: Travel
  accommodation: Accommodation
  schedule: ScheduleEntry[]
  faq: FAQEntry[]
  updatedAt?: string
}

export interface EventInfo {
  title: string
  language?: string
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
  timezone?: string
  contributionMinutes?: number
  musicGenres?: string[]
}

export interface PublicContent {
  event: EventInfo
  content: Content
  theme: Theme
}

export type RsvpStatus = 'yes' | 'no'

export type Diet = 'none' | 'vegetarian' | 'vegan' | 'other'

export interface Attendee {
  id?: number
  name: string
  isChild: boolean
  age: number
  photoOk: boolean
  diet: Diet | ''
  allergies: string
}

export interface ContributionRequest {
  title: string
  description: string
  needs: string
  phone: string
  messengers: Messenger[]
}

export type MessengerKind = 'whatsapp' | 'signal' | 'telegram'

export interface Messenger {
  kind: MessengerKind
  /** Phone number or username; empty means the contribution phone applies. */
  handle: string
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
  editToken?: string
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
  messengers: Messenger[]
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

export interface User {
  id: number
  username: string
  email: string
  displayName: string
  role: Role
  active: boolean
  createdAt: string
  updatedAt: string
}
