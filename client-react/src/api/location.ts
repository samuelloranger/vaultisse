import { request } from './http'

/**
 * `/api/rest/location` — physical storage: shelves, rooms, boxes.
 *
 * See `docs/LOCATIONS.md`. Every `book_stocks` row points at exactly one
 * location, so a location never "holds" books directly — the list of books at a
 * location is the other side of that foreign key, fetched separately.
 */

/**
 * A row from `GET /location`.
 *
 * `total_books` is `SELECT COUNT(*) FROM book_stocks WHERE location_id = ...`,
 * computed per request rather than stored. **It arrives as a string**: Postgres
 * `COUNT(*)` is a `bigint`, and node-postgres hands bigints back as strings
 * because they do not all fit in a JS number. Typed honestly here and coerced
 * once at the edge (see {@link locationBookCount}) rather than being quietly
 * concatenated somewhere downstream.
 */
export type LocationRow = {
  id: number
  name: string
  description: string | null
  total_books: string | number
}

/** One physical copy shelved at a location — a `book_stocks` row plus its book. */
export type LocationBook = {
  /** `book_stocks.id`. */
  id: number
  /** `books.id` — what a link to the book detail screen needs. */
  book_id: number
  name: string
  /** `book_stocks.code`: the code printed on the copy. */
  code: string
  /** `book_stocks.status` — see `BookStockStatus` in `api/types.ts`. */
  status: number
  image_url: string | null
}

/** The wire value as a number. See the note on {@link LocationRow.total_books}. */
export function locationBookCount(location: LocationRow): number {
  const count = Number(location.total_books)
  return Number.isFinite(count) ? count : 0
}

/** Fields a create or update accepts. The server updates both columns at once. */
export type LocationInput = {
  name: string
  description: string
}

/** `GET /location` — every location, each with its live `total_books` count. */
export function getLocations(signal?: AbortSignal): Promise<LocationRow[]> {
  return request<LocationRow[]>('/location', { signal })
}

/** `GET /location/:id/books` — the copies currently shelved there. */
export function getLocationBooks(
  id: number,
  signal?: AbortSignal
): Promise<LocationBook[]> {
  return request<LocationBook[]>(`/location/${id}/books`, { signal })
}

/** `POST /location` — create. Answers the new row, counts included. */
export function createLocation(input: LocationInput): Promise<LocationRow> {
  return request<LocationRow>('/location', { method: 'POST', body: input })
}

/** `PUT /location/:id` — rename / re-describe. */
export function updateLocation(id: number, input: LocationInput): Promise<LocationRow> {
  return request<LocationRow>(`/location/${id}`, { method: 'PUT', body: input })
}

/** `DELETE /location/:id`. Answers `{ message }`; 404 if it is already gone. */
export function deleteLocation(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/location/${id}`, { method: 'DELETE' })
}

/**
 * `POST /location/:id/add/books` — move a batch of copies onto this shelf by
 * stock code.
 *
 * Only `location_id` is touched: a copy that is out on loan keeps its status
 * and its borrower, so reorganising the shelves never accidentally returns a
 * book. Answers the location's full book list afterwards.
 */
export function addBooksToLocation(
  id: number,
  codes: string[]
): Promise<LocationBook[]> {
  return request<LocationBook[]>(`/location/${id}/add/books`, {
    method: 'POST',
    body: { books: codes },
  })
}
