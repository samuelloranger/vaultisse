import { createFileRoute } from '@tanstack/react-router'
import { DashboardScreen } from '@/features/dashboard/DashboardScreen'
import { bookCountersQueryOptions } from '@/queries/book'
import { dashboardQueryOptions } from '@/queries/dashboard'

/**
 * `/app/` — the dashboard, the landing screen after login.
 *
 * The loader *prefetches* rather than awaits. That is the deliberate difference
 * from the policy loader one level up: the policy gates rendering because the
 * shell cannot be drawn without a user, while the dashboard's own data has a
 * perfectly good loading state. Awaiting it here would hold the navigation on a
 * blank screen for the length of the slowest of the endpoint's twelve queries.
 *
 * Both queries still start before the component mounts, so the round trip
 * overlaps the render instead of following it.
 */
export const Route = createFileRoute('/_app/')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(dashboardQueryOptions)
    void context.queryClient.prefetchQuery(bookCountersQueryOptions)
  },
  component: DashboardScreen,
})
