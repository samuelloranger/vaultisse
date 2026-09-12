import { request } from './http'

/**
 * `/api/rest/loans` — read-only views over lending activity.
 *
 * See `docs/LOANS.md`. Two endpoints, two different tables, and the difference
 * is the whole point of the resource:
 *
 *  - **`GET /loans`** reads `book_stocks` and therefore knows only *now*: every
 *    copy whose `status = 2`. Once a copy comes back its borrower and loan date
 *    are wiped, so this list can never answer "who had this last March".
 *  - **`GET /loans/report`** reads `loan_history`, an append-only log that
 *    snapshots the book, customer and group names *as they were at loan time*.
 *    That is what makes a historical report survive a rename or a deletion.
 *
 * There are no mutations here. Returning a copy goes through
 * `POST /book/return` (`api/book.ts`) or the customer-scoped
 * `DELETE /customer/:id/book/:code` (`api/customer.ts`); `LoansRoute.ts` is
 * deliberately listing-only.
 */

/** One currently-outstanding loan, from `GET /loans`. */
export type Loan = {
  /** `book_stocks.id`. */
  stockId: number
  /** `book_stocks.code` — the code printed on the copy. This is what returns it. */
  stockCode: string
  /** ISO timestamp, or `null` for a copy marked on loan without a date. */
  loanedAt: string | null
  bookId: number
  bookName: string
  imageUrl: string | null
  customerId: number
  customerName: string
  groupId: number | null
  groupName: string | null
}

/**
 * What `GET /loans` accepts. Every field is optional; the server treats a
 * missing one as "no restriction".
 *
 * `dateFrom` / `dateTo` are `YYYY-MM-DD`. The server compares `dateTo` as
 * `< date + INTERVAL '1 day'`, so the end of the range is inclusive of the
 * whole day — a loan made at 23:00 on the `dateTo` date is in the result.
 */
export type LoanFilters = {
  groupId?: number | null
  dateFrom?: string | null
  dateTo?: string | null
  /** Zero-based. 50 rows per page, fixed server-side. */
  page?: number
}

/** The envelope `GET /loans` answers. `limit` is the server's page size. */
export type LoanPage = {
  total: number
  limit: number
  loans: Loan[]
}

/** One row of the history report, from `GET /loans/report`. */
export type LoanReportRow = {
  bookName: string
  stockCode: string
  customerName: string
  /** Snapshotted at loan time; `null` if the borrower had no group then. */
  groupName: string | null
  loanedAt: string
  /** `null` while the copy is still out. */
  returnedAt: string | null
}

/**
 * What `GET /loans/report` accepts.
 *
 * The dates are **required** — the server answers `400 "date_from and date_to
 * are required"` without them. That is deliberate on its side: the endpoint is
 * a bounded report, not a full-table dump. Typed as required here so the
 * mistake is a compile error rather than a 400.
 */
export type LoanReportFilters = {
  dateFrom: string
  dateTo: string
  groupId?: number | null
  customerId?: number | null
}

/** `GET /loans` — the copies that are out right now, newest loan first. */
export function getLoans(
  filters: LoanFilters = {},
  signal?: AbortSignal
): Promise<LoanPage> {
  return request<LoanPage>('/loans', {
    signal,
    params: {
      group_id: filters.groupId ?? undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      page: filters.page ?? undefined,
    },
  })
}

/**
 * `GET /loans/report` — every loan in a date range, returned ones included.
 *
 * Unwraps the `{ rows }` envelope: it carries nothing else, and an array is
 * what every caller wants.
 */
export async function getLoanReport(
  filters: LoanReportFilters,
  signal?: AbortSignal
): Promise<LoanReportRow[]> {
  const body = await request<{ rows: LoanReportRow[] }>('/loans/report', {
    signal,
    params: {
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      group_id: filters.groupId ?? undefined,
      customer_id: filters.customerId ?? undefined,
    },
  })
  return body.rows
}
