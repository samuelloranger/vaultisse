import { createFileRoute } from '@tanstack/react-router'
import { AdminScreen } from '@/features/admin/AdminScreen'
import { adminUsersQueryOptions } from '@/queries/admin'
import { policyQueryOptions } from '@/queries/app'

/**
 * `/app/admin`.
 *
 * ## The loader does not guard this route, and must not
 *
 * A `redirect()` here would be the obvious-looking thing and the wrong one. A
 * non-admin's session is perfectly valid; sending them to `/login` tells them
 * to fix something that is not broken, and sending them to the dashboard hides
 * the fact that the page exists and they cannot use it. The screen renders the
 * refusal instead, which is also what happens if the server disagrees with the
 * policy — it is the only authority, and it re-checks the role on every request
 * from the live DB rather than from a token claim.
 *
 * So the loader only *prefetches*, and only for an admin. The policy is already
 * in the cache (the `_app` layout awaited it), so reading it here is a cache
 * hit, not a second request.
 */
export const Route = createFileRoute('/_app/admin')({
  staticData: { title: 'Admin' },
  loader: async ({ context }) => {
    const policy = await context.queryClient.ensureQueryData(policyQueryOptions)
    if (!policy.user.isAdmin) return
    void context.queryClient.prefetchQuery(adminUsersQueryOptions)
  },
  component: AdminScreen,
})
