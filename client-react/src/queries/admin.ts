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
  updateAdminUser,
} from '@/api/admin'
import { adminKeys } from './keys'

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
