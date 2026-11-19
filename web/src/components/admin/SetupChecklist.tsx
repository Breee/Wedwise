import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { contentQuery, inviteLinksQuery, publicContentQuery } from '@/lib/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Tab = 'hero' | 'location' | 'travel' | 'stay' | 'schedule' | 'faq' | 'theme'
type Step = { label: string; hint: string; done: boolean; tab?: Tab }

export function SetupChecklist() {
  const content = useQuery(contentQuery).data
  const links = useQuery(inviteLinksQuery).data
  const event = useQuery(publicContentQuery).data?.event
  if (!content || !links) return null

  const travel = content.travel
  const steps: Step[] = [
    {
      label: t('Namen und Datum'),
      hint: t('Wer heiratet wann?'),
      done: ((content.names?.length ?? 0) > 0 || (event?.couple.length ?? 0) > 0) && !!(content.date || event?.date),
      tab: 'hero',
    },
    {
      label: t('Begrüßung'),
      hint: t('Ein paar Sätze für eure Gäste.'),
      done: !!content.introduction?.text,
      tab: 'hero',
    },
    {
      label: t('Location'),
      hint: t('Name, Adresse und der Ort auf der Karte.'),
      done: !!content.location?.name && !!travel && (travel.lat !== 0 || travel.lng !== 0),
      tab: content.location?.name ? 'travel' : 'location',
    },
    {
      label: t('Anreise'),
      hint: t('Haltestellen und Parkplätze – wir schlagen welche vor.'),
      done: (travel?.stops.length ?? 0) > 0,
      tab: 'travel',
    },
    {
      label: t('Ablauf'),
      hint: t('Was passiert wann?'),
      done: content.schedule.length > 0,
      tab: 'schedule',
    },
    {
      label: t('Unterkünfte'),
      hint: t('Empfehlungen für Gäste von weiter weg.'),
      done: (content.accommodation?.hotels.length ?? 0) > 0,
      tab: 'stay',
    },
    {
      label: t('Fragen & Antworten'),
      hint: t('Dresscode, Geschenke, Kinder …'),
      done: content.faq.length > 0,
      tab: 'faq',
    },
    {
      label: t('Einladungslink'),
      hint: t('Den Link schickt ihr euren Gästen.'),
      done: links.length > 0,
    },
  ]
  const open = steps.filter((s) => !s.done).length
  if (open === 0) return null

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t('Eure Seite einrichten')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('{done} von {count} erledigt. Die Reihenfolge ist egal – tippt auf einen Punkt, um ihn auszufüllen.', {
            done: steps.length - open,
            count: steps.length,
          })}
        </p>
        <progress className="wed-progress" value={steps.length - open} max={steps.length} aria-hidden />
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {steps.map((step) => (
            <li key={step.label}>
              <Link
                to={step.tab ? '/couple/content' : '/couple/invites'}
                search={step.tab ? { tab: step.tab } : undefined}
                className="flex items-center gap-3 py-3 hover:text-primary"
              >
                {step.done ? (
                  <Check className="size-5 shrink-0 text-primary" aria-label={t('Erledigt')} />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" aria-label={t('Offen')} />
                )}
                <span className="min-w-0 flex-1">
                  <span className={step.done ? 'text-muted-foreground line-through' : 'font-medium'}>{step.label}</span>
                  {!step.done && <span className="block text-sm text-muted-foreground">{step.hint}</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
