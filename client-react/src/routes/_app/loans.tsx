import { createFileRoute } from '@tanstack/react-router'
import { LoansScreen } from '@/features/loans/LoansScreen'
import { customerGroupsQueryOptions, customersQueryOptions } from '@/queries/customer'
import { loansQueryOptions } from '@/queries/loans'

/**
 * `/app/loans`.
 *
 * `prefetchQuery`, not `ensureQueryData`: the screen has a real loading state,
 * so awaiting here would hold the navigation on a blank frame for no gain. Only
 * the policy — which the shell cannot draw without — is awaited, one level up
 * in `_app.tsx`.
 *
 * The unfiltered first page is what the screen opens on, so that is what is
 * prefetched; any filter the user then sets is a new cache key and a new
 * request, which is the point of keying the query by its filters.
 *
 * Groups and customers are prefetched too. They are not the screen's data —
 * they are the *filters'* data, and the group select rendering empty for a beat
 * on arrival reads as "there are no groups" rather than as "still loading".
 */
export const Route = createFileRoute('/_app/loans')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(loansQueryOptions({ page: 0 }))
    void context.queryClient.prefetchQuery(customerGroupsQueryOptions)
    void context.queryClient.prefetchQuery(customersQueryOptions)
  },
  component: LoansScreen,
})
