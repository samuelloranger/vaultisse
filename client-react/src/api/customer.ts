import { request } from './http'

/**
 * `/api/rest/customer` — borrowers, the groups they are organised into, and
 * the lend/return actions scoped to one of them.
 *
 * See `docs/CUSTOMERS.md`. Two things about this resource are worth stating
 * before the types, because both have bitten this codebase:
 *
 *  1. **"Has a book on loan" is not a column.** It is derived from
 *     `book_stocks`: a copy is out to a customer exactly when its `status = 2`
 *     and its `customer_id` points at them. So "what does this borrower have"
 *     is a separate endpoint, not a field on the row.
 *  2. **Deleting a group does not delete its members.** The foreign key is
 *     `ON DELETE SET NULL`, so the customers simply go back to having no group.
 *     The confirmation copy says so.
 */

/**
 * A row from `GET /customer`.
 *
 * `total_books` is `SELECT count(*) FROM book_stocks WHERE customer_id = ...`,
 * computed per request. **It arrives as a string** — Postgres `count(*)` is a
 * `bigint` and node-postgres hands bigints back as strings, because they do not
 * all fit in a JS number. Typed honestly and coerced once at the edge (see
 * {@link customerBookCount}), exactly as `LocationRow.total_books` is.
 */
export type CustomerRow = {
  id: number
  name: string
  group_id: number | null
  group_name: string | null
  total_books: string | number
}

/**
 * A row from `GET /customer/group`.
 *
 * `total_customers` is `COUNT(c.id)::int` — cast server-side, so unlike
 * `total_books` above this one really is a number on the wire.
 */
export type CustomerGroupRow = {
  id: number
  name: string
  description: string | null
  total_customers: number
}

/** One copy currently out to a borrower, from `GET /customer/:id/books`. */
export type CustomerBook = {
  /** `books.id` — what a link to the book detail screen needs. */
  id: number
  name: string
  image_url: string | null
  isbn: string | null
  /** `book_stocks.code`: the code printed on the copy. This is what returns it. */
  code: string
}

/** The wire value as a number. See the note on {@link CustomerRow.total_books}. */
export function customerBookCount(customer: CustomerRow): number {
  const count = Number(customer.total_books)
  return Number.isFinite(count) ? count : 0
}

/** Fields a customer create or update accepts. A borrower is just a name. */
export type CustomerInput = {
  name: string
}

/** Fields a group create or update accepts. */
export type CustomerGroupInput = {
  name: string
  description: string
}

/**
 * `GET /customer` — every borrower, with their group and their live loan count.
 *
 * The endpoint answers `{ customers: [...] }`; this unwraps it, so the query
 * layer and every component below it deal in a plain array. The envelope
 * carries nothing else.
 */
export async function getCustomers(signal?: AbortSignal): Promise<CustomerRow[]> {
  const body = await request<{ customers: CustomerRow[] }>('/customer', { signal })
  return body.customers
}

/** `GET /customer/:id/books` — the copies this borrower currently holds. */
export function getCustomerBooks(
  id: number,
  signal?: AbortSignal
): Promise<CustomerBook[]> {
  return request<CustomerBook[]>(`/customer/${id}/books`, { signal })
}

/** `POST /customer` — create a borrower. */
export function createCustomer(input: CustomerInput): Promise<CustomerRow> {
  return request<CustomerRow>('/customer', { method: 'POST', body: input })
}

/** `PUT /customer/:id` — rename a borrower. */
export function updateCustomer(id: number, input: CustomerInput): Promise<CustomerRow> {
  return request<CustomerRow>(`/customer/${id}`, { method: 'PUT', body: input })
}

/** `DELETE /customer/:id`. Answers `{ message }`; 404 if it is already gone. */
export function deleteCustomer(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/customer/${id}`, { method: 'DELETE' })
}

/**
 * `POST /customer/:id/add/books` — lend a batch of copies out, by stock code.
 *
 * Each code's `book_stocks` row gets `status = 2`, `customer_id = <id>` and
 * `loaned_at = NOW()`, plus a `loan_history` row. Answers the borrower's full
 * list afterwards.
 */
export function lendBooksToCustomer(
  id: number,
  codes: string[]
): Promise<CustomerBook[]> {
  return request<CustomerBook[]>(`/customer/${id}/add/books`, {
    method: 'POST',
    body: { books: codes },
  })
}

/**
 * `DELETE /customer/:id/book/:code` — take one copy back from this borrower.
 *
 * Scoped to the customer (`WHERE code = $3 AND customer_id = $4`), unlike the
 * unscoped `POST /book/return` the loans screen uses. Answers `200` with an
 * empty body, which {@link request} reads as `null`.
 */
export function returnCustomerBook(id: number, code: string): Promise<null> {
  return request<null>(`/customer/${id}/book/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  })
}

/** `GET /customer/group` — every group, each with its member count. */
export function getCustomerGroups(signal?: AbortSignal): Promise<CustomerGroupRow[]> {
  return request<CustomerGroupRow[]>('/customer/group', { signal })
}

/** `POST /customer/group` — create. 409 if the name is taken. */
export function createCustomerGroup(
  input: CustomerGroupInput
): Promise<CustomerGroupRow> {
  return request<CustomerGroupRow>('/customer/group', { method: 'POST', body: input })
}

/** `PUT /customer/group/:id` — rename / re-describe. 409 if the name is taken. */
export function updateCustomerGroup(
  id: number,
  input: CustomerGroupInput
): Promise<CustomerGroupRow> {
  return request<CustomerGroupRow>(`/customer/group/${id}`, {
    method: 'PUT',
    body: input,
  })
}

/**
 * `DELETE /customer/group/:id`.
 *
 * The members survive: `customers.group_id` is `ON DELETE SET NULL`, so they
 * just stop having a group.
 */
export function deleteCustomerGroup(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/customer/group/${id}`, { method: 'DELETE' })
}

/**
 * Put a customer in a group, or take them out of one.
 *
 * Two endpoints behind one function because they are one user intent — "this
 * borrower's group is now X" — and X is allowed to be nothing. Keeping them
 * apart at this layer would push a branch into every caller.
 *
 * `PUT /customer/:id/group/:groupId` assigns; `DELETE /customer/:id/group`
 * unassigns (sets `group_id` to `NULL`).
 */
export function setCustomerGroup(
  id: number,
  groupId: number | null
): Promise<{ id: number; name: string; group_id: number | null }> {
  if (groupId === null) {
    return request(`/customer/${id}/group`, { method: 'DELETE' })
  }
  return request(`/customer/${id}/group/${groupId}`, { method: 'PUT' })
}
