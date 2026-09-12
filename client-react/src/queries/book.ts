import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getBookCounters, returnBooks } from '@/api/book'
import { bookKeys, dashboardKeys, loanKeys } from './keys'

/**
 * Book queries and mutations.
 *
 * `GET /book/counters` is cheap and read on every screen that shows the library
 * nav, so it gets a minute of staleness and a focus refetch.
 */
export const bookCountersQueryOptions = queryOptions({
  queryKey: bookKeys.counters(),
  queryFn: ({ signal }) => getBookCounters(signal),
  staleTime: 60 * 1000,
  refetchOnWindowFocus: true,
})

/** Library totals for the nav and the dashboard's tiles. */
export function useBookCounters() {
  return useQuery(bookCountersQueryOptions)
}

/**
 * Return one or more physical copies by stock code.
 *
 * ## The invalidation is the point
 *
 * Returning a copy moves numbers on three different resources: the book's own
 * counters (`onLoan`), the dashboard aggregate (`totalBookedBooks`,
 * `currentlyOnLoan`, `stockStatus`) and the loans list. The old client updated
 * a local array and hoped; here the mutation names every key it affects and the
 * cache refetches whatever is currently mounted.
 *
 * No optimistic update. The server does the return one stock at a time and can
 * fail partway through; showing a copy as returned before the server agrees is
 * how the old client ended up displaying a library state that did not exist.
 */
export function useReturnBooks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (codes: string[]) => returnBooks(codes),
    onSuccess: () => {
      // Prefix keys: `bookKeys.all` covers counters and every book detail,
      // present and future, without listing them.
      queryClient.invalidateQueries({ queryKey: bookKeys.all })
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: loanKeys.all })
    },
  })
}
