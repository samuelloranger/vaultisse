import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookDetail } from '@/api/book'
import { ApiError } from '@/api/http'
import type { SearchBook, SearchResponse } from '@/api/search'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { Decode } from './useBarcodeScanner'
import { useScanQueue } from './useScanQueue'

/**
 * The add pipeline, tested where the camera is not.
 *
 * A decode is just a `{ value, format }` handed to `submit`, so everything from
 * the debounce down runs for real in jsdom with no video, no stream and no
 * `BarcodeDetector`. The `api/` modules are mocked rather than the query hooks,
 * per the convention the screen tests set — which keeps `useCreateBookFromIsbn`
 * and its invalidation inside the test rather than stubbed out of it.
 *
 * The cases here are the ones that are invisible by eye and expensive to get
 * wrong: every one of them is about **whether a row was written**.
 */

vi.mock('@/api/search', () => ({ searchBooks: vi.fn() }))
vi.mock('@/api/book', () => ({
  addBookStock: vi.fn(),
  createBook: vi.fn(),
  createBookFromIsbn: vi.fn(),
  deleteBook: vi.fn(),
  deleteBookFile: vi.fn(),
  deleteBookStock: vi.fn(),
  getBook: vi.fn(),
  getBookCounters: vi.fn(),
  returnBooks: vi.fn(),
  updateBook: vi.fn(),
  updateBookStock: vi.fn(),
  uploadBookCover: vi.fn(),
  uploadBookFile: vi.fn(),
}))

import { createBookFromIsbn, deleteBook, deleteBookStock, getBook } from '@/api/book'
import { searchBooks } from '@/api/search'

const searchBooksMock = vi.mocked(searchBooks)
const createFromIsbnMock = vi.mocked(createBookFromIsbn)
const getBookMock = vi.mocked(getBook)
const deleteBookMock = vi.mocked(deleteBook)
const deleteBookStockMock = vi.mocked(deleteBookStock)

/** A real ISBN-13: the checksum has to pass or nothing downstream runs. */
const NEW_ISBN = '9780261102217'
const KNOWN_ISBN = '9780441478125'
const OTHER_ISBN = '9780061054884'
/** Same digits as {@link NEW_ISBN} with the check digit wrong. */
const BAD_CHECKSUM = '9780261102218'

function scan(value: string, format: Decode['format'] = 'ean_13'): Decode {
  return { value, format }
}

function makeSearchBook(overrides: Partial<SearchBook> = {}): SearchBook {
  return {
    id: 7,
    name: 'The Left Hand of Darkness',
    image_url: 'https://example.test/cover.jpg',
    isbn: KNOWN_ISBN,
    category_id: 1,
    language_code: 'en',
    authors: [{ id: 1, name: 'Ursula K. Le Guin' }],
    ...overrides,
  }
}

function emptyResults(): SearchResponse {
  return { total: 0, limit: 50, books: [] }
}

function results(books: SearchBook[], total = books.length): SearchResponse {
  return { total, limit: 50, books }
}

function makeDetail(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    id: 7,
    name: 'The Left Hand of Darkness',
    description: null,
    image_url: 'https://example.test/cover.jpg',
    isbn: KNOWN_ISBN,
    category_id: 1,
    language_code: 'en',
    publisher: null,
    published_date: null,
    date_created: new Date().toISOString(),
    date_updated: new Date().toISOString(),
    pages: null,
    format_id: null,
    files: [],
    stocks: [
      {
        id: 11,
        code: 'abc123',
        status: 0,
        location_id: 1,
        location_name: 'Salon',
        customer_id: null,
        customer_name: null,
      },
    ],
    authors: [],
    ...overrides,
  }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

function renderQueue(locationId: number | null = 1) {
  return renderHook(() => useScanQueue({ locationId }), { wrapper })
}

beforeEach(() => {
  searchBooksMock.mockResolvedValue(emptyResults())
  createFromIsbnMock.mockResolvedValue(7)
  getBookMock.mockResolvedValue(makeDetail())
  deleteBookMock.mockResolvedValue(null)
  deleteBookStockMock.mockResolvedValue(true)
})

