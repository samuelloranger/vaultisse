import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  getLoanReport,
  getLoans,
  type LoanFilters,
  type LoanReportFilters,
} from '@/api/loans'
import { loanKeys } from './keys'

/**
 * The loans list and the history report.
 *
 * ## There are no mutations in this file, on purpose
 *
 * Returning a copy is `POST /book/return`, and the hook for it already exists
 * as `useReturnBooks` in `queries/book.ts` with the invalidation it needs
 * (books, search, dashboard, loans, locations, customers). The loans screen
 * imports that rather than declaring a second mutation over the same endpoint:
 * two hooks calling one endpoint is two invalidation lists to keep in step, and
 * the one that drifts is the one nobody is looking at.
 *
 * `LoansRoute.ts` is listing-only for the same reason on the server side.
 */

/**
 * One page of the currently-outstanding loans.
 *
 * The filters are part of the cache key, so each filter combination caches
 * separately and stepping back to a previous page is instant. `staleTime` is
 * short because this list is the thing that changes when *anybody* in the
 * shared library hands a book back.
 */
export function loansQueryOptions(filters: LoanFilters = {}) {
  return queryOptions({
    queryKey: loanKeys.list(filters as Record<string, unknown>),
    queryFn: ({ signal }) => getLoans(filters, signal),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    // Paging without a blank frame: the previous page stays on screen while the
    // next one loads, which matters most on a phone where the list *is* the
    // page and a spinner means the whole screen goes away.
    placeholderData: (previous) => previous,
  })
}

/** One page of the currently-outstanding loans. */
export function useLoans(filters: LoanFilters = {}) {
  return useQuery(loansQueryOptions(filters))
}

/**
 * The history report for a date range.
 *
 * ## Why a query rather than a "generate" mutation
 *
 * It is a `GET`, it is idempotent, and running the same report twice should not
 * hit the server twice. Modelling it as a mutation would give up caching and
 * `AbortSignal` to buy nothing — the dialog's Generate button sets the filters
 * and `enabled` does the rest.
 *
 * ## The key
 *
 * `loanKeys` (in `queries/keys.ts`, which this screen does not own) declares
 * `all` and `list(filters)` but no report key, so the report lives under
 * `list` with a `scope` discriminator. That is not just a workaround: it keeps
 * the report under the `loanKeys.all` prefix, so returning a copy invalidates
 * an open report along with the list — which is correct, because the report
 * includes still-open loans and one of them just closed. A dedicated
 * `loanKeys.report(filters)` would read better; see this task's report.
 *
 * @param filters `null` until the user has picked a range and pressed Generate.
 *   The endpoint answers `400` without both dates, so the query stays disabled.
 */
export function loanReportQueryOptions(filters: LoanReportFilters | null) {
  return queryOptions({
    queryKey: loanKeys.list({ scope: 'report', ...(filters ?? {}) }),
    queryFn: ({ signal }) => {
      // Unreachable while `enabled` is false; narrowing rather than asserting.
      if (!filters) throw new Error('A loan report needs a date range.')
      return getLoanReport(filters, signal)
    },
    enabled: filters !== null,
    // A report over a closed date range does not change while the dialog is
    // open, and re-running it on every window focus would be a surprise.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

/** The history report for a date range. Disabled until `filters` is set. */
export function useLoanReport(filters: LoanReportFilters | null) {
  return useQuery(loanReportQueryOptions(filters))
}
