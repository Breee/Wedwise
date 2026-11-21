import { chooseLanguage, language, type Language } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const FLAGS: Record<Language, { label: string; flag: React.ReactNode }> = {
  de: {
    label: 'Deutsch',
    flag: (
      <svg viewBox="3 0 14 14" aria-hidden className="size-full">
        <rect width="20" height="14" fill="#1a1a1a" />
        <rect y="4.67" width="20" height="9.33" fill="#d00" />
        <rect y="9.33" width="20" height="4.67" fill="#fc0" />
      </svg>
    ),
  },
  en: {
    label: 'English',
    flag: (
      <svg viewBox="3 0 14 14" aria-hidden className="size-full">
        <rect width="20" height="14" fill="#012169" />
        <path d="M0 0l20 14M20 0L0 14" stroke="#fff" strokeWidth="2.8" />
        <path d="M0 0l20 14M20 0L0 14" stroke="#c8102e" strokeWidth="1.2" />
        <path d="M10 0v14M0 7h20" stroke="#fff" strokeWidth="4.6" />
        <path d="M10 0v14M0 7h20" stroke="#c8102e" strokeWidth="2.6" />
      </svg>
    ),
  },
}

export function LanguageToggle({ className }: { className?: string }) {
  const other: Language = language() === 'de' ? 'en' : 'de'
  const label = other === 'en' ? 'Switch to English' : 'Auf Deutsch wechseln'
  return (
    <button
      type="button"
      onClick={() => chooseLanguage(other)}
      aria-label={label}
      title={label}
      className={cn(
        'relative flex size-6 shrink-0 items-center justify-center rounded-full opacity-80 ring-1 ring-border transition after:absolute after:-inset-1.5 hover:opacity-100',
        className,
      )}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full">{FLAGS[other].flag}</span>
    </button>
  )
}
