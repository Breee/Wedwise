import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requireRole } from '@/lib/auth'

export const Route = createFileRoute('/witness')({
  beforeLoad: ({ context }) => requireRole(context.queryClient, ['witness']),
  component: () => (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Outlet />
    </div>
  ),
})
