import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { t } from '@/lib/i18n'
import { meQuery, publicContentQuery } from '@/lib/queries'
import { forgetToken, rememberedToken } from '@/lib/remember'

export function AppFooter() {
  const { data: me } = useQuery(meQuery)
  const { data: site } = useQuery(publicContentQuery)
  const [remembered, setRemembered] = useState(() => rememberedToken() !== null)
  const privacy = site?.content.privacy
  return (
    <footer className="border-t border-border/60 px-6 py-8 text-center text-sm text-muted-foreground">
      <p>{t('Mit Liebe gemacht')}</p>
      {privacy && (
        <details className="mx-auto mt-3 max-w-xl text-xs">
          <summary className="cursor-pointer underline-offset-4 hover:underline">{t('Datenschutz')}</summary>
          <p className="mt-2 whitespace-pre-line">{privacy}</p>
        </details>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground/60">
        {remembered && (
          <button
            type="button"
            className="cursor-pointer underline-offset-4 hover:underline"
            onClick={() => {
              forgetToken()
              setRemembered(false)
              toast.success(t('Dieses Gerät merkt sich eure Antwort nicht mehr.'))
            }}
          >
            {t('Dieses Gerät vergessen')}
          </button>
        )}
        {!me?.authenticated && (
          <Link to="/login" className="underline-offset-4 hover:underline">
            {t('Login')}
          </Link>
        )}
      </div>
    </footer>
  )
}
