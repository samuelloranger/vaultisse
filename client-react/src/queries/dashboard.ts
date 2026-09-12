import { queryOptions, useQuery } from '@tanstack/react-query'
import { getDashboard } from '@/api/dashboard'
import { dashboardKeys } from './keys'

/**
 * The dashboard aggregate.
 *
 * One endpoint, one loading state — that is the server's design (twelve queries
 * behind a single `Promise.all`), not something to split client-side.
 *
 * `staleTime` is short (30s) because this screen is a live picture of a shared
 * library: counts move whenever any member adds or lends a book. It is cheap
 * enough to be worth re-reading on focus.
 */
export const dashboardQueryOptions = queryOptions({
  queryKey: dashboardKeys.summary(),
  queryFn: ({ signal }) => getDashboard(signal),
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
})

/** The dashboard aggregate, for the dashboard screen. */
export function useDashboard() {
  return useQuery(dashboardQueryOptions)
}
