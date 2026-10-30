import { createFileRoute, redirect } from '@tanstack/react-router'
import { meQuery } from '@/lib/queries'
import { dashboardFor } from '@/lib/auth'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me.authenticated) throw redirect({ to: '/login' })
    throw redirect({ to: dashboardFor(me.role) })
  },
})
