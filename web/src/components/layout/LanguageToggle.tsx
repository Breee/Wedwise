import { chooseLanguage, language, type Language } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const FLAGS: Record<Language, { label: string; flag: React.ReactNode }> = {
  de: {
    label: 'Deutsch',
    flag: (
      <svg viewBox="0 0 20 14" aria-hidden className="h-3.5 w-5 rounded-[3px]">
        <rect width="20" height="14" fill="#1a1a1a" />
        <rect y="4.67" width="20" height="9.33" fill="#d00" />
        <rect y="9.33" width="20" height="4.67" fill="#fc0" />
      </svg>
    ),
  },
  en: {
    label: 'English',
    flag: (
      <svg viewBox="0 0 20 14" aria-hidden className="h-3.5 w-5 rounded-[3px]">
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
  const current = language()
  return (
    <div role="group" aria-label="Sprache / Language" className={cn('flex items-center gap-0.5 rounded-full border border-border/70 bg-card/70 p-0.5', className)}>
      {(Object.keys(FLAGS) as Language[]).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => lang !== current && chooseLanguage(lang)}
          aria-label={FLAGS[lang].label}
          aria-pressed={lang === current}
          title={FLAGS[lang].label}
          className={cn(
            'rounded-full p-1.5 transition',
            lang === current ? 'bg-accent shadow-sm' : 'opacity-45 grayscale hover:opacity-100 hover:grayscale-0',
          )}
        >
          {FLAGS[lang].flag}
        </button>
      ))}
    </div>
  )
}
