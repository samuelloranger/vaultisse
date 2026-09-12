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

/**
 * The remaining resources, declared up front rather than as each screen is
 * built. Cross-resource invalidation is the norm in a shared library - adding
 * a book touches authors, categories and locations - so a screen needs to name
 * keys it does not own yet. Declaring them here keeps that possible without
 * every screen editing this file.
 */

export const searchKeys = {
  all: ['search'] as const,
  /** `GET /book/search`. Filters are part of the key so each result set caches separately. */
  results: (filters: Record<string, unknown> = {}) =>
    [...searchKeys.all, 'results', filters] as const,
}

export const authorKeys = {
  all: ['author'] as const,
  list: () => [...authorKeys.all, 'list'] as const,
  detail: (id: number) => [...authorKeys.all, 'detail', id] as const,
}

export const categoryKeys = {
  all: ['category'] as const,
  list: () => [...categoryKeys.all, 'list'] as const,
  detail: (id: number) => [...categoryKeys.all, 'detail', id] as const,
}

export const locationKeys = {
  all: ['location'] as const,
  list: () => [...locationKeys.all, 'list'] as const,
  detail: (id: number) => [...locationKeys.all, 'detail', id] as const,
  /** Books shelved at one location. */
  books: (id: number) => [...locationKeys.all, 'detail', id, 'books'] as const,
}

export const customerKeys = {
  all: ['customer'] as const,
  list: () => [...customerKeys.all, 'list'] as const,
  detail: (id: number) => [...customerKeys.all, 'detail', id] as const,
  /** Books currently lent to one borrower. */
  books: (id: number) => [...customerKeys.all, 'detail', id, 'books'] as const,
  groups: () => [...customerKeys.all, 'groups'] as const,
}

export const adminKeys = {
  all: ['admin'] as const,
  /** `GET /admin/users`. Admin-only; 403 for everyone else. */
  users: () => [...adminKeys.all, 'users'] as const,
  /** `GET /admin/settings` — the single `app_settings` row. Admin-only. */
  settings: () => [...adminKeys.all, 'settings'] as const,
}

export const userKeys = {
  all: ['user'] as const,
  /** `GET /user/sessions` - this device plus every other active login. */
  sessions: () => [...userKeys.all, 'sessions'] as const,
  /** `GET /user/activity` - auth events only, newest first. */
  activity: () => [...userKeys.all, 'activity'] as const,
}
