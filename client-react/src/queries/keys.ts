/**
 * Every cache key in the client, declared once.
 *
 * ## Why this file exists
 *
 * The shared-library change made cross-resource invalidation routine: adding a
 * book moves the dashboard's counts, the book counters, *and* the author and
 * category lists. A mutation can only invalidate what it can name, and inlining
 * `['dashboard']` at a call site means the next person writes `['dashboards']`
 * and the invalidation silently does nothing. So: one factory per resource,
 * exported from here, imported everywhere. **Never inline a key array.**
 *
 * ## Shape
 *
 * Each factory follows the same hierarchy so that invalidating a parent
 * invalidates its children (TanStack Query matches keys by prefix):
 *
 * ```ts
 * bookKeys.all          // ['book']            → everything book-ish
 * bookKeys.counters()   // ['book', 'counters']
 * bookKeys.detail(12)   // ['book', 'detail', 12]
 * ```
 *
 * A mutation that touches books therefore invalidates `bookKeys.all` and gets
 * every book query, present and future, without listing them.
 */

export const policyKeys = {
  all: ['policy'] as const,
  /** `GET /app/policy`. There is only ever one. */
  current: () => [...policyKeys.all] as const,
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  /** `GET /dashboard`. Single aggregate, no parameters. */
  summary: () => [...dashboardKeys.all, 'summary'] as const,
}

export const bookKeys = {
  all: ['book'] as const,
  /** `GET /book/counters`. */
  counters: () => [...bookKeys.all, 'counters'] as const,
  /** `GET /book/:id`. */
  detail: (id: number) => [...bookKeys.all, 'detail', id] as const,
}

export const loanKeys = {
  all: ['loans'] as const,
  list: (filters: Record<string, unknown> = {}) =>
    [...loanKeys.all, 'list', filters] as const,
}
