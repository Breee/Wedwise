import { useState } from 'react'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { forgetToken } from '@/lib/remember'
import { Copy, Download } from 'lucide-react'
import { t } from '@/lib/i18n'
import { copyText } from '@/lib/clipboard'
import { djText, download, genreRanking, guestCsv, songWishes, venueText } from '@/lib/handover'
import { DIET_LABEL } from '@/lib/format'
import {
  contributionsQuery,
  meQuery,
  myResponseQuery,
  publicContentQuery,
  responsesQuery,
  summaryQuery,
} from '@/lib/queries'
import type { Contribution } from '@/lib/types'
import { cn } from '@/lib/utils'
import { SetupChecklist } from '@/components/admin/SetupChecklist'
import { Stat } from '@/components/admin/Stat'
import { ResponsesTable } from '@/components/admin/ResponsesTable'
import { genreIcon } from '@/components/rsvp/music'
import { SavePasskey } from '@/components/rsvp/RsvpForm'
import { Board } from '@/components/witness/Board'
import { Schedule } from '@/components/witness/Schedule'
import { ContributionDetail } from '@/components/witness/ContributionDetail'
import { isOpen, toMinutes } from '@/components/witness/contributions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'

const TABS = ['mine', 'responses', 'food', 'music', 'contributions'] as const
type Tab = (typeof TABS)[number]
const LABEL: Record<Tab, string> = {
  mine: 'Meine Antwort',
  responses: 'Rückmeldungen',
  food: 'Essen',
  music: 'Musik',
  contributions: 'Beiträge',
}
const LAYOUT = 'wedwise:dashboard-layout'

export const Route = createFileRoute('/me')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) ? { tab: search.tab as Tab } : {},
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me.authenticated) throw redirect({ to: '/login' })
  },
  component: Dashboard,
})

function Dashboard() {
  const me = useQuery(meQuery).data
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [all, setAll] = useState(() => localStorage.getItem(LAYOUT) === 'all')
  const may = (permission: string) => me?.permissions.includes(permission) ?? false
  const answers = may('rsvp.read')
  const tabs = TABS.filter((tab) =>
    tab === 'mine' ? true : tab === 'contributions' ? may('contribution.read') : answers,
  )
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : tabs[0]
  const shown = (name: Tab) => tabs.includes(name) && (all || tab === name)
  const layout = (next: boolean) => {
    localStorage.setItem(LAYOUT, next ? 'all' : 'tabs')
    setAll(next)
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">{t('Dashboard')}</p>
      <h1 className="mt-2 font-display text-4xl text-primary">
        {t('Hallo {name}', { name: me?.displayName || me?.username || '' })}
      </h1>
      {may('content.write') && (
        <div className="mt-6">
          <SetupChecklist />
        </div>
      )}

      {tabs.length > 1 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {!all &&
            tabs.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={tab === name}
                onClick={() => navigate({ search: { tab: name }, replace: true })}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-colors',
                  tab === name ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                )}
              >
                {t(LABEL[name])}
              </button>
            ))}
          <button
            type="button"
            onClick={() => layout(!all)}
            className="relative after:absolute after:-inset-x-2 after:-inset-y-3 ml-auto text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {all ? t('Als Reiter anzeigen') : t('Alles auf einer Seite')}
          </button>
        </div>
      )}

      {shown('mine') && <Mine title={all || tabs.length === 1} />}
      {shown('responses') && <Responses title={all} />}
      {shown('food') && <Food title={all} />}
      {shown('music') && <Music title={all} />}
      {shown('contributions') && <Contributions title={all} />}
    </section>
  )
}

function Part({ title, children }: { title?: string | false; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      {title && <h2 className="mb-4 font-display text-3xl">{title}</h2>}
      {children}
    </section>
  )
}

const Empty = () => <p className="text-sm text-muted-foreground">{t('Keine Angaben.')}</p>

function Mine({ title }: { title: boolean }) {
  const own = useQuery(myResponseQuery)
  const response = own.data
  const guests = response?.attendees.length ?? 0
  return (
    <Part title={title && t(LABEL.mine)}>
      <Card className="max-w-xl">
        <CardContent className="space-y-3">
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
      <ul className="mt-4 max-w-xl divide-y">
        <SavePasskey />
      </ul>
      <DeleteAccount />
    </Part>
  )
}

function useHandover() {
  const responses = useQuery(responsesQuery).data ?? []
  const title = useQuery(publicContentQuery).data?.event.title ?? ''
  return { responses, title, copy: (text: string) => copyText(text, t('Kopiert.')) }
}

