import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  type AuthorInput,
  createAuthor,
  deleteAuthor,
  getAuthors,
  updateAuthor,
} from '@/api/author'
import { authorKeys, bookKeys, dashboardKeys, searchKeys } from './keys'

/**
 * Authors: the list and its three mutations.
 *
 * The same shape as categories, with one difference worth naming: authors are
 * **not** part of the `/app/policy` bootstrap — the book editor reaches for
 * `POST /author/search` instead of a preloaded list — so `policyKeys` is
 * deliberately absent from the sweep below. A book still shows its authors by
 * name, and the dashboard counts them, so books, search and the dashboard are
 * all still in it.
 */
export const authorsQueryOptions = queryOptions({
  queryKey: authorKeys.list(),
  queryFn: ({ signal }) => getAuthors(signal),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
})

/** Every author in the shared library. */
export function useAuthors() {
  return useQuery(authorsQueryOptions)
}

/** See this module's header — no `policyKeys`, on purpose. */
function invalidateAuthors(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: authorKeys.all })
  // `totalAuthors` is a dashboard tile; a book renders its authors by name.
  queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
  queryClient.invalidateQueries({ queryKey: bookKeys.all })
  queryClient.invalidateQueries({ queryKey: searchKeys.all })
}

/** Create an author. */
export function useCreateAuthor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AuthorInput) => createAuthor(input),
    onSuccess: () => invalidateAuthors(queryClient),
  })
}

/** Rename an author. */
export function useUpdateAuthor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: AuthorInput }) =>
      updateAuthor(id, input),
    onSuccess: () => invalidateAuthors(queryClient),
  })
}

/** Delete an author. Their books survive. */
export function useDeleteAuthor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteAuthor(id),
    onSuccess: () => invalidateAuthors(queryClient),
  })
}
