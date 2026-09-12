import { ApiError, isSessionDead, PATH_PREFIX, request } from './http'
import type { BookCounters, BookStockStatus } from './types'

/**
 * `/api/rest/book` — books, their stocks, their ebook files, and the lending
 * actions on them.
 *
 * Wire shapes for the detail screen are declared here rather than in
 * `api/types.ts` for the reason given at the top of `api/search.ts`: several
 * screens are landing at once and one shared transcription file is one merge
 * conflict per screen.
 */

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

/** An author on a book, as `GET /book/:id` returns them. */
export type BookAuthorRef = { id: number; name: string }

/**
 * One physical copy. `location_*` and `customer_*` are resolved server-side by
 * the detail query's joins, so the screen never needs a second round trip to
 * turn an id into a shelf name.
 */
export type BookStock = {
  id: number
  /** The scannable code printed on the copy. Not a book id. */
  code: string
  status: BookStockStatus
  location_id: number | null
  location_name: string | null
  customer_id: number | null
  customer_name: string | null
}

/** The three backup-file types a book may carry, one of each at most. */
export type BookFileType = 'epub' | 'pdf' | 'mobi'

/** One backed-up ebook file's metadata. The bytes are never in this payload. */
export type BookFile = {
  id: number
  file_type: BookFileType
  file_name: string
  file_size: number
  date_created: string
}

/** `GET /book/:id` — the full detail payload the book screen renders. */
export type BookDetail = {
  id: number
  name: string
  description: string | null
  image_url: string | null
  isbn: string | null
  category_id: number | null
  language_code: string | null
  publisher: string | null
  /** ISO timestamp, despite being a date. Postgres `date` through `pg`. */
  published_date: string | null
  date_created: string
  date_updated: string
  pages: number | null
  format_id: number | null
  files: BookFile[]
  stocks: BookStock[]
  authors: BookAuthorRef[]
}

/**
 * The body of `PUT /book/:id`.
 *
 * **Every metadata column is overwritten**, not merged — the server's UPDATE
 * sets all ten columns from the body unconditionally, so a field left out of
 * this object is written as `null`, not left alone. The edit form therefore
 * submits the whole record, including the fields it did not show.
 *
 * `authors` is the exception and is genuinely optional: the server only touches
 * `book_authors` when the key is an array, so omitting it leaves the book's
 * authors exactly as they were.
 */
export type BookUpdate = {
  name: string
  description: string | null
  image_url: string | null
  isbn: string | null
  category_id: number | null
  language_code: string | null
  publisher: string | null
  /** `YYYY-MM-DD`, or null. */
  published_date: string | null
  pages: number | null
  format_id: number | null
  /** Full desired author-id list. Omit to leave the existing list untouched. */
  authors?: number[]
}

/** The body of `POST /book/:id/stock` and `PUT /book/:id/stock/:stock_id`. */
export type StockInput = {
  status: BookStockStatus
  location_id: number
  customer_id: number | null
}

// ---------------------------------------------------------------------------
// Multipart
// ---------------------------------------------------------------------------

/**
 * `POST` a `FormData` body.
 *
 * `request()` in `api/http.ts` JSON-stringifies whatever it is given and pins
 * `Content-Type: application/json`, which cannot carry a file. Three endpoints
 * here are `multipart/form-data` (cover image, ebook file, manual create), so
 * this mirrors `request`'s two cross-cutting concerns — cookie transport and
 * session death — for a body it cannot serialise.
 *
 * The `Content-Type` header is deliberately absent: the browser has to set it
 * itself so it can append the multipart boundary.
 *
 * **This wants to move into `api/http.ts`** as a `body: FormData` passthrough.
 * It lives here because that file is owned elsewhere while these screens land.
 */
