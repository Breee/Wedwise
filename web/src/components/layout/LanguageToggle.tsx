import { chooseLanguage, language } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function LanguageToggle({ className }: { className?: string }) {
  const next = language() === 'de' ? 'en' : 'de'
  return (
    <button
      type="button"
      onClick={() => chooseLanguage(next)}
      aria-label={next === 'en' ? 'Switch to English' : 'Auf Deutsch wechseln'}
      className={cn('rounded-md px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-primary', className)}
    >
      {next}
    </button>
  )
}
