import { setLanguage, t } from '@/lib/i18n'
import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext, useMatchRoute } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { Toaster } from '@/components/ui/sonner'
import { AppNav } from '@/components/layout/AppNav'
import { AppFooter } from '@/components/layout/AppFooter'
import { ThemeApplier } from '@/components/layout/ThemeApplier'
import { meQuery, publicContentQuery } from '@/lib/queries'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context }) => {
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData(publicContentQuery),
      context.queryClient.ensureQueryData(meQuery),
    ])
    setLanguage(data.event.language)
    return data
  },
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  const match = useMatchRoute()
  const invite = match({ to: '/rsvp/$link' }) || match({ to: '/join-us' })
  return (
    <MotionConfig reducedMotion="user">
      <ThemeApplier />
      <div className="flex min-h-svh flex-col">
        {!invite && <AppNav />}
        <main className="min-h-svh flex-1">
          <Outlet />
        </main>
        <AppFooter language={Boolean(invite)} />
        <Toaster position="top-center" richColors />
      </div>
    </MotionConfig>
  )
}

function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-32 text-center">
      <p className="font-display text-6xl text-primary">404</p>
      <h1 className="mt-4 text-3xl">{t('Diese Seite gibt es nicht.')}</h1>
      <p className="mt-2 text-muted-foreground">{t('Vielleicht hilft der Weg zurück zur Startseite.')}</p>
    </section>
  )
}