async function postFormData<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`${PATH_PREFIX}${path}`, {
    method: 'POST',
    credentials: 'include',
    redirect: 'manual',
    body: form,
    headers: { Accept: 'application/json' },
  })

  // No cookie at all: the server 302s to /login. See `request`'s note.
  if (response.type === 'opaqueredirect' || response.status === 0) {
    window.location.href = '/login'
    throw new ApiError(401, { sessionExpired: true }, 'Session expired')
  }

  const text = await response.text()
  let body: unknown = null
  if (text !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (response.ok) return body as T

  if (isSessionDead(response.status, body)) {
    window.location.href = '/login'
    throw new ApiError(response.status, body, 'Session expired')
  }

  const message =
    typeof body === 'string' && body !== ''
      ? body
      : typeof body === 'object' &&
          body !== null &&
          typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `Request failed with status ${response.status}`

  throw new ApiError(response.status, body, message)
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

/** `GET /book/counters` — total / recent / on-loan / no-stock totals. */
export function getBookCounters(signal?: AbortSignal): Promise<BookCounters> {
  return request<BookCounters>('/book/counters', { signal })
}

/** `GET /book/:id` — full detail: metadata, stocks, authors, ebook files. */
export function getBook(id: number, signal?: AbortSignal): Promise<BookDetail> {
  return request<BookDetail>(`/book/${id}`, { signal })
}

/** `PUT /book/:id` — overwrite a book's metadata. See {@link BookUpdate}. */
export function updateBook(id: number, input: BookUpdate): Promise<unknown> {
  return request(`/book/${id}`, { method: 'PUT', body: input })
}

/** `DELETE /book/:id` — permanent, and cascades to stocks and author links. */
export function deleteBook(id: number): Promise<unknown> {
  return request(`/book/${id}`, { method: 'DELETE' })
}

/**
 * `POST /book` — create a book by hand.
 *
 * @returns The new book's id.
 * @throws {ApiError} 404 if the ISBN is already in the shared library.
 */
export function createBook(input: {
  name: string
  description?: string
  isbn?: string
  image?: File | null
}): Promise<number> {
  const form = new FormData()
  form.set('name', input.name)
  if (input.description) form.set('description', input.description)
  if (input.isbn) form.set('isbn', input.isbn)
  if (input.image) form.set('image', input.image)
  return postFormData<number>('/book', form)
}

/**
 * `POST /book/isbn/:isbn` — create a book from an ISBN lookup.
 *
 * Find-or-create: re-scanning a barcode already in the library hands back the
 * existing book's id rather than failing or duplicating it.
 *
 * @param locationId Where to shelve the copy this creates. Null falls back to
 *   the server's "exactly one location" auto-assign rule.
 */
export function createBookFromIsbn(
  isbn: string,
  locationId: number | null
): Promise<number> {
  return request<number>(`/book/isbn/${encodeURIComponent(isbn)}`, {
    method: 'POST',
    body: { location: locationId },
  })
}

/** `POST /book/:id/image` — replace the cover. PNG/JPEG, 4MB server-side cap. */
export function uploadBookCover(id: number, image: File): Promise<number> {
  const form = new FormData()
  form.set('image', image)
  return postFormData<number>(`/book/${id}/image`, form)
}

// ---------------------------------------------------------------------------
// Ebook files
// ---------------------------------------------------------------------------

/**
 * `POST /book/:id/file` — upload one backup file. The type is inferred from the
 * extension server-side and replaces any existing file of that same type.
 */
export function uploadBookFile(id: number, file: File): Promise<BookFile> {
  const form = new FormData()
  form.set('file', file)
  return postFormData<BookFile>(`/book/${id}/file`, form)
}

/** `DELETE /book/:id/file/:fileId`. Resolves to whether a row was removed. */
export function deleteBookFile(id: number, fileId: number): Promise<boolean> {
  return request<boolean>(`/book/${id}/file/${fileId}`, { method: 'DELETE' })
}

/**
 * The URL of `GET /book/:id/file/:fileId/download`.
 *
 * A plain href rather than a fetch-and-blob: the endpoint answers
 * `Content-Disposition: attachment`, so the browser's own download machinery
 * handles it — with a progress indicator, a resumable transfer and no copy of a
 * possibly-10MB file held in JS memory.
 */
export function bookFileDownloadUrl(id: number, fileId: number): string {
  return `${PATH_PREFIX}/book/${id}/file/${fileId}/download`
}

// ---------------------------------------------------------------------------
// Stocks
// ---------------------------------------------------------------------------

/**
 * `POST /book/:id/stock` — add a physical copy.
 *
 * @throws {ApiError} 406 if `status` is `Booked`; lending is the loan flow's
 *   job, not something a copy can be created already in.
 */
export function addBookStock(id: number, input: StockInput): Promise<BookStock> {
  return request<BookStock>(`/book/${id}/stock`, { method: 'POST', body: input })
}

/** `PUT /book/:id/stock/:stock_id` — move, lend, return or re-status a copy. */
export function updateBookStock(
  id: number,
  stockId: number,
  input: StockInput
): Promise<BookStock> {
  return request<BookStock>(`/book/${id}/stock/${stockId}`, {
    method: 'PUT',
    body: input,
  })
}

/** `DELETE /book/:id/stock/:stock_id` — discard a copy. No history row. */
export function deleteBookStock(id: number, stockId: number): Promise<boolean> {
  return request<boolean>(`/book/${id}/stock/${stockId}`, { method: 'DELETE' })
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
