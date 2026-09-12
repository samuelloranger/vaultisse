import { createFileRoute } from '@tanstack/react-router'
import { CustomersScreen } from '@/features/customers/CustomersScreen'
import { customerGroupsQueryOptions, customersQueryOptions } from '@/queries/customer'

/**
 * `/app/customers`.
 *
 * `prefetchQuery`, not `ensureQueryData`: the screen has a real loading state,
 * so awaiting here would hold the navigation on a blank frame for no gain. The
 * requests still start before the component mounts, so both round trips overlap
 * the render. Only the policy — which the shell cannot draw without — is
 * awaited, one level up in `_app.tsx`.
 *
 * Both lists are prefetched even though only one tab is visible. They are two
 * small, uncounted-cost calls, the group count is on screen the moment the
 * Groups tab is touched, and the borrowers list is what the groups tab's member
 * panels are filtered from — so fetching only the visible one would trade a
 * request saved for a spinner in the other tab.
 *
 * The per-borrower book lists are deliberately *not* prefetched: twenty
 * collapsed rows would mean twenty requests for lists nobody has asked to see.
 * They start when a row is expanded.
 */
export const Route = createFileRoute('/_app/customers')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(customersQueryOptions)
    void context.queryClient.prefetchQuery(customerGroupsQueryOptions)
  },
  component: CustomersScreen,
})
