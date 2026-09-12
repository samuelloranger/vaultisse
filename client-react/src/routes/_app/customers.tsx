import { createFileRoute, redirect } from '@tanstack/react-router'
import { CustomersScreen } from '@/features/customers/CustomersScreen'
import { policyQueryOptions } from '@/queries/app'
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
 *
 * ## The lending gate
 *
 * Hiding the nav row is not enough - a bookmark, a typed URL or a link in an
 * old email still lands here - so the route sends the visitor to the dashboard
 * when lending is switched off. This is the opposite call from `admin.tsx`, and
 * deliberately: a non-admin is being told "not yours", which deserves an answer
 * on the page, whereas lending-off is a feature the whole instance has turned
 * off, so there is nothing here to explain and nothing the visitor is being
 * refused.
 *
 * It is **cosmetic, not a guard**. The server does not consult
 * `app_settings.leasing_enabled` on these endpoints - they are `requireAuth`
 * and nothing else - so this removes a dead end from the UI, it does not
 * protect data. If the flag ever needs to mean "off", it has to mean it in
 * `LoansRoute.ts` and `CustomerRoute.ts` first.
 *
 * `ensureQueryData` is a cache hit: the `_app` layout awaits the same query.
 */
export const Route = createFileRoute('/_app/customers')({
  staticData: { title: 'Customers' },
  beforeLoad: async ({ context }) => {
    const policy = await context.queryClient.ensureQueryData(policyQueryOptions)
    if (!policy.user.leasingEnabled) throw redirect({ to: '/' })
  },
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(customersQueryOptions)
    void context.queryClient.prefetchQuery(customerGroupsQueryOptions)
  },
  component: CustomersScreen,
})
