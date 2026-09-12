import { request } from './http'

/**
 * `/api/rest/category` — the shared library's genres / shelving sections.
 *
 * See `docs/CATALOG.md`. Names are unique instance-wide, so two members each
 * adding "Fantasy" land on the same row; a `409`-shaped duplicate comes back as
 * a 500 from the server today, and surfaces as the mutation's error.
 *
 * Deleting a category does not cascade: `books.category_id` is nullable, so the
 * books it held become uncategorised rather than disappearing.
 */

/** A row from `GET /category`. The table really is just this. */
export type CategoryRow = {
  id: number
  name: string
}

/** Fields a create or update accepts. */
export type CategoryInput = {
  name: string
}

/** `GET /category` — every category in the shared library. */
export function getCategories(signal?: AbortSignal): Promise<CategoryRow[]> {
  return request<CategoryRow[]>('/category', { signal })
}

/** `POST /category` — create. */
export function createCategory(input: CategoryInput): Promise<CategoryRow> {
  return request<CategoryRow>('/category', { method: 'POST', body: input })
}

/** `PUT /category/:id` — rename. */
export function updateCategory(id: number, input: CategoryInput): Promise<CategoryRow> {
  return request<CategoryRow>(`/category/${id}`, { method: 'PUT', body: input })
}

/** `DELETE /category/:id`. Books keep existing, uncategorised. */
export function deleteCategory(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/category/${id}`, { method: 'DELETE' })
}
