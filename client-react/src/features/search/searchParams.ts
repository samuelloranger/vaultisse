import {
  type SearchCriteria,
  type SearchFilter,
  SORT_TYPES,
  type SortType,
  STOCK_FILTERS,
  type StockFilter,
} from '@/api/search'

/**
 * The search screen's state, as it appears in the URL.
 *
 * ## Why the URL and not `useState`
 *
 * A filtered result set is the thing people share, bookmark and reach with the
 * back button, and the old client already treated it that way — its controller
 * read `query`, `category`, `filters`, `date_from` and `date_to` off the route
 * and re-ran the search whenever they changed. Keeping that in the URL also
 * makes the cache key fall out for free: the criteria *are* the key, so the
 * back button is a cache hit rather than a refetch.
 *
 * Names are short because they are user-visible. `filters` is decomposed into
 * `stock` and `recent`, which is what the controls actually offer: `NO_STOCK`
 * and `HAS_STOCK` are contradictory, so exposing all four as free-form
 * multi-select lets someone ask for books that have no copies and at least one.
 */
export type SearchScreenParams = {
  /** Free text, matched against title or ISBN. */
  q?: string
  categoryId?: number
  stock?: StockFilter
  /** Added in the last 30 days. Orthogonal to {@link stock}. */
  recent?: boolean
  /** `YYYY-MM-DD`. */
  from?: string
  to?: string
  sort?: SortType
  /** Display-only: render the results in one section per category. */
  group?: boolean
}

/** `YYYY-MM-DD`, which is both what `<input type="date">` emits and what the server takes. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function asDate(value: unknown): string | undefined {
  const text = asString(value)
  return text && ISO_DATE.test(text) ? text : undefined
}

/**
 * Parse the raw search-param object into {@link SearchScreenParams}.
 *
 * Anything unrecognised is dropped rather than passed through. A URL is user
 * input: `?sort=DROP%20TABLE` has to produce the default sort, not a request
 * the server then has to defend itself against.
 */
export function parseSearchParams(raw: Record<string, unknown>): SearchScreenParams {
  const sort = asString(raw.sort)
  const stock = asString(raw.stock)
  const categoryId = Number(raw.categoryId)

  return {
    q: asString(raw.q),
    categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : undefined,
    stock: STOCK_FILTERS.includes(stock as StockFilter)
      ? (stock as StockFilter)
      : undefined,
    recent: raw.recent === true || raw.recent === 'true' ? true : undefined,
    from: asDate(raw.from),
    to: asDate(raw.to),
    sort: SORT_TYPES.includes(sort as SortType) ? (sort as SortType) : undefined,
    group: raw.group === true || raw.group === 'true' ? true : undefined,
  }
}

/**
 * Turn the screen's params into what `GET /book/search` takes.
 *
 * `group` deliberately does not appear: it is a rendering choice made over
 * results already in hand, so putting it in here would split the cache in two
 * and refetch the identical result set on a toggle that changes no data.
 */
export function toSearchCriteria(params: SearchScreenParams): SearchCriteria {
  const filters: SearchFilter[] = []
  if (params.stock) filters.push(params.stock)
  if (params.recent) filters.push('RECENT')

  return {
    query: params.q,
    categoryId: params.categoryId ?? null,
    filters,
    dateFrom: params.from ?? null,
    dateTo: params.to ?? null,
    sort: params.sort ?? 'NAME_ASC',
  }
}

/** Whether anything narrows the results — drives the "Clear filters" control. */
export function hasActiveFilters(params: SearchScreenParams): boolean {
  return Boolean(
    params.q ||
      params.categoryId ||
      params.stock ||
      params.recent ||
      params.from ||
      params.to
  )
}

/**
 * How many narrowing choices are set — the number on the "Filters" button.
 *
 * This is the honesty tax on putting the filters behind a drawer: a control
 * that hides state has to say how much state it is hiding, or it is worse than
 * the inline version it replaced.
 *
 * `q` is excluded deliberately, even though {@link hasActiveFilters} counts it:
 * the text box stays on the screen, so a badge for it would be reporting
 * something the reader is already looking at. `sort` and `group` are excluded
 * for the same reason {@link clearedFilters} keeps them — they change the order
 * and the shape of the results, never which books are in them.
 */
export function countActiveFilters(params: SearchScreenParams): number {
  return [
    params.categoryId,
    params.stock,
    params.recent,
    params.from,
    params.to,
  ].filter(Boolean).length
}

/** The params with every narrowing cleared, keeping the display-only choices. */
export function clearedFilters(params: SearchScreenParams): SearchScreenParams {
  return { sort: params.sort, group: params.group }
}
