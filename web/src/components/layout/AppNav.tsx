import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, LogOut } from 'lucide-react'
import { api } from '@/lib/api'
import { meQuery } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const coupleLinks = [
  { to: '/couple/dashboard', label: 'Übersicht' },
  { to: '/couple/invites', label: 'Einladungslinks' },
  { to: '/couple/content', label: 'Inhalte' },
] as const

const witnessLinks = [{ to: '/witness/dashboard', label: 'Beiträge' }] as const

function linksFor(role: string | undefined) {
  if (role === 'admin') return [...coupleLinks, ...witnessLinks]
  if (role === 'witness') return witnessLinks
  return role ? coupleLinks : []
}

export function AppNav() {
  const { data: me } = useQuery(meQuery)
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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-display text-xl tracking-wide whitespace-nowrap sm:text-2xl">
          <Heart className="size-5 fill-primary/20 text-primary" />
          Unsere Hochzeit
        </Link>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          {authed &&
            links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
              >
                {l.label}
              </Link>
            ))}
          {authed ? (
            <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut className="size-4" />
              Abmelden
            </Button>
          ) : (
            !isPublic && pathname !== '/login' && (
              <Link to="/login" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Anmelden
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  )
}
