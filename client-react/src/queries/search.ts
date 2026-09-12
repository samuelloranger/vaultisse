import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query'
import { type SearchCriteria, type SearchResponse, searchBooks } from '@/api/search'
import { searchKeys } from './keys'

/**
 * The library search.
 *
 * ## Why an infinite query rather than a paged one
 *
 * The endpoint is a fixed 50 per page and the old client paged it by listening
 * to the scroller's `scroll` event, comparing a zero-height sentinel's
 * `getBoundingClientRect()` against `window.innerHeight`, and appending into a
 * local array — with a 300px fudge factor because at maximum scroll the
 * sentinel sits exactly flush with the viewport bottom and the last page was
 * otherwise unreachable. `useInfiniteQuery` owns the accumulated pages, the
 * cursor and the "is there more" question, so none of that exists here.
 *
 * The trigger is a real button rather than a scroll position, per the spec's
 * ban on an affordance with no visible control: a scroll sentinel is invisible
 * to a keyboard and unreachable from a screen reader's virtual cursor.
 *
 * ## The key is the criteria
 *
 * `page` is not part of {@link SearchCriteria} on purpose — it is this query's
 * cursor, not something the user asked for. So the cache key is exactly the
 * user's filters, every distinct filter combination caches separately, and
 * going back to a previous filter set is instant.
 */
export function searchQueryOptions(criteria: SearchCriteria) {
  return infiniteQueryOptions({
    // `searchKeys.results` takes a plain record; criteria is already one.
    queryKey: searchKeys.results(criteria as Record<string, unknown>),
    queryFn: ({ pageParam, signal }) => searchBooks(criteria, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last: SearchResponse, pages) => {
      const loaded = pages.reduce((n, page) => n + page.books.length, 0)
      return loaded < last.total ? pages.length : undefined
    },
    // Short: this is a shared library, and a result set goes stale the moment
    // another member adds a book that matches it.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })
}

/** Search results for the current filters, page by page. */
export function useSearchBooks(criteria: SearchCriteria) {
  return useInfiniteQuery(searchQueryOptions(criteria))
}
