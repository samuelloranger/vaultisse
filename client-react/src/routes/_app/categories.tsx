import { createFileRoute } from '@tanstack/react-router'
import { CategoriesScreen } from '@/features/categories/CategoriesScreen'
import { categoriesQueryOptions } from '@/queries/category'

/** `/app/categories`. Prefetched, not awaited — see `locations.tsx`. */
export const Route = createFileRoute('/_app/categories')({
  staticData: { title: 'Categories' },
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(categoriesQueryOptions)
  },
  component: CategoriesScreen,
})
