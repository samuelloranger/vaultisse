import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { parseTabParam } from '@/components/ScreenTabs'
import {
  ADMIN_TAB_VALUES,
  AdminScreen,
  type AdminTab,
} from '@/features/admin/AdminScreen'
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
 *
 * It prefetches the **accounts** list and nothing else, because Accounts is the
 * tab this route opens on. The other two tabs fetch their own settings when
 * they are shown; prefetching those here would fire a request for a panel most
 * visits never open.
 *
 * ## `?tab=` is the screen's own state, in the URL
 *
 * Same argument as the library's filters (`features/search/searchParams.ts`):
 * a tab someone is looking at is a thing they link to, bookmark and reload
 * onto. `parseTabParam` falls back to the first tab for anything unrecognised,
 * so a hand-typed `?tab=nonsense` lands on Accounts rather than on an empty
 * frame.
 */
export const Route = createFileRoute('/_app/admin')({
  staticData: { title: 'Admin' },
  validateSearch: (raw: Record<string, unknown>): { tab: AdminTab } => ({
    tab: parseTabParam(raw.tab, ADMIN_TAB_VALUES),
  }),
  loader: async ({ context }) => {
    const policy = await context.queryClient.ensureQueryData(policyQueryOptions)
    if (!policy.user.isAdmin) return
    void context.queryClient.prefetchQuery(adminUsersQueryOptions)
  },
  component: AdminRoute,
})

function AdminRoute() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate()

  return (
    <AdminScreen
      tab={tab}
      // `replace`, not a push: a tab bar is a view of one screen, and three
      // taps around it should not mean three presses of Back to leave the
      // screen. The URL still carries the tab, so a link to it still works.
      onTabChange={(next) =>
        navigate({ to: '/admin', search: { tab: next }, replace: true })
      }
    />
  )
}