describe('useScanQueue', () => {
  it('adds a code the library does not have, without asking anything', async () => {
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))

    await waitFor(() => expect(result.current.addedCount).toBe(1))
    expect(result.current.duplicate).toBeNull()
    expect(createFromIsbnMock).toHaveBeenCalledWith(NEW_ISBN, 1)
    expect(result.current.entries[0]).toMatchObject({
      isbn: NEW_ISBN,
      status: 'added',
    })
  })

  it('raises the confirmation for a code already in the library and writes nothing until it is answered', async () => {
    searchBooksMock.mockResolvedValue(results([makeSearchBook()]))
    const { result } = renderQueue()

    act(() => result.current.submit(scan(KNOWN_ISBN)))

    await waitFor(() => expect(result.current.duplicate).not.toBeNull())
    // The whole point of the pre-add check: the question is asked *before* the
    // endpoint that would have silently written a second copy.
    expect(createFromIsbnMock).not.toHaveBeenCalled()
    expect(result.current.duplicate).toMatchObject({
      isbn: KNOWN_ISBN,
      bookId: 7,
      copies: 1,
      shelves: ['Salon'],
    })
  })

  it('writes nothing at all when the confirmation is skipped', async () => {
    searchBooksMock.mockResolvedValue(results([makeSearchBook()]))
    const { result } = renderQueue()

    act(() => result.current.submit(scan(KNOWN_ISBN)))
    await waitFor(() => expect(result.current.duplicate).not.toBeNull())

    act(() => result.current.skipDuplicate())

    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(createFromIsbnMock).not.toHaveBeenCalled()
    expect(result.current.entries[0]).toMatchObject({ status: 'skipped', undo: null })
    expect(result.current.addedCount).toBe(0)
  })

  it('writes exactly one copy when the confirmation is accepted', async () => {
    searchBooksMock.mockResolvedValue(results([makeSearchBook()]))
    getBookMock.mockResolvedValue(
      makeDetail({
        stocks: [
          ...makeDetail().stocks,
          {
            id: 12,
            code: 'def456',
            status: 0,
            location_id: 1,
            location_name: 'Salon',
            customer_id: null,
            customer_name: null,
          },
        ],
      })
    )
    const { result } = renderQueue()

    act(() => result.current.submit(scan(KNOWN_ISBN)))
    await waitFor(() => expect(result.current.duplicate).not.toBeNull())

    act(() => result.current.confirmDuplicate())

    await waitFor(() => expect(result.current.addedCount).toBe(1))
    expect(createFromIsbnMock).toHaveBeenCalledTimes(1)
    expect(result.current.entries[0]).toMatchObject({
      status: 'added',
      copies: 2,
      // Never the book: this ISBN was already in the library before the scan.
      undo: { kind: 'stock', bookId: 7, stockId: 12 },
    })
  })

  it('asks once when the same code is seen twice inside the cooldown', async () => {
    searchBooksMock.mockResolvedValue(results([makeSearchBook()]))
    const { result } = renderQueue()

    act(() => result.current.submit(scan(KNOWN_ISBN)))
    await waitFor(() => expect(result.current.duplicate).not.toBeNull())

    // The book stays in frame while the question is up; the camera would
    // otherwise stack a second copy of it behind the first.
    act(() => result.current.submit(scan(KNOWN_ISBN)))
    act(() => result.current.skipDuplicate())

    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    // Putting the book down slowly must not re-raise what was just answered.
    act(() => result.current.submit(scan(KNOWN_ISBN)))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(result.current.duplicate).toBeNull()
    expect(result.current.entries).toHaveLength(1)
    expect(searchBooksMock).toHaveBeenCalledTimes(1)
  })

  it('does not treat a substring match as this book', async () => {
    // What `ILIKE '%…%'` hands back: a different ISBN that *contains* the code.
    searchBooksMock.mockResolvedValue(
      results([makeSearchBook({ id: 9, isbn: `1${NEW_ISBN}` })])
    )
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))

    await waitFor(() => expect(result.current.addedCount).toBe(1))
    expect(result.current.duplicate).toBeNull()
    expect(createFromIsbnMock).toHaveBeenCalledWith(NEW_ISBN, 1)
  })

  it('ignores a decode that fails the ISBN checksum', async () => {
    const { result } = renderQueue()

    act(() => result.current.submit(scan(BAD_CHECKSUM)))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(searchBooksMock).not.toHaveBeenCalled()
    expect(createFromIsbnMock).not.toHaveBeenCalled()
    expect(result.current.entries).toHaveLength(0)
  })

  it('reports a non-book barcode without stopping', async () => {
    const { result } = renderQueue()

    act(() => result.current.submit(scan('96385074', 'ean_8')))

    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(result.current.entries[0].status).toBe('notABook')
    expect(createFromIsbnMock).not.toHaveBeenCalled()
  })

  it('keeps draining after a 404', async () => {
    createFromIsbnMock.mockImplementation(async (isbn: string) => {
      if (isbn === NEW_ISBN) throw new ApiError(404, 'Book not found')
      return 8
    })
    const { result } = renderQueue()

    act(() => {
      result.current.submit(scan(NEW_ISBN))
      result.current.submit(scan(OTHER_ISBN))
    })

    await waitFor(() => expect(result.current.entries).toHaveLength(2), {
      timeout: 4000,
    })
    expect(result.current.entries[0]).toMatchObject({
      isbn: NEW_ISBN,
      status: 'notFound',
    })
    expect(result.current.entries[1]).toMatchObject({
      isbn: OTHER_ISBN,
      status: 'added',
    })
  })

  it('reports an unconfigured metadata source instead of calling it no metadata', async () => {
    createFromIsbnMock.mockRejectedValue(
      new ApiError(404, {
        error: 'source_not_configured',
        sourcesTried: [],
        unconfiguredSources: ['google-books'],
        failedSources: [],
      })
    )
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))

    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(result.current.entries[0]).toMatchObject({
      status: 'notFound',
      message:
        'Metadata source unavailable: google-books is not configured on this server. Ask an administrator to configure it, or add the book manually.',
    })
  })

  it('reports a catalogue data gap after the ISBN was checked', async () => {
    createFromIsbnMock.mockRejectedValue(
      new ApiError(404, {
        error: 'no_metadata',
        sourcesTried: ['google-books', 'bnf'],
        unconfiguredSources: [],
        failedSources: [],
      })
    )
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))

    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(result.current.entries[0]).toMatchObject({
      status: 'notFound',
      message:
        'This ISBN was checked, but no catalogue returned metadata. Add it manually instead.',
    })
  })

  it('asks rather than assuming when the library check itself fails', async () => {
    searchBooksMock.mockRejectedValue(new ApiError(500, 'nope'))
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))

    await waitFor(() => expect(result.current.duplicate).not.toBeNull())
    // "Unknown", not "not present" — and the count is left unstated rather
    // than guessed at.
    expect(result.current.duplicate).toMatchObject({ copies: null, bookId: null })
    expect(createFromIsbnMock).not.toHaveBeenCalled()
  })

  it('undoes a book it created by deleting the book', async () => {
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))
    await waitFor(() => expect(result.current.addedCount).toBe(1))
    expect(result.current.entries[0].undo).toEqual({ kind: 'book', bookId: 7 })

    act(() => result.current.undo(result.current.entries[0].id))

    await waitFor(() => expect(result.current.entries[0].status).toBe('undone'))
    expect(deleteBookMock).toHaveBeenCalledWith(7)
    expect(deleteBookStockMock).not.toHaveBeenCalled()
  })

  it('undoes an added copy by deleting only the copy', async () => {
    searchBooksMock.mockResolvedValue(results([makeSearchBook()]))
    getBookMock.mockResolvedValue(
      makeDetail({
        stocks: [
          ...makeDetail().stocks,
          {
            id: 12,
            code: 'def456',
            status: 0,
            location_id: 1,
            location_name: 'Salon',
            customer_id: null,
            customer_name: null,
          },
        ],
      })
    )
    const { result } = renderQueue()

    act(() => result.current.submit(scan(KNOWN_ISBN)))
    await waitFor(() => expect(result.current.duplicate).not.toBeNull())
    act(() => result.current.confirmDuplicate())
    await waitFor(() => expect(result.current.addedCount).toBe(1))

    act(() => result.current.undo(result.current.entries[0].id))

    await waitFor(() => expect(result.current.entries[0].status).toBe('undone'))
    expect(deleteBookStockMock).toHaveBeenCalledWith(7, 12)
    expect(deleteBookMock).not.toHaveBeenCalled()
  })

  it('does not re-add a book that was just undone while it is still in frame', async () => {
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))
    await waitFor(() => expect(result.current.addedCount).toBe(1))

    act(() => result.current.undo(result.current.entries[0].id))
    await waitFor(() => expect(result.current.entries[0].status).toBe('undone'))

    // The camera is still pointed at it — Undo is tapped with the book in
    // frame — so the cooldown has to keep holding it off.
    act(() => result.current.submit(scan(NEW_ISBN)))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(createFromIsbnMock).toHaveBeenCalledTimes(1)
    expect(result.current.entries).toHaveLength(1)
  })

  it('never deletes a book when the library check could not prove it was absent', async () => {
    // A truncated result set with no exact match in it: a match could exist and
    // not have been seen, so the write is undoable only as a copy.
    searchBooksMock.mockResolvedValue(
      results([makeSearchBook({ id: 9, isbn: `1${NEW_ISBN}` })], 120)
    )
    const { result } = renderQueue()

    act(() => result.current.submit(scan(NEW_ISBN)))

    await waitFor(() => expect(result.current.duplicate).not.toBeNull())
    act(() => result.current.confirmDuplicate())

    await waitFor(() => expect(result.current.addedCount).toBe(1))
    expect(result.current.entries[0].undo).toEqual({
      kind: 'stock',
      bookId: 7,
      stockId: 11,
    })
  })
})
