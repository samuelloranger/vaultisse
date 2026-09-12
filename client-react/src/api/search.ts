import { request } from './http'

/**
 * `/api/rest/book/search` — the library's one read endpoint for finding books.
 *
 * ## Why the wire types are declared here rather than in `api/types.ts`
 *
 * `api/types.ts` is the shared transcription file and several screens are
 * landing at once; every screen adding its shapes to one file is a merge
 * conflict per screen. Search owns exactly one endpoint, so its shapes live
 * with it. If this turns out to be the wrong call, moving them is a rename.
 *
 * The filter and sort vocabularies are `as const` tuples rather than `enum`s:
 * the server takes them as plain strings, the client needs to iterate them to
 * render the filter controls, and a tuple gives both without emitting a runtime
 * object that has to be tree-shaken.
 */

/** `SearchFilter` values the server understands, in the order they are offered. */
export const SEARCH_FILTERS = ['NO_STOCK', 'HAS_STOCK', 'ON_LOAN', 'RECENT'] as const

/** One `filters=` value. See `docs/BOOKS.md` → "Search, counters, and filters". */
export type SearchFilter = (typeof SEARCH_FILTERS)[number]

/** The three mutually exclusive stock states. `RECENT` is orthogonal to them. */
export const STOCK_FILTERS = ['NO_STOCK', 'HAS_STOCK', 'ON_LOAN'] as const

/** A stock-status choice — the subset of {@link SearchFilter} that is a state. */
export type StockFilter = (typeof STOCK_FILTERS)[number]

/** `sort=` values. `NAME_ASC` is the server's default for anything unrecognised. */
export const SORT_TYPES = [
  'NAME_ASC',
  'NAME_DESC',
  'DATE_NEWEST',
  'DATE_OLDEST',
] as const

export type SortType = (typeof SORT_TYPES)[number]

/** An author as the search endpoint returns them: id and name only. */
export type SearchAuthor = { id: number; name: string }

/** One row of the result grid. Deliberately smaller than `BookDetail`. */
export type SearchBook = {
  id: number
  name: string
  image_url: string | null
  isbn: string | null
  category_id: number | null
  language_code: string | null
  authors: SearchAuthor[]
}

/** `GET /book/search`. `limit` is the server's page size (50), not a request. */
export type SearchResponse = {
  total: number
  limit: number
  books: SearchBook[]
}

/**
 * Everything that narrows a search. Page is deliberately *not* in here: it is
 * the cursor of the infinite query, not part of what the user asked for, and
 * keeping it out means the cache key is exactly the user's criteria.
 */
export type SearchCriteria = {
  /** Free text; the server matches it against name *or* ISBN. */
  query?: string
  categoryId?: number | null
  filters?: SearchFilter[]
  /** `YYYY-MM-DD`. Inclusive at both ends (the server adds a day to `dateTo`). */
  dateFrom?: string | null
  dateTo?: string | null
  sort?: SortType
}

/**
 * `GET /book/search` — one page of results.
 *
 * @param page Zero-based. The server fixes the page size at 50 and reports it
 *   back as `limit`, which is what the caller pages with.
 */
export function searchBooks(
  criteria: SearchCriteria,
  page = 0,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const filters = criteria.filters?.length ? criteria.filters.join(',') : undefined

  return request<SearchResponse>('/book/search', {
    signal,
    params: {
      page,
      query: criteria.query?.trim() ? criteria.query.trim() : undefined,
      category_id: criteria.categoryId ?? undefined,
      filters,
      date_from: criteria.dateFrom ?? undefined,
      date_to: criteria.dateTo ?? undefined,
      sort: criteria.sort ?? 'NAME_ASC',
    },
  })
}
