import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  type CategoryInput,
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from '@/api/category'
import { bookKeys, categoryKeys, dashboardKeys, policyKeys, searchKeys } from './keys'

/**
 * Categories: the list and its three mutations.
 *
 * ## Why a category mutation invalidates five resources
 *
 * A category is reference data, and reference data is read everywhere: the book
 * form's picker and the search filter both come from `/app/policy`, the
 * dashboard builds a shelf per top category, and a book shows its category by
 * name. Renaming "Sci-fi" to "Science-fiction" has to move all of it.
 *
 * Deleting is the sharper case. `books.category_id` is nullable and the delete
 * does not cascade, so the books survive — *uncategorised*. Their detail and
 * search rows change without any book endpoint having been called, which is
 * exactly the kind of change the old client's local-array bookkeeping could not
 * see.
 */
export const categoriesQueryOptions = queryOptions({
  queryKey: categoryKeys.list(),
  queryFn: ({ signal }) => getCategories(signal),
  // Reference data: rarely edited, read on nearly every screen.
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
})

/** Every category in the shared library. */
export function useCategories() {
  return useQuery(categoriesQueryOptions)
}

/** See this module's header for why the sweep is this wide. */
function invalidateCategories(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: categoryKeys.all })
  queryClient.invalidateQueries({ queryKey: policyKeys.all })
  queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
  queryClient.invalidateQueries({ queryKey: bookKeys.all })
  queryClient.invalidateQueries({ queryKey: searchKeys.all })
}

/** Create a category. */
export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: () => invalidateCategories(queryClient),
  })
}

/** Rename a category. */
export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CategoryInput }) =>
      updateCategory(id, input),
    onSuccess: () => invalidateCategories(queryClient),
  })
}

/** Delete a category. Its books survive, uncategorised. */
export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () => invalidateCategories(queryClient),
  })
}
