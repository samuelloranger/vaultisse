import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  type AdminAccountPatch,
  deleteAdminUser,
  getAdminUsers,
  getInstanceSettings,
  type InstanceSettingsPatch,
  updateAdminUser,
  updateInstanceSettings,
} from '@/api/admin'
import { adminKeys, policyKeys } from './keys'

/**
 * The admin panel's server state.
 *
 * ## `retry: false`, and why it matters here specifically
 *
 * The list 403s for every non-admin. A retried 403 is three identical refusals
 * and a three-second wait before the screen can say so — and the answer will
 * never change, because a role is not a transient failure. The screen gates
 * itself on `policy.user.isAdmin` before this query ever mounts, so a 403
 * reaching here means the role changed underneath the tab, which is worth
 * showing immediately.
 *
 * ## Nothing here is optimistic
 *
 * Promoting an account can be refused by a guard rail the client cannot
 * evaluate — "the last usable admin" depends on rows this client has not
 * counted and another admin may be changing right now. An optimistic flip would
 * show a promotion that then silently reverts. The mutations answer with the
 * updated account, so the list is refreshed from the server's own view.
 */
export const adminUsersQueryOptions = queryOptions({
  queryKey: adminKeys.users(),
  queryFn: ({ signal }) => getAdminUsers(signal),
  // Accounts change rarely, but a pending registration waiting for approval is
  // exactly what someone opens this screen to find.
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
})

/**
 * Every account on the instance.
 *
 * `enabled` exists so a non-admin who types `/app/admin` never sends the
 * request at all. The screen already knows the answer from
 * `policy.user.isAdmin`, and firing a request whose only possible outcome is a
 * 403 would put a failed call in the network log of a page that is behaving
 * exactly as intended. The server remains the authority — this just declines to
 * ask a question already answered.
 */
export function useAdminUsers(enabled = true) {
  return useQuery({ ...adminUsersQueryOptions, enabled })
}

/**
 * Promote/demote or enable/disable one account.
 *
 * A `403` is a guard rail, not a session failure, and its `message` is written
 * to be shown to the user verbatim. The screen renders it; this hook must not
 * swallow it, and `api/http.ts` must not redirect on it.
 */
export function useUpdateAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AdminAccountPatch }) =>
      updateAdminUser(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
  })
}

/**
 * Delete one account.
 *
 * Invalidates only the admin list. It deliberately does **not** touch the book,
 * author or location caches: deleting a member leaves every contribution in
 * place (`created_by ... ON DELETE SET NULL`), so nothing else on screen moved.
 * The one thing that does change is attribution, which no current screen reads.
 */
export function useDeleteAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteAdminUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all })
    },
  })
}

/**
 * The single `app_settings` row.
 *
 * `retry: false` for the same reason the account list has it: this 403s for
 * every non-admin and a role is not a transient failure.
 *
 * Not prefetched by the route, and that is deliberate. The Accounts tab is what
 * `/app/admin` opens on, so prefetching this would fire a request for a tab
 * most visits never reach. The two tabs that need it mount their own query when
 * they are shown — which is the only lazy-loading a `Tabs.Content` needs, since
 * it renders nothing at all until it is selected.
 */
export const adminSettingsQueryOptions = queryOptions({
  queryKey: adminKeys.settings(),
  queryFn: ({ signal }) => getInstanceSettings(signal),
  // One row that only an admin can change, so it is not going to move under
  // anyone — but two admins *can* be in the panel at once, and this is the
  // screen where finding out matters.
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
  retry: false,
})

/** The instance settings. Admin-only. */
export function useAdminSettings() {
  return useQuery(adminSettingsQueryOptions)
}

/**
 * Change one or more instance settings.
 *
 * **Invalidating the policy is the point of this mutation, not a tidy-up after
 * it.** `leasingEnabled` lives in the policy's user object and is what
 * `AppShell` reads to decide whether the Loans and Customers nav entries exist.
 * Without the invalidation the switch would flip and the nav would not, until
 * something else happened to refetch.
 *
 * The response carries the full settings object, so it is written straight into
 * the cache rather than triggering a second round trip — and it has to be the
 * server's copy, because `registrationApprovalFromEnv` flips to `false` as a
 * *consequence* of writing the approval toggle. A client-side guess would show
 * the wrong provenance until the next refetch.
 *
 * No optimistic update, for the same reason the account mutations have none: a
 * switch that flips back a moment later is worse than one that takes 80ms, and
 * this one is changing what other people see.
 */
export function useUpdateInstanceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: InstanceSettingsPatch) => updateInstanceSettings(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(adminKeys.settings(), settings)
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
    },
  })
}
