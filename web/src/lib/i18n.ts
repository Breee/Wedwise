import { en } from '@/locales/en'

export type Language = 'de' | 'en'

let current: Language = 'de'

export function setLanguage(lang: string | undefined) {
  current = lang === 'en' ? 'en' : 'de'
  document.documentElement.lang = current
}

export function language(): Language {
  return current
}

export function locale(): string {
  return current === 'en' ? 'en-GB' : 'de-DE'
}

// German is the source language: t() returns the text as written, or its
// English counterpart from locales/en.ts. {name} placeholders come from vars.
export function t(text: string, vars?: Record<string, string | number>): string {
  const out = current === 'en' ? (en[text] ?? text) : text
  if (!vars) return out
  return out.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
}
