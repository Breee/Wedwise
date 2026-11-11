import type { QueryClient } from '@tanstack/react-query'
import { Outlet, createRootRouteWithContext, useMatchRoute } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
import { Toaster } from '@/components/ui/sonner'
import { AppNav } from '@/components/layout/AppNav'
import { AppFooter } from '@/components/layout/AppFooter'
import { ThemeApplier } from '@/components/layout/ThemeApplier'
import { publicContentQuery } from '@/lib/queries'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicContentQuery),
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  const invite = useMatchRoute()({ to: '/rsvp/$link' })
  return (
    <MotionConfig reducedMotion="user">
      <ThemeApplier />
      <div className="flex min-h-svh flex-col">
        {!invite && <AppNav />}
        <main className="flex-1">
          <Outlet />
        </main>
        <AppFooter />
        <Toaster position="top-center" richColors />
      </div>
    </MotionConfig>
  )
}

function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-32 text-center">
      <p className="font-display text-6xl text-primary">404</p>
      <h1 className="mt-4 text-3xl">Diese Seite gibt es nicht.</h1>
      <p className="mt-2 text-muted-foreground">Vielleicht hilft der Weg zurück zur Startseite.</p>
    </section>
  )
}
