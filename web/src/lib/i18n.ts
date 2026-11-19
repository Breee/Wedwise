import { en } from '@/locales/en'

export type Language = 'de' | 'en'

let current: Language = 'de'

const CHOICE = 'wedwise:language'

// The visitor's own choice wins over the site's configured language.
export function setLanguage(lang: string | undefined) {
  const chosen = localStorage.getItem(CHOICE) ?? lang
  current = chosen === 'en' ? 'en' : 'de'
  document.documentElement.lang = current
}

export function language(): Language {
  return current
}

// Texts are read while modules load, so a switch reloads the page.
export function chooseLanguage(lang: Language) {
  localStorage.setItem(CHOICE, lang)
  window.location.reload()
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
