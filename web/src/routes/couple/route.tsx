import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requireRole } from '@/lib/auth'

export const Route = createFileRoute('/couple')({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ['couple']),
  component: () => (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Outlet />
    </div>
  ),
})
