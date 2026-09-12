import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  addBookStock,
  type BookUpdate,
  createBook,
  createBookFromIsbn,
  deleteBook,
  deleteBookFile,
  deleteBookStock,
  getBook,
  getBookCounters,
  returnBooks,
  type StockInput,
  updateBook,
  updateBookStock,
  uploadBookCover,
  uploadBookFile,
} from '@/api/book'
import {
  authorKeys,
  bookKeys,
  categoryKeys,
  customerKeys,
  dashboardKeys,
  loanKeys,
  locationKeys,
  policyKeys,
  searchKeys,
} from './keys'

/**
 * Book queries and mutations.
 *
 * `GET /book/counters` is cheap and read on every screen that shows the library
 * nav, so it gets a minute of staleness and a focus refetch.
 */
export const bookCountersQueryOptions = queryOptions({
  queryKey: bookKeys.counters(),
  queryFn: ({ signal }) => getBookCounters(signal),
  staleTime: 60 * 1000,
  refetchOnWindowFocus: true,
})

/** Library totals for the nav and the dashboard's tiles. */
export function useBookCounters() {
  return useQuery(bookCountersQueryOptions)
}

/**
 * One book's full detail.
 *
 * `staleTime` is short for the same reason the dashboard's is: a copy can be
 * lent out or shelved elsewhere by another member while this page is open, and
 * the stock list is the part of this screen most likely to be acted on.
 */
export function bookQueryOptions(id: number) {
  return queryOptions({
    queryKey: bookKeys.detail(id),
    queryFn: ({ signal }) => getBook(id, signal),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })
}

/** One book's full detail, for the book screen. */
export function useBook(id: number) {
  return useQuery(bookQueryOptions(id))
}

/**
 * Everything a change to a book's *content* moves.
 *
 * Naming them in one place rather than at each mutation is the point of
 * `queries/keys.ts`: adding, editing or deleting a book changes the result of
 * every search (the grid), the nav's four counters, and eight numbers on the
 * dashboard. A mutation that forgot one of those is exactly the stale-cache bug
 * class this rewrite exists to delete.
 */
function invalidateBookContent(queryClient: QueryClient) {
  // Prefix keys: `bookKeys.all` covers counters and every book detail,
  // present and future, without listing them.
  queryClient.invalidateQueries({ queryKey: bookKeys.all })
  queryClient.invalidateQueries({ queryKey: searchKeys.all })
  queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
}

/**
 * Everything a change to a *copy* moves, on top of the above: a copy belongs to
 * a shelf and may belong to a borrower, and lending or returning it writes a
 * `loan_history` row.
 */
function invalidateStockContent(queryClient: QueryClient) {
  invalidateBookContent(queryClient)
  queryClient.invalidateQueries({ queryKey: loanKeys.all })
  queryClient.invalidateQueries({ queryKey: locationKeys.all })
  queryClient.invalidateQueries({ queryKey: customerKeys.all })
}

/**
 * Return one or more physical copies by stock code.
 *
 * ## The invalidation is the point
 *
 * Returning a copy moves numbers on three different resources: the book's own
 * counters (`onLoan`), the dashboard aggregate (`totalBookedBooks`,
 * `currentlyOnLoan`, `stockStatus`) and the loans list. The old client updated
 * a local array and hoped; here the mutation names every key it affects and the
 * cache refetches whatever is currently mounted.
 *
 * No optimistic update. The server does the return one stock at a time and can
 * fail partway through; showing a copy as returned before the server agrees is
 * how the old client ended up displaying a library state that did not exist.
 */
export function useReturnBooks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (codes: string[]) => returnBooks(codes),
    onSuccess: () => invalidateStockContent(queryClient),
  })
}

/** Overwrite a book's metadata. See {@link BookUpdate} on why it is a whole-record write. */
export function useUpdateBook(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BookUpdate) => updateBook(id, input),
    onSuccess: () => invalidateBookContent(queryClient),
  })
}

/**
 * Delete a book.
 *
 * No optimistic removal and no manual cache eviction: the detail query is
 * invalidated like everything else and the screen navigates away, so the only
 * state that could go stale is unmounted before it matters.
 */
export function useDeleteBook(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => deleteBook(id),
    onSuccess: () => invalidateBookContent(queryClient),
  })
}

/** Replace a book's cover image. */
export function useUploadBookCover(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (image: File) => uploadBookCover(id, image),
    onSuccess: () => invalidateBookContent(queryClient),
  })
}

/** Upload (or replace) one backup ebook file. */
export function useUploadBookFile(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => uploadBookFile(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookKeys.detail(id) })
    },
  })
}

/** Remove one backup ebook file. */
export function useDeleteBookFile(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (fileId: number) => deleteBookFile(id, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookKeys.detail(id) })
    },
  })
}

/** Add a physical copy of a book at a location. */
export function useAddBookStock(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: StockInput) => addBookStock(id, input),
    onSuccess: () => invalidateStockContent(queryClient),
  })
}

/** Move, lend, return or re-status one physical copy. */
export function useUpdateBookStock(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ stockId, input }: { stockId: number; input: StockInput }) =>
      updateBookStock(id, stockId, input),
    onSuccess: () => invalidateStockContent(queryClient),
  })
}

/** Discard one physical copy. */
export function useDeleteBookStock(id: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (stockId: number) => deleteBookStock(id, stockId),
    onSuccess: () => invalidateStockContent(queryClient),
  })
}

/** Create a book by hand. Resolves to the new book's id. */
export function useCreateBook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      name: string
      description?: string
      isbn?: string
      image?: File | null
    }) => createBook(input),
    onSuccess: () => {
      invalidateStockContent(queryClient)
    },
  })
}

/**
 * Create a book from an ISBN lookup. Resolves to the new — or already
 * existing, matched by ISBN — book's id.
 *
 * ## Why this invalidates the policy
 *
 * The lookup is find-or-create all the way down: it can create a *category*, an
 * *author* and a *language* row as a side effect of importing one barcode. Two
 * of those three are reference lists delivered by `/app/policy`, which every
 * dropdown in the app reads. Without this, a category the scan just created is
 * missing from the book screen's category picker until the policy's five-minute
 * staleness expires — the shared-library bug in miniature, reintroduced by the
 * one endpoint that writes to three resources at once.
 */
export function useCreateBookFromIsbn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ isbn, locationId }: { isbn: string; locationId: number | null }) =>
      createBookFromIsbn(isbn, locationId),
    onSuccess: () => {
      invalidateStockContent(queryClient)
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      queryClient.invalidateQueries({ queryKey: categoryKeys.all })
      queryClient.invalidateQueries({ queryKey: authorKeys.all })
    },
  })
}
