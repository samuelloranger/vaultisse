import { request } from './http'

export type MetadataField =
  | 'name'
  | 'description'
  | 'image_url'
  | 'category'
  | 'publisher'
  | 'published_date'
  | 'pages'
  | 'language'
  | 'authors'
export type MetadataSource = 'google-books' | 'bnf' | 'open-library'
export type MetadataRefreshResult = {
  bookId: number
  isbn: string
  mode: 'fill' | 'overwrite'
  changed: {
    field: MetadataField
    from: string | number | null
    to: string | number
    source: MetadataSource | null
  }[]
  stillMissing: MetadataField[]
  sourcesTried: MetadataSource[]
  unconfiguredSources: MetadataSource[]
  failedSources: MetadataSource[]
}
export type BulkMetadataResult = {
  mode: 'fill' | 'overwrite'
  results: {
    bookId: number
    name: string | null
    status: 'ok' | 'not_found' | 'no_isbn' | 'no_metadata' | 'isbn_changed' | 'error'
    changed: MetadataField[]
    stillMissing: MetadataField[]
  }[]
}

/** The UI offers fill mode only; overwriting bibliographic text is not implicit. */
export function refreshBookMetadata(id: number): Promise<MetadataRefreshResult> {
  return request(`/book/${id}/refresh`, { method: 'POST', body: { overwrite: false } })
}

export function refreshBooksMetadata(ids: number[]): Promise<BulkMetadataResult> {
  return request('/book/refresh', { method: 'POST', body: { ids, overwrite: false } })
}
