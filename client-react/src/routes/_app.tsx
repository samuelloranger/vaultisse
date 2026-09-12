import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Suspense } from 'react'
import { AppShell } from '@/components/AppShell'
import { ScreenLoading } from '@/components/ScreenState'
import { LocaleProvider } from '@/locale/LocaleProvider'
import { policyQueryOptions, usePolicy } from '@/queries/app'

/**
 * The authenticated layout. Pathless (`_app`), so it wraps every screen without
 * adding a URL segment: `/app/` is the dashboard, not `/app/_app/`.
 *
 * ## The loader is the whole point of this file
 *
 * The old client fetched `/app/policy` from `App.vue`'s `onMounted` while the
 * router's global `beforeEach` guard read the user out of the same singleton.
 * Those are two independent lifecycles with no ordering between them, and when
 * the guard won the race it read a user that was still `null` and rendered
 * nothing — the blank-page bug fixed in `0302f66`.
 *
 * `ensureQueryData` here makes that unrepresentable. TanStack Router does not
 * render a route until its loader's promise settles, so by the time anything
 * below this layout mounts, the policy is *in the cache*. Children read it with
 * `usePolicy()` and get a value synchronously; there is no moment at which a
 * component can observe a half-loaded policy, and no lifecycle hook to race.
 *
 * The dead-session case never reaches here: the fetch layer hard-navigates to
 * `/login` before the promise rejects (see `api/http.ts`).
 */
export const Route = createFileRoute('/_app')({
  loader: ({ context }) => context.queryClient.ensureQueryData(policyQueryOptions),
  component: AppLayout,
})

function AppLayout() {
  const { data: policy } = usePolicy()

  return (
    <LocaleProvider
      language={policy.user.language}
      region={policy.user.region}
      labels={policy.labels}
    >
      <AppShell>
        {/* Screens below may suspend on their own data; the shell stays up. */}
        <Suspense fallback={<ScreenLoading />}>
          <Outlet />
        </Suspense>
      </AppShell>
    </LocaleProvider>
  )
}
