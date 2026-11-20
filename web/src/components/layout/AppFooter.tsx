import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Heart } from 'lucide-react'
import { t } from '@/lib/i18n'
import { LanguageToggle } from './LanguageToggle'
import { meQuery, publicContentQuery } from '@/lib/queries'
import { forgetToken, rememberedToken } from '@/lib/remember'
import { api } from '@/lib/api'

export function AppFooter({ language = false }: { language?: boolean }) {
  const { data: me } = useQuery(meQuery)
  const { data: site } = useQuery(publicContentQuery)
  const [remembered, setRemembered] = useState(() => rememberedToken() !== null)
  const privacy = site?.content.privacy
  const [open, setOpen] = useState(false)
  const { data: build } = useQuery({
    queryKey: ['version'],
    queryFn: () => api.get<{ version: string }>('/version'),
    staleTime: Infinity,
  })
  const names = site?.event.couple.map((c) => c.name).filter(Boolean).join(' & ')
  const link = 'cursor-pointer underline-offset-4 hover:text-foreground hover:underline'
  return (
    <footer className="mt-8 border-t border-border/60 px-6 pt-10 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-muted-foreground">
      <div className="mx-auto flex max-w-xs items-center gap-4 text-gold">
        <span className="h-px flex-1 bg-current opacity-40" />
        <Heart className="size-4" aria-hidden />
        <span className="h-px flex-1 bg-current opacity-40" />
      </div>
      {names && <p className="mt-4 font-display text-2xl text-primary">{names}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
        {privacy && (
          <button type="button" className={link} aria-expanded={open} onClick={() => setOpen(!open)}>
            {t('Datenschutz')}
          </button>
        )}
        {remembered && (
          <button
            type="button"
            className={link}
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
          <Link to="/login" className={link}>
            {t('Login')}
          </Link>
        )}
        {language && <LanguageToggle />}
      </div>
      {privacy && open && <p className="mx-auto mt-4 max-w-xl text-left text-xs whitespace-pre-line">{privacy}</p>}
      <a
        href="https://github.com/Breee/Wedwise"
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-block text-[11px] text-muted-foreground/50 underline-offset-4 hover:underline"
      >
        Wedwise{build?.version ? ` ${build.version}` : ''}
      </a>
    </footer>
  )
}
