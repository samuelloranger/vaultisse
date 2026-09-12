import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  type CustomerGroupInput,
  type CustomerInput,
  createCustomer,
  createCustomerGroup,
  deleteCustomer,
  deleteCustomerGroup,
  getCustomerBooks,
  getCustomerGroups,
  getCustomers,
  lendBooksToCustomer,
  returnCustomerBook,
  setCustomerGroup,
  updateCustomer,
  updateCustomerGroup,
} from '@/api/customer'
import {
  bookKeys,
  customerKeys,
  dashboardKeys,
  loanKeys,
  locationKeys,
  policyKeys,
  searchKeys,
} from './keys'

/**
 * Borrowers, their groups, and what each of them currently holds.
 *
 * ## Why a borrower mutation names so many keys
 *
 * A borrower is not a leaf. They appear in `/app/policy`'s reference lists (the
 * lend dialogs' borrower picker reads it), the dashboard counts them
 * (`totalCustomers`), and *lending* to one moves a copy: the book's counters,
 * the loans list, the shelf the copy came from, and the dashboard's
 * `totalBookedBooks` all change in the same write. The old client kept those in
 * step by splicing local arrays, which is precisely what went wrong the moment
 * a second member of the shared library was editing at the same time.
 *
 * So the mutations below fall into two groups: those that change *the set of
 * borrowers* ({@link invalidateCustomers}) and those that change *what is on
 * loan* ({@link invalidateLoanState}). The second is a superset of the first.
 *
 * No optimistic updates anywhere. `total_books` is computed server-side per
 * request, and a guess about a shared library is a guess about what somebody
 * else may be doing to it right now.
 */

/** Every borrower, with their group and their live loan count. */
export const customersQueryOptions = queryOptions({
  queryKey: customerKeys.list(),
  queryFn: ({ signal }) => getCustomers(signal),
  // Short: the counts move whenever anybody lends or takes back a copy.
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
})

/** The borrowers list. */
export function useCustomers() {
  return useQuery(customersQueryOptions)
}

/** Every borrower group, with its member count. */
export const customerGroupsQueryOptions = queryOptions({
  queryKey: customerKeys.groups(),
  queryFn: ({ signal }) => getCustomerGroups(signal),
  staleTime: 60 * 1000,
  refetchOnWindowFocus: true,
})

/** The borrower groups list. */
export function useCustomerGroups() {
  return useQuery(customerGroupsQueryOptions)
}

/**
 * The copies one borrower currently holds.
 *
 * A separate query rather than a field on the list row, for the same reason
 * `locationBooksQueryOptions` is: a screen listing twenty borrowers must not
 * fetch twenty book lists to render twenty collapsed rows. The panel mounts
 * when a row is expanded, and that is what starts this.
 */
export function customerBooksQueryOptions(id: number) {
  return queryOptions({
    queryKey: customerKeys.books(id),
    queryFn: ({ signal }) => getCustomerBooks(id, signal),
    staleTime: 30 * 1000,
  })
}

/** The copies one borrower currently holds. */
export function useCustomerBooks(id: number) {
  return useQuery(customerBooksQueryOptions(id))
}

/**
 * Everything a change to the *set of borrowers or groups* can be seen through.
 *
 * A prefix sweep rather than a surgical list: these are cheap endpoints, a
 * stale borrower picker is a bug users have actually hit, and a key forgotten
 * here fails silently and invisibly.
 */
function invalidateCustomers(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: customerKeys.all })
  // `/app/policy` carries the lend dialogs' list of borrowers.
  queryClient.invalidateQueries({ queryKey: policyKeys.all })
  // `totalCustomers` is a dashboard tile.
  queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
}

/**
 * Everything a lend or a return moves — which is more than the borrower.
 *
 * The copy changes hands, so the book's own counters (`onLoan`), the loans
 * list, the search grid's "on loan" filter, the shelf the copy sits on, and the
 * dashboard's `totalBookedBooks` / `currentlyOnLoan` / `stockStatus` are all
 * now wrong. This is the mirror of `invalidateStockContent` in
 * `queries/book.ts` — the same event arriving from the other side — and the two
 * name the same set for that reason.
 */
function invalidateLoanState(queryClient: QueryClient) {
  invalidateCustomers(queryClient)
  queryClient.invalidateQueries({ queryKey: bookKeys.all })
  queryClient.invalidateQueries({ queryKey: searchKeys.all })
  queryClient.invalidateQueries({ queryKey: loanKeys.all })
  queryClient.invalidateQueries({ queryKey: locationKeys.all })
}

/** Create a borrower. */
export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(input),
    onSuccess: () => invalidateCustomers(queryClient),
  })
}

/** Rename a borrower. */
export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CustomerInput }) =>
      updateCustomer(id, input),
    onSuccess: () => invalidateCustomers(queryClient),
  })
}

/**
 * Delete a borrower.
 *
 * Invalidates the loan state, not just the borrower list: the server does not
 * stop you deleting somebody who still has copies out, and those copies'
 * `customer_id` goes with them.
 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => invalidateLoanState(queryClient),
  })
}

/** Create a borrower group. A duplicate name comes back as a 409. */
export function useCreateCustomerGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CustomerGroupInput) => createCustomerGroup(input),
    onSuccess: () => invalidateCustomers(queryClient),
  })
}

/** Rename / re-describe a borrower group. A duplicate name comes back as a 409. */
export function useUpdateCustomerGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CustomerGroupInput }) =>
      updateCustomerGroup(id, input),
    onSuccess: () => invalidateCustomers(queryClient),
  })
}

/**
 * Delete a borrower group.
 *
 * Its members' `group_id` goes to `NULL` server-side, so the *borrowers* list
 * changes too — which `invalidateCustomers` already covers, and is the reason
 * this does not invalidate only the groups key.
 */
export function useDeleteCustomerGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCustomerGroup(id),
    onSuccess: () => invalidateCustomers(queryClient),
  })
}

/**
 * Move a borrower into a group, or out of every group (`groupId: null`).
 *
 * One mutation for both directions because it is one intent, and because a
 * batch move fires it once per borrower: a caller that had to pick between two
 * hooks per row would end up with the branch in the component.
 */
export function useSetCustomerGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, groupId }: { id: number; groupId: number | null }) =>
      setCustomerGroup(id, groupId),
    onSuccess: () => invalidateCustomers(queryClient),
  })
}

/**
 * Lend a batch of copies to one borrower, by the code printed on each copy.
 *
 * The loans list, the book counters and the dashboard all move with it — see
 * {@link invalidateLoanState}.
 */
export function useLendBooksToCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, codes }: { id: number; codes: string[] }) =>
      lendBooksToCustomer(id, codes),
    onSuccess: () => invalidateLoanState(queryClient),
  })
}

/**
 * Take one copy back from a borrower.
 *
 * Uses the customer-scoped `DELETE /customer/:id/book/:code` rather than the
 * unscoped `POST /book/return`, because here the borrower is known and the
 * server's `AND customer_id = $4` then makes a mistyped code a no-op instead of
 * returning somebody else's copy.
 */
export function useReturnCustomerBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, code }: { id: number; code: string }) =>
      returnCustomerBook(id, code),
    onSuccess: () => invalidateLoanState(queryClient),
  })
}
