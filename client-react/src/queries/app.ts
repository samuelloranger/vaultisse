import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { getPolicy } from '@/api/app'
import { policyKeys } from './keys'

/**
 * The app policy — current user plus every reference list — as a query.
 *
 * ## What this replaces
 *
 * `client/src/service/ApplicationService.ts`: a module-level singleton with
 * reactive fields, fetched exactly once from `App.vue`'s `onMounted`, never
 * refetched, and mutated in place by views (`setCategories(...)` from a local
 * array, optimistic splices on delete). Under one user per library that was
 * merely fragile. Since the library became shared it is wrong — a category
 * another member adds is invisible until a full page reload.
 *
 * There is **no singleton here and there must not be one.** Anything that wants
 * the policy asks the cache for it.
 *
 * ## staleTime and refetchOnWindowFocus
 *
 * `staleTime` is 5 minutes: the reference lists change when *somebody* edits a
 * category or adds a location, which is rare, but they are read on nearly every
 * screen, so refetching per navigation would be pure waste.
 *
 * `refetchOnWindowFocus` is left **on** (the library default) and is the part
 * that actually fixes the bug. Coming back to a tab that has been open all day
 * is exactly when another member's changes are most likely to be waiting, and
 * it is the only refetch trigger that costs nothing when nothing has changed.
 *
 * Mutations that change a reference list invalidate {@link policyKeys.all}
 * rather than waiting for either.
 */
export const policyQueryOptions = queryOptions({
  queryKey: policyKeys.current(),
  queryFn: ({ signal }) => getPolicy(signal),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  // A dead session already hard-navigates to /login from the fetch layer;
  // retrying it just delays that. Other failures get one retry.
  retry: 1,
})

/**
 * Read the policy.
 *
 * Safe to call from anywhere under the authenticated layout: that route's
 * loader has already awaited the same query, so this resolves from cache on
 * first render rather than flashing a spinner.
 */
export function usePolicy() {
  return useSuspenseQuery(policyQueryOptions)
}

/**
 * Read the policy without suspending — for the few places that render before
 * the authenticated layout has run (an error boundary, say).
 */
export function usePolicyQuery() {
  return useQuery(policyQueryOptions)
}
