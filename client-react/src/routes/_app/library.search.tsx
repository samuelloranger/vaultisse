import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SearchScreen } from '@/features/search/SearchScreen'
import {
  parseSearchParams,
  type SearchScreenParams,
  toSearchCriteria,
} from '@/features/search/searchParams'
import { searchQueryOptions } from '@/queries/search'

/**
 * `/app/library/search` — the library.
 *
 * The path matches the old client's `/library/search` rather than a tidier
 * `/search`: links to it exist in bookmarks, in the nav's quick filters and in
 * anything anyone has shared, and the cutover is meant to be a swap of which
 * `dist/` the server serves, not a URL migration.
 *
 * ## Why the loader only prefetches
 *
 * Same reason the dashboard's does: the policy one level up gates rendering
 * because the shell cannot be drawn without a user, while this screen has a
 * perfectly good loading state of its own. Awaiting would hold the navigation
 * on a blank frame for the length of the search.
 *
 * `loaderDeps` is what makes that prefetch correct — without it the loader
 * would not re-run when only the search params changed, and every filter
 * change would start its fetch from the component instead.
 */
export const Route = createFileRoute('/_app/library/search')({
  validateSearch: (raw: Record<string, unknown>): SearchScreenParams =>
    parseSearchParams(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchInfiniteQuery(
      searchQueryOptions(toSearchCriteria(deps.search))
    )
  },
  component: SearchRoute,
})

function SearchRoute() {
  const params = Route.useSearch()
  const navigate = useNavigate()

  return (
    <SearchScreen
      params={params}
      onParamsChange={(next) =>
        navigate({ to: '/library/search', search: next, replace: true })
      }
      onBookCreated={(id) =>
        navigate({ to: '/book/$book_id', params: { book_id: String(id) } })
      }
    />
  )
}
