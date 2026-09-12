import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoansScreen } from '@/features/loans/LoansScreen'
import { policyQueryOptions } from '@/queries/app'
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
export const Route = createFileRoute('/_app/loans')({
  staticData: { title: 'Loans' },
  beforeLoad: async ({ context }) => {
    const policy = await context.queryClient.ensureQueryData(policyQueryOptions)
    if (!policy.user.leasingEnabled) throw redirect({ to: '/' })
  },
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(loansQueryOptions({ page: 0 }))
    void context.queryClient.prefetchQuery(customerGroupsQueryOptions)
    void context.queryClient.prefetchQuery(customersQueryOptions)
  },
  component: LoansScreen,
})
