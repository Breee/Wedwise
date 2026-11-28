import { greeting, guestNames } from '@/lib/format'
import type { InviteLink, InvitePerson } from '@/lib/types'

export const MAX_PERSONS = 10

// Used until the couple writes their own text. It goes to the guests as it
// is, so it is not translated.
export const DEFAULT_MESSAGE = '{anrede} wir heiraten und möchten euch dabeihaben. Eure Einladung: {link}'

export const codeUrl = (code: string) => `${window.location.origin}/join-us?code=${code}`

export function inviteMessage(template: string | undefined, link: InviteLink) {
  const values: Record<string, string> = {
    anrede: greeting(link.guests, link.salutation),
    namen: guestNames(link.guests),
    link: codeUrl(link.code),
    code: link.code,
  }
  return (template?.trim() || DEFAULT_MESSAGE).replace(/\{(anrede|namen|link|code)\}/g, (_, key: string) => values[key]).trim()
}

export interface ParsedLine {
  text: string
  persons: InvitePerson[]
  salutation: '' | 'liebe' | 'lieber'
  error: '' | 'name' | 'many' | 'note'
}

// "ron, harry, somekid(kid,1y)": one invitation, persons split by commas,
// notes about a person in brackets.
export function parseLine(text: string): ParsedLine {
  const line: ParsedLine = { text, persons: [], salutation: '', error: '' }
  let man = false
  for (const part of text.match(/[^,(]*(\([^)]*\))?[^,(]*/g) ?? []) {
    if (!part.trim()) continue
    const [, name, notes] = /^([^(]*)(?:\(([^)]*)\))?\s*$/.exec(part) ?? []
    if (name === undefined || !name.trim()) return { ...line, error: 'name' }
    const person: InvitePerson = { name: name.trim().replace(/\s+/g, ' '), isChild: false, age: 0 }
    for (const note of (notes ?? '').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean)) {
      const age = /^(\d{1,2})\s*(y|j|jahre?)?$/.exec(note)
      if (note === 'kid' || note === 'kind') person.isChild = true
      else if (age && Number(age[1]) <= 17) Object.assign(person, { isChild: true, age: Number(age[1]) })
      else if (note === 'm') man = true
      else if (note !== 'w' && note !== 'f') return { ...line, error: 'note' }
    }
    line.persons.push(person)
  }
  if (line.persons.length === 0) return { ...line, error: 'name' }
  if (line.persons.length > MAX_PERSONS) return { ...line, error: 'many' }
  if (line.persons.length === 1) line.salutation = man ? 'lieber' : 'liebe'
  return line
}

export const sameGuests = (names: string[]) => names.map((n) => n.trim().toLowerCase()).sort().join('|')
