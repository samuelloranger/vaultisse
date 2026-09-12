import { createFileRoute } from '@tanstack/react-router'
import { AuthorsScreen } from '@/features/authors/AuthorsScreen'
import { authorsQueryOptions } from '@/queries/author'

/** `/app/authors`. Prefetched, not awaited — see `locations.tsx`. */
export const Route = createFileRoute('/_app/authors')({
  staticData: { title: 'Authors' },
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(authorsQueryOptions)
  },
  component: AuthorsScreen,
})
