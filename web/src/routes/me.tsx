import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, LogOut } from 'lucide-react'
import { t } from '@/lib/i18n'
import { api } from '@/lib/api'
import { meQuery, myResponseQuery } from '@/lib/queries'
import { linksFor } from '@/components/layout/AppNav'
import { SavePasskey } from '@/components/rsvp/RsvpForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/me')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me.authenticated) throw redirect({ to: '/login' })
  },
  component: MePage,
})

function MePage() {
  const me = useQuery(meQuery).data
  const own = useQuery(myResponseQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate({ to: '/' })
    },
  })
  const links = linksFor(me?.role).filter((l) => l.to !== '/rsvp')
  const response = own.data
  const guests = response?.attendees.length ?? 0

  return (
    <section className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">{t('Mein Bereich')}</p>
      <h1 className="mt-2 font-display text-4xl text-primary">
        {t('Hallo {name}', { name: me?.displayName || me?.username || '' })}
      </h1>

      <Card className="mt-8">
        <CardContent className="space-y-3">
          <h2 className="font-display text-2xl">{t('Meine Antwort')}</h2>
          {own.isPending ? (
            <p className="text-sm text-muted-foreground">{t('Lädt …')}</p>
          ) : response ? (
            <>
              <p className="text-muted-foreground">
                {response.status === 'yes'
                  ? guests === 1
                    ? t('Ihr habt zugesagt – 1 Person.')
                    : t('Ihr habt zugesagt – {n} Personen.', { n: guests })
                  : t('Ihr habt abgesagt.')}
              </p>
              <Button asChild className="w-full sm:w-auto">
                <Link to="/rsvp">{t('Antwort ansehen oder ändern')}</Link>
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">
              {t('Ihr habt noch nicht geantwortet. Öffnet dazu den Link aus eurer Einladung.')}
            </p>
          )}
        </CardContent>
      </Card>

      {links.length > 0 && (
        <Card className="mt-4">
          <CardContent>
            <h2 className="mb-2 font-display text-2xl">{t('Verwalten')}</h2>
            <ul className="divide-y">
              {links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="flex items-center justify-between py-3 hover:text-primary">
                    {t(l.label)}
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ul className="mt-4 divide-y">
        <SavePasskey />
      </ul>

      <Button variant="ghost" className="mt-6" disabled={logout.isPending} onClick={() => logout.mutate()}>
        <LogOut className="size-4" /> {t('Abmelden')}
      </Button>
    </section>
  )
}
