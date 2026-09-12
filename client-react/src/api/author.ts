import { request } from './http'

/**
 * `/api/rest/author` — the shared library's authors.
 *
 * See `docs/CATALOG.md`. Same CRUD shape as categories. The book-to-author
 * relationship is many-to-many through `book_authors` and is resolved by
 * `PUT /book/:id`; nothing here touches it, so deleting an author removes the
 * author row and its associations, not the books.
 *
 * `POST /author/search` exists for the book editor's author picker. It is not
 * used by the authors screen — that screen lists everything — so it is not
 * wrapped here yet.
 */

/** A row from `GET /author`. */
export type AuthorRow = {
  id: number
  name: string
}

/** Fields a create or update accepts. */
export type AuthorInput = {
  name: string
}

/** `GET /author` — every author in the shared library. */
export function getAuthors(signal?: AbortSignal): Promise<AuthorRow[]> {
  return request<AuthorRow[]>('/author', { signal })
}

/** `POST /author` — create. */
export function createAuthor(input: AuthorInput): Promise<AuthorRow> {
  return request<AuthorRow>('/author', { method: 'POST', body: input })
}

/** `PUT /author/:id` — rename. */
export function updateAuthor(id: number, input: AuthorInput): Promise<AuthorRow> {
  return request<AuthorRow>(`/author/${id}`, { method: 'PUT', body: input })
}

/** `DELETE /author/:id`. The books they wrote are untouched. */
export function deleteAuthor(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/author/${id}`, { method: 'DELETE' })
}
