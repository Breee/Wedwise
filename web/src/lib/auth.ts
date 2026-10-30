import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { meQuery } from './queries'
import type { Me, Role } from './types'

export async function requireRole(queryClient: QueryClient, roles: Role[]): Promise<Me> {
  const me = await queryClient.ensureQueryData(meQuery)
  if (!me.authenticated) throw redirect({ to: '/login', search: { redirect: location.pathname } })
  if (me.role === 'admin' || (me.role && roles.includes(me.role))) return me
  throw redirect({ to: '/dashboard' })
}

export function dashboardFor(role: Role | undefined): '/couple/dashboard' | '/witness/dashboard' {
  return role === 'witness' ? '/witness/dashboard' : '/couple/dashboard'
}
