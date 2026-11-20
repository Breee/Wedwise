import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { t } from '@/lib/i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, LogOut, UserRound } from 'lucide-react'
import { LanguageToggle } from './LanguageToggle'
import { api } from '@/lib/api'
import { meQuery, publicContentQuery } from '@/lib/queries'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const coupleLinks = [
  { to: '/couple/dashboard', label: 'Übersicht' },
  { to: '/couple/invites', label: 'Einladungslinks' },
  { to: '/couple/content', label: 'Inhalte' },
  { to: '/couple/broadcast', label: 'Nachricht' },
] as const

const witnessLinks = [{ to: '/witness/dashboard', label: 'Beiträge' }] as const
const adminLinks = [
  { to: '/admin/users', label: 'Benutzer' },
  { to: '/admin/audit', label: 'Protokoll' },
] as const

const accountLinks = [
  { to: '/rsvp', label: 'Meine Antwort' },
  { to: '/account', label: 'Konto' },
] as const

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')) || '?'
}

export function linksFor(role: string | undefined) {
  if (role === 'admin') return [...coupleLinks, ...witnessLinks, ...adminLinks, ...accountLinks]
  if (role === 'guest') return [accountLinks[0]]
  if (role === 'witness') return [...witnessLinks, ...accountLinks]
  return role ? [...coupleLinks, ...accountLinks] : []
}

export function AppNav() {
  const { data: me } = useQuery(meQuery)
  const { data: content } = useQuery(publicContentQuery)
  const names = content?.event.couple.map((c) => c.name).filter(Boolean) ?? []
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isPublic = pathname === '/' || pathname.startsWith('/rsvp')

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate({ to: '/' })
    },
  })

  const authed = me?.authenticated === true
  const links = linksFor(me?.role)

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border/60 backdrop-blur-md',
        isPublic ? 'bg-background/70' : 'bg-card/80',
      )}
    >
      <div
        className={cn(
          'relative mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6',
          !authed && isPublic ? 'justify-center' : 'justify-between',
        )}
      >
        <Link to="/" className="flex shrink-0 items-center gap-2 font-display text-xl tracking-wide whitespace-nowrap sm:text-2xl">
          {names.length === 2 ? (
            <>
              {names[0]}
              <Heart aria-label={t('und')} className="size-4 fill-primary/20 text-primary" />
              {names[1]}
            </>
          ) : (
            <>
              {content?.event.title ?? t('Unsere Hochzeit')}
            </>
          )}
        </Link>
        <nav className={cn('flex min-w-0 items-center gap-1 text-sm', !authed && isPublic && 'absolute right-4 sm:right-6')}>
          {authed && (
            <>
              <div className="hidden items-center gap-1 lg:flex">
                {links
                  .filter((l) => l.to !== '/rsvp' && l.to !== '/account')
                  .map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
                    >
                      {t(l.label)}
                    </Link>
                  ))}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('Menü')}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold tracking-wide text-primary-foreground uppercase"
                  >
                    {initials(me?.displayName || me?.username || '')}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{me?.displayName || me?.username}</p>
                  <DropdownMenuItem asChild>
                    <Link to="/me" className="data-[status=active]:bg-accent">
                      {t('Mein Bereich')}
                    </Link>
                  </DropdownMenuItem>
                  {links.map((l) => (
                    <DropdownMenuItem key={l.to} asChild>
                      <Link to={l.to} className="data-[status=active]:bg-accent">
                        {t(l.label)}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
                    <LogOut className="size-4" /> {t('Abmelden')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {!authed && isPublic && (
            <Link
              to="/login"
              aria-label={t('Anmelden')}
              title={t('Anmelden')}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <UserRound className="size-[18px]" />
            </Link>
          )}
          {!authed && !isPublic && pathname !== '/login' && (
            <Link to="/login" className="px-3 py-2 text-muted-foreground hover:text-foreground">
              {t('Anmelden')}
            </Link>
          )}
          <LanguageToggle className="ml-1" />
        </nav>
      </div>
    </header>
  )
}
