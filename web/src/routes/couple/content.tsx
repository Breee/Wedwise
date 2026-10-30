import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { contentQuery } from '@/lib/queries'
import type { Content, FAQEntry, ScheduleEntry } from '@/lib/types'
import { PageHeader } from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const Route = createFileRoute('/couple/content')({
  loader: ({ context }) => context.queryClient.ensureQueryData(contentQuery),
  component: ContentPage,
})

function ContentPage() {
  const { data } = useSuspenseQuery(contentQuery)
  const [draft, setDraft] = useState<Content>(() => structuredClone(data))
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: () => api.put<Content>('/content', normalize(draft)),
    onSuccess: (saved) => {
      queryClient.setQueryData(contentQuery.queryKey, saved)
      queryClient.invalidateQueries({ queryKey: ['content', 'public'] })
      setDraft(structuredClone(saved))
      toast.success('Inhalte gespeichert.')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const set = <K extends keyof Content>(key: K, value: Content[K]) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <>
      <PageHeader
        title="Inhalte"
        description="Texte der öffentlichen Seite bearbeiten."
        action={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Speichert…' : 'Speichern'}
          </Button>
        }
      />
      <Tabs defaultValue="hero">
        <TabsList>
          <TabsTrigger value="hero">Begrüßung</TabsTrigger>
          <TabsTrigger value="location">Ort</TabsTrigger>
          <TabsTrigger value="schedule">Ablauf</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="hero" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Kopfbereich</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Kleine Überschrift" value={draft.hero.eyebrow} onChange={(v) => set('hero', { ...draft.hero, eyebrow: v })} />
              <Field label="Überschrift" value={draft.hero.headline} onChange={(v) => set('hero', { ...draft.hero, headline: v })} />
              <Field label="Untertitel" value={draft.hero.subtitle} onChange={(v) => set('hero', { ...draft.hero, subtitle: v })} />
              <Field label="Hinweis" value={draft.hero.note} onChange={(v) => set('hero', { ...draft.hero, note: v })} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Einleitung</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={6} value={draft.introduction?.text ?? ''} onChange={(e) => set('introduction', { text: e.target.value })} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location" className="mt-4">
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <Field label="Name" value={draft.location.name} onChange={(v) => set('location', { ...draft.location, name: v })} />
              <Field label="Adresse" value={draft.location.address} onChange={(v) => set('location', { ...draft.location, address: v })} />
              <Field label="Navigationslink" value={draft.location.navigationUrl} onChange={(v) => set('location', { ...draft.location, navigationUrl: v })} className="sm:col-span-2" />
              <Field label="Beschreibung" multiline value={draft.location.description} onChange={(v) => set('location', { ...draft.location, description: v })} className="sm:col-span-2" />
              <Field label="Anreise" multiline value={draft.location.transport} onChange={(v) => set('location', { ...draft.location, transport: v })} />
              <Field label="Parken" multiline value={draft.location.parking} onChange={(v) => set('location', { ...draft.location, parking: v })} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <ListEditor<ScheduleEntry>
            items={draft.schedule ?? []}
            onChange={(items) => set('schedule', items)}
            create={() => ({ id: 0, time: '', title: '', description: '', order: 0 })}
            addLabel="Programmpunkt hinzufügen"
            render={(item, update) => (
              <div className="grid flex-1 gap-3 sm:grid-cols-[8rem_1fr]">
                <Field label="Uhrzeit" value={item.time} onChange={(v) => update({ ...item, time: v })} />
                <Field label="Titel" value={item.title} onChange={(v) => update({ ...item, title: v })} />
                <Field label="Beschreibung" value={item.description} onChange={(v) => update({ ...item, description: v })} className="sm:col-span-2" />
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="faq" className="mt-4">
          <ListEditor<FAQEntry>
            items={draft.faq ?? []}
            onChange={(items) => set('faq', items)}
            create={() => ({ id: 0, question: '', answer: '', order: 0 })}
            addLabel="Frage hinzufügen"
            render={(item, update) => (
              <div className="grid flex-1 gap-3">
                <Field label="Frage" value={item.question} onChange={(v) => update({ ...item, question: v })} />
                <Field label="Antwort" multiline value={item.answer} onChange={(v) => update({ ...item, answer: v })} />
              </div>
            )}
          />
        </TabsContent>
      </Tabs>
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

function ListEditor<T extends { order: number }>({
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
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const move = (i: number, dir: -1 | 1) => {
    const next = [...sorted]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    onChange(next.map((x, k) => ({ ...x, order: k + 1 })))
  }
  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Einträge.</p>}
      {sorted.map((item, i) => (
        <Card key={i}>
          <CardContent className="flex gap-3 pt-6">
            {render(item, (updated) => onChange(sorted.map((x, k) => (k === i ? updated : x))))}
            <div className="flex flex-col gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} title="Nach oben">
                <ArrowUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === sorted.length - 1} title="Nach unten">
                <ArrowDown className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => onChange(sorted.filter((_, k) => k !== i))} title="Entfernen">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" onClick={() => onChange([...sorted, { ...create(), order: sorted.length + 1 }])}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </div>
  )
}
