import { useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { contentQuery, themesQuery } from '@/lib/queries'
import type { Content, FAQEntry, Hotel, ScheduleEntry, Stop } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { PlacePicker } from '@/components/admin/PlacePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const Route = createFileRoute('/couple/content')({
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(contentQuery), context.queryClient.ensureQueryData(themesQuery)]),
  component: ContentPage,
})

function ContentPage() {
  const { data } = useSuspenseQuery(contentQuery)
  const { data: themes } = useSuspenseQuery(themesQuery)
  const [draft, setDraft] = useState<Content>(() => structuredClone(data))
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: () => {
      const unplaced = [...(draft.travel?.stops ?? []), ...(draft.accommodation?.hotels ?? [])].find((p) => p.lat === 0 && p.lng === 0)
      if (unplaced) throw new Error(t('Bitte wählt für „{name}“ noch einen Ort auf der Karte.', { name: unplaced.name || t('Neuer Eintrag') }))
      return api.put<Content>('/content', normalize(draft))
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(contentQuery.queryKey, saved)
      queryClient.invalidateQueries({ queryKey: ['content', 'public'] })
      setDraft(structuredClone(saved))
      toast.success(t('Inhalte gespeichert.'))
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const dirty = JSON.stringify(draft) !== JSON.stringify(data)
  const set = <K extends keyof Content>(key: K, value: Content[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const travel = draft.travel ?? { lat: 0, lng: 0, stops: [] }
  const current = themes.find((t) => t.name === draft.theme) ?? themes[0]
  const stay = draft.accommodation ?? { checkIn: '', checkOut: '', hotels: [] }

  return (
    <>
      <PageHeader
        title={t('Inhalte')}
        description={t('Texte der öffentlichen Seite bearbeiten.')}
        action={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t('Speichert…') : t('Speichern')}
          </Button>
        }
      />
      <Tabs defaultValue="hero">
        <TabsList>
          <TabsTrigger value="hero">{t('Begrüßung')}</TabsTrigger>
          <TabsTrigger value="location">{t('Ort')}</TabsTrigger>
          <TabsTrigger value="travel">{t('Anreise')}</TabsTrigger>
          <TabsTrigger value="stay">{t('Unterkünfte')}</TabsTrigger>
          <TabsTrigger value="schedule">{t('Ablauf')}</TabsTrigger>
          <TabsTrigger value="faq">{t('FAQ')}</TabsTrigger>
          <TabsTrigger value="theme">{t('Design')}</TabsTrigger>
        </TabsList>

        <TabsContent value="theme" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('Design')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{t('Thema')}</Label>
                <Select value={draft.theme || themes[0]?.name} onValueChange={(v) => set('theme', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (
                      <SelectItem key={t.name} value={t.name}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ul className="flex flex-wrap items-end gap-2">
                {Object.entries(current?.colors ?? {}).map(([k, c]) => (
                  <li key={k} title={k} className="size-7 rounded-full border" style={{ background: c }} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hero" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('Kopfbereich')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('Leere Felder übernehmen die Werte aus der Konfiguration.')}</p>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Kleine Überschrift')} value={draft.hero.eyebrow} onChange={(v) => set('hero', { ...draft.hero, eyebrow: v })} />
              <Field label={t('Überschrift')} value={draft.hero.headline} onChange={(v) => set('hero', { ...draft.hero, headline: v })} />
              <Field label={t('Untertitel')} value={draft.hero.subtitle} onChange={(v) => set('hero', { ...draft.hero, subtitle: v })} />
              <Field label={t('Hinweis')} value={draft.hero.note} onChange={(v) => set('hero', { ...draft.hero, note: v })} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('Einleitung')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={6} value={draft.introduction?.text ?? ''} onChange={(e) => set('introduction', { text: e.target.value })} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('Datenschutzhinweis')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea rows={4} value={draft.privacy ?? ''} onChange={(e) => set('privacy', e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('Optional. Erscheint im Fußbereich der Seite.')}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location" className="mt-4">
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <Field label={t('Name')} value={draft.location.name} onChange={(v) => set('location', { ...draft.location, name: v })} />
              <Field label={t('Adresse')} value={draft.location.address} onChange={(v) => set('location', { ...draft.location, address: v })} />
              <Field label={t('Navigationslink')} value={draft.location.navigationUrl} onChange={(v) => set('location', { ...draft.location, navigationUrl: v })} className="sm:col-span-2" />
              <div className="space-y-2 sm:col-span-2">
                <Field label={t('Bild-URL')} value={draft.location.image ?? ''} onChange={(v) => set('location', { ...draft.location, image: v })} />
                <ImageUpload onUploaded={(url) => set('location', { ...draft.location, image: url })} />
              </div>
              <Field label={t('Beschreibung')} multiline value={draft.location.description} onChange={(v) => set('location', { ...draft.location, description: v })} className="sm:col-span-2" />
              <Field label={t('Anreise')} multiline value={draft.location.transport} onChange={(v) => set('location', { ...draft.location, transport: v })} />
              <Field label={t('Parken')} multiline value={draft.location.parking} onChange={(v) => set('location', { ...draft.location, parking: v })} />
              <Field label={t('Fahrrad')} multiline value={draft.location.bike} onChange={(v) => set('location', { ...draft.location, bike: v })} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="travel" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('Wo ist die Location?')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PlacePicker
                value={travel}
                query={[draft.location.name, draft.location.address].filter(Boolean).join(', ')}
                onChange={(p) => set('travel', { ...travel, lat: p.lat, lng: p.lng })}
              />
              <p className="text-sm text-muted-foreground">
                {t('Ohne gesetzten Ort wird keine Karte angezeigt. Wege und Zeiten werden automatisch berechnet.')}
              </p>
            </CardContent>
          </Card>
          <ListEditor<Stop>
            items={travel.stops}
            onChange={(items) => set('travel', { ...travel, stops: items })}
            create={() => ({ name: '', kind: 'tram', line: '', lat: 0, lng: 0 })}
            addLabel={t('Haltestelle / Parkplatz hinzufügen')}
            render={(item, update) => (
              <div className="grid flex-1 gap-3 sm:grid-cols-4">
                <Field label={t('Name')} value={item.name} onChange={(v) => update({ ...item, name: v })} className="sm:col-span-2" />
                <div className="space-y-2">
                  <Label>{t('Art')}</Label>
                  <Select value={item.kind} onValueChange={(v) => update({ ...item, kind: v as Stop['kind'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tram">{t('Tram')}</SelectItem>
                      <SelectItem value="train">{t('S-Bahn / Zug')}</SelectItem>
                      <SelectItem value="bus">{t('Bus')}</SelectItem>
                      <SelectItem value="parking">{t('Parkplatz')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label={t('Linie')} value={item.line} onChange={(v) => update({ ...item, line: v })} />
                <PlacePicker
                  className="sm:col-span-4"
                  value={item}
                  near={travel}
                  query={item.name}
                  onChange={(p, place) => update({ ...item, lat: p.lat, lng: p.lng, name: item.name || place?.name || '' })}
                />
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="stay" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('Reisezeitraum für Buchungslinks')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <DateField label={t('Anreise')} value={stay.checkIn} onChange={(v) => set('accommodation', { ...stay, checkIn: v })} />
              <DateField label={t('Abreise')} value={stay.checkOut} onChange={(v) => set('accommodation', { ...stay, checkOut: v })} />
            </CardContent>
          </Card>
          <ListEditor<Hotel>
            items={stay.hotels}
            onChange={(items) => set('accommodation', { ...stay, hotels: items })}
            create={() => ({ name: '', area: '', lat: 0, lng: 0, priceTier: 2, note: '', url: '', bookingUrl: '' })}
            addLabel={t('Unterkunft hinzufügen')}
            render={(item, update) => (
              <div className="grid flex-1 gap-3 sm:grid-cols-4">
                <Field label={t('Name')} value={item.name} onChange={(v) => update({ ...item, name: v })} className="sm:col-span-2" />
                <Field label={t('Stadtteil')} value={item.area} onChange={(v) => update({ ...item, area: v })} />
                <div className="space-y-2">
                  <Label>{t('Art')}</Label>
                  <Select value={item.kind ?? 'hotel'} onValueChange={(v) => update({ ...item, kind: v as Hotel['kind'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotel">{t('Hotel')}</SelectItem>
                      <SelectItem value="apartment">{t('Ferienwohnung')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('Preisklasse')}</Label>
                  <Select value={String(item.priceTier)} onValueChange={(v) => update({ ...item, priceTier: Number(v) as Hotel['priceTier'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t('€ günstig')}</SelectItem>
                      <SelectItem value="2">{t('€€ mittel')}</SelectItem>
                      <SelectItem value="3">{t('€€€ gehoben')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <PlacePicker
                  className="sm:col-span-4"
                  value={item}
                  near={travel}
                  query={item.name}
                  onChange={(p, place) => update({ ...item, lat: p.lat, lng: p.lng, name: item.name || place?.name || '' })}
                />
                <Field label={t('Website')} value={item.url} onChange={(v) => update({ ...item, url: v })} className="sm:col-span-2" />
                <Field label={t('Booking-Link (Hotelseite)')} value={item.bookingUrl ?? ''} onChange={(v) => update({ ...item, bookingUrl: v })} className="sm:col-span-2" />
                <Field label={t('Hinweis')} value={item.note} onChange={(v) => update({ ...item, note: v })} className="sm:col-span-2" />
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <ListEditor<ScheduleEntry>
            items={draft.schedule ?? []}
            onChange={(items) => set('schedule', items)}
            create={() => ({ id: 0, time: '', title: '', description: '', order: 0 })}
            addLabel={t('Programmpunkt hinzufügen')}
            render={(item, update) => (
              <div className="grid flex-1 gap-3 sm:grid-cols-[8rem_1fr]">
                <Field label={t('Uhrzeit')} value={item.time} onChange={(v) => update({ ...item, time: v })} />
                <Field label={t('Titel')} value={item.title} onChange={(v) => update({ ...item, title: v })} />
                <Field label={t('Beschreibung')} value={item.description} onChange={(v) => update({ ...item, description: v })} className="sm:col-span-2" />
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="faq" className="mt-4">
          <ListEditor<FAQEntry>
            items={draft.faq ?? []}
            onChange={(items) => set('faq', items)}
            create={() => ({ id: 0, question: '', answer: '', order: 0 })}
            addLabel={t('Frage hinzufügen')}
            render={(item, update) => (
              <div className="grid flex-1 gap-3">
                <Field label={t('Frage')} value={item.question} onChange={(v) => update({ ...item, question: v })} />
                <Field label={t('Antwort')} multiline value={item.answer} onChange={(v) => update({ ...item, answer: v })} />
              </div>
            )}
          />
        </TabsContent>
      </Tabs>
      {dirty && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <p className="text-sm text-muted-foreground">{t('Ungespeicherte Änderungen')}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(structuredClone(data))} disabled={save.isPending}>
              {t('Verwerfen')}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? t('Speichert…') : t('Speichern')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function normalize(c: Content): Content {
  return {
    ...c,
    schedule: (c.schedule ?? []).map((s, i) => ({ ...s, order: i + 1 })),
    faq: (c.faq ?? []).map((f, i) => ({ ...f, order: i + 1 })),
  }
}

function Field({
  label,
  value,
  onChange,
  multiline,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  className?: string
}) {
  return (
    <div className={className ? `space-y-2 ${className}` : 'space-y-2'}>
      <Label>{label}</Label>
      {multiline ? (
        <Textarea rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

const orderOf = (x: object) => (x as { order?: number }).order

function ListEditor<T extends object>({
  items,
  onChange,
  create,
  render,
  addLabel,
}: {
  items: T[]
  onChange: (items: T[]) => void
  create: () => T
  render: (item: T, update: (item: T) => void) => React.ReactNode
  addLabel: string
}) {
  const sorted = [...items].sort((a, b) => (orderOf(a) ?? 0) - (orderOf(b) ?? 0))
  const move = (i: number, dir: -1 | 1) => {
    const next = [...sorted]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next.map((x, k) => (orderOf(x) === undefined ? x : { ...x, order: k + 1 })))
  }
  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="text-sm text-muted-foreground">{t('Noch keine Einträge.')}</p>}
      {sorted.map((item, i) => (
        <Card key={i}>
          <CardContent className="flex gap-3 pt-6">
            {render(item, (updated) => onChange(sorted.map((x, k) => (k === i ? updated : x))))}
            <div className="flex flex-col gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} title={t('Nach oben')}>
                <ArrowUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === sorted.length - 1} title={t('Nach unten')}>
                <ArrowDown className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => onChange(sorted.filter((_, k) => k !== i))} title={t('Entfernen')}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button
        variant="outline"
        onClick={() => {
          const item = create()
          onChange([...sorted, orderOf(item) === undefined ? item : { ...item, order: sorted.length + 1 }])
        }}
      >
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  )
}

function ImageUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    setBusy(true)
    try {
      const res = await fetch('/api/uploads', { method: 'POST', credentials: 'include', body: file })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error?.message ?? t('Das Bild konnte nicht hochgeladen werden.'))
      onUploaded(body.url)
      toast.success(t('Bild hochgeladen. Speichern nicht vergessen.'))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button asChild variant="outline" size="sm" disabled={busy}>
      <label className="cursor-pointer">
        <Upload className="size-4" />
        {busy ? t('Lädt hoch…') : t('Bild hochladen')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload(file)
          }}
        />
      </label>
    </Button>
  )
}