function Responses({ title }: { title: boolean }) {
  const s = useQuery(summaryQuery).data
  const { responses } = useHandover()
  return (
    <Part title={title && t(LABEL.responses)}>
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label={t('Rückmeldungen')} value={s.responses} />
          <Stat label={t('Zusagen')} value={s.statusCounts?.yes ?? 0} hint={t('{n} Absagen', { n: s.statusCounts?.no ?? 0 })} />
          <Stat label={t('Gäste')} value={s.attendeesAttending} hint={t('Personen mit Zusage')} />
          <Stat label={t('Kinder')} value={s.children} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => download('gaeste.csv', guestCsv(responses), 'text/csv;charset=utf-8')}>
          <Download /> {t('Gästeliste als Tabelle (CSV)')}
        </Button>
      </div>
      <div className="mt-6">
        <ResponsesTable responses={responses} />
      </div>
    </Part>
  )
}

function Food({ title }: { title: boolean }) {
  const s = useQuery(summaryQuery).data
  const { responses, title: event, copy } = useHandover()
  const diets = Object.entries(s?.dietCounts ?? {}).filter(([, n]) => n > 0)
  return (
    <Part title={title && t(LABEL.food)}>
      <Button variant="outline" onClick={() => copy(venueText(event, responses))}>
        <Copy /> {t('Für die Location kopieren')}
      </Button>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Ernährung')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {diets.length === 0 && <Empty />}
            {diets.map(([k, n]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span>{DIET_LABEL[k] ?? k}</span>
                <Badge variant="secondary">{n}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Allergien & Unverträglichkeiten')}</CardTitle>
          </CardHeader>
          <CardContent>
            {s?.allergies?.length ? (
              <ul className="space-y-1 text-sm">
                {s.allergies.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.name}:</span> {a.allergies}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </CardContent>
        </Card>
      </div>
    </Part>
  )
}

function Music({ title }: { title: boolean }) {
  const { responses, title: event, copy } = useHandover()
  const genres = genreRanking(responses)
  const genreMax = genres[0]?.[1] ?? 1
  const songs = songWishes(responses)
  return (
    <Part title={title && t(LABEL.music)}>
      <Button variant="outline" onClick={() => copy(djText(event, responses))}>
        <Copy /> {t('Für den DJ kopieren')}
      </Button>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Musikgeschmack')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {genres.length === 0 && <Empty />}
            {genres.map(([g, n]) => (
              <div key={g} className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate">{genreIcon(g)} {g}</span>
                <progress className="wed-progress" value={n} max={genreMax} aria-hidden />
                <span className="text-right text-muted-foreground">{n}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Must-play-Songs')}</CardTitle>
          </CardHeader>
          <CardContent>
            {songs.length ? (
              <ul className="space-y-1 text-sm">
                {songs.map((x, i) => (
                  <li key={i}>
                    ♪ {x.song} <span className="text-muted-foreground">– {x.who}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </CardContent>
        </Card>
      </div>
    </Part>
  )
}

function Contributions({ title }: { title: boolean }) {
  const contributions = useQuery(contributionsQuery).data ?? []
  const summary = useQuery(summaryQuery).data
  const [selected, setSelected] = useState<Contribution | null>(null)
  const open = contributions.filter(isOpen).length
  const confirmed = contributions.filter((c) => c.status === 'confirmed')
  const scheduled = contributions.filter((c) => c.status !== 'rejected' && toMinutes(c.slotTime) !== null).length
  const minutes = confirmed.reduce((sum, c) => sum + c.durationMinutes, 0)
  return (
    <Part title={title && t(LABEL.contributions)}>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t('Beiträge')} value={contributions.length} />
        <Stat label={t('Offen')} value={open} hint={t('neu oder mit Rückfrage')} />
        <Stat label={t('Bestätigt')} value={confirmed.length} hint={t('{n} Min. Programm', { n: minutes })} />
        <Stat label={t('Eingeplant')} value={scheduled} hint={t('von {n} Gästen mit Zusage', { n: summary?.attendeesAttending ?? 0 })} />
      </div>
      <div className="mt-8">
        {contributions.length === 0 ? (
          <p className="text-muted-foreground">{t('Noch keine Beiträge.')}</p>
        ) : (
          <Board items={contributions} onOpen={setSelected} />
        )}
      </div>
      <div className="mt-8">
        <Schedule items={contributions} onOpen={setSelected} />
      </div>
      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {selected && <ContributionDetail id={selected.id} onClose={() => setSelected(null)} />}
        </DialogContent>
      </Dialog>
    </Part>
  )
}

function DeleteAccount() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remove = useMutation({
    mutationFn: () => api.delete('/account/'),
    onSuccess: async () => {
      forgetToken()
      queryClient.clear()
      await navigate({ to: '/' })
      toast.success(t('Euer Konto wurde gelöscht.'))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <button
      type="button"
      disabled={remove.isPending}
      onClick={() => {
        if (window.confirm(t('Konto und eure Antwort endgültig löschen?'))) remove.mutate()
      }}
      className="relative after:absolute after:-inset-x-2 after:-inset-y-3 mt-6 text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
    >
      {t('Konto löschen')}
    </button>
  )
}
