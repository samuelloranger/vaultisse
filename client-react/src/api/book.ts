import { request } from './http'
import type { BookCounters } from './types'

/**
 * `/api/rest/book` — books, their stocks, and the lending actions on them.
 *
 * Only what the dashboard needs is here so far. Search, detail and stock
 * editing land with their own screens.
 */

/** `GET /book/counters` — total / recent / on-loan / no-stock totals. */
export function getBookCounters(signal?: AbortSignal): Promise<BookCounters> {
  return request<BookCounters>('/book/counters', { signal })
}

/**
 * `POST /book/return` — bulk-return one or more stocks: clears the assigned
 * customer, resets status to available, and records the return in the loan
 * history.
 *
 * @param codes `book_stocks.code` values — the printed/scanned code on the
 *   physical copy, not a book id.
 */
export function returnBooks(codes: string[]): Promise<null> {
  return request<null>('/book/return', {
    method: 'POST',
    body: { books: codes },
  })
}
