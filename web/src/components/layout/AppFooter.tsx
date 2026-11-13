import { Link } from '@tanstack/react-router'
import { t } from '@/lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { meQuery } from '@/lib/queries'

export function AppFooter() {
  const { data: me } = useQuery(meQuery)
  return (
    <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
      <p>{t('Mit Liebe gemacht')}</p>
      {!me?.authenticated && (
        <Link to="/login" className="mt-2 inline-block text-xs text-muted-foreground/60 underline-offset-4 hover:underline">
          {t('Login')}
        </Link>
      )}
    </footer>
  )
}
