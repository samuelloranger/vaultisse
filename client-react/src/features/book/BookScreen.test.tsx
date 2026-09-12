import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookDetail } from '@/api/book'
import { ApiError } from '@/api/http'
import type { Policy } from '@/api/types'
import { policyKeys } from '@/queries/keys'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { BookScreen } from './BookScreen'

/**
 * The four tests every screen gets, copied from
 * `features/dashboard/DashboardScreen.test.tsx`: it renders, it shows data from
 * a mocked query, its primary action fires the right mutation, its error state
 * renders.
 *
 * `@/api/book` is mocked rather than `useBook`/`useUpdateBook`, so the real
 * `bookKeys.detail(id)` and the real invalidation are what the third test
 * exercises.
 */

vi.mock('@/api/book', () => ({
  addBookStock: vi.fn(),
  bookFileDownloadUrl: (id: number, fileId: number) =>
    `/api/rest/book/${id}/file/${fileId}/download`,
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

vi.mock('@/api/author', () => ({
  getAuthors: vi.fn(),
  createAuthor: vi.fn(),
  updateAuthor: vi.fn(),
  deleteAuthor: vi.fn(),
}))

import { getAuthors } from '@/api/author'
import { getBook, updateBook } from '@/api/book'

const getBookMock = vi.mocked(getBook)
const getAuthorsMock = vi.mocked(getAuthors)
const updateBookMock = vi.mocked(updateBook)

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    user: {
      code: 'alice',
      name: 'Alice Dev',
      email: 'alice@dev.local',
      language: 'en',
      region: 'US',
      image: null,
      role: 'admin',
      isAdmin: true,
      leasingEnabled: true,
      isPublicInstitution: false,
      totpEnabled: false,
      securityNoticeAccepted: true,
      termsOfServiceAccepted: true,
    },
    customers: [{ id: 1, name: 'Camille Tremblay' }],
    categories: [{ id: 1, name: 'Science-fiction' }],
    languages: [{ code: 'en', name: 'English' }],
    formats: [{ id: 9, name: 'Electronic' }],
    locations: [{ id: 1, name: 'Salon — bibliothèque murale' }],
    labels: {},
    maxImportFileSizeMb: 10,
    ...overrides,
  }
}

function makeBook(overrides: Partial<BookDetail> = {}): BookDetail {
  return {
    id: 1,
    name: 'The Dispossessed: An Ambiguous Utopia',
    description: 'Anarres and Urras.',
    image_url: null,
    isbn: '9780061054884',
    category_id: 1,
    language_code: null,
    publisher: 'Harper Voyager',
    published_date: '1974-05-01T04:00:00.000Z',
    date_created: '2026-09-12T03:19:52.128Z',
    date_updated: '2026-09-12T03:19:52.128Z',
    pages: 387,
    format_id: null,
    files: [],
    stocks: [
      {
        id: 1,
        code: '0000000001',
        status: 2,
        location_id: 1,
        location_name: 'Salon — bibliothèque murale',
        customer_id: 1,
        customer_name: 'Camille Tremblay',
      },
    ],
    authors: [{ id: 1, name: 'Ursula K. Le Guin' }],
    ...overrides,
  }
}

function renderBook() {
  const queryClient = createTestQueryClient()
  // What the `_app` route's loader does before this screen ever mounts.
  queryClient.setQueryData(policyKeys.current(), makePolicy())
  return renderWithProviders(<BookScreen bookId={1} />, { queryClient })
}

beforeEach(() => {
  getBookMock.mockResolvedValue(makeBook())
  getAuthorsMock.mockResolvedValue([
    { id: 1, name: 'Ursula K. Le Guin' },
    { id: 5, name: 'Ta-Nehisi Coates' },
  ])
  updateBookMock.mockResolvedValue({ message: 'Book updated successfully' })
})

describe('BookScreen', () => {
  it('renders', async () => {
    renderBook()
    expect(await screen.findByTestId('book-screen')).toBeInTheDocument()
    expect(screen.getByTestId('book-meta')).toBeInTheDocument()
    expect(screen.getByTestId('book-stocks')).toBeInTheDocument()
  })

  it('shows data from the query', async () => {
    renderBook()
    await screen.findByTestId('book-screen')

    expect(screen.getByText('ISBN 9780061054884')).toBeInTheDocument()
    // Category and format ids are resolved against the policy's reference lists.
    expect(screen.getByTestId('book-meta-view')).toHaveTextContent('Science-fiction')
    expect(screen.getByTestId('book-authors')).toHaveTextContent('Ursula K. Le Guin')
    // The stock list, with its resolved shelf and borrower.
    expect(screen.getByTestId('stock-row')).toHaveTextContent('0000000001')
    expect(screen.getByTestId('stock-row')).toHaveTextContent('On loan')
    expect(screen.getByTestId('stock-row')).toHaveTextContent('Camille Tremblay')
  })

  it('fires the update mutation and invalidates the book', async () => {
    const user = userEvent.setup()
    renderBook()
    await screen.findByTestId('book-screen')
    expect(getBookMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('edit-book'))
    const title = await screen.findByTestId('edit-name')
    await user.clear(title)
    await user.type(title, 'The Dispossessed')
    await user.click(screen.getByTestId('save-book'))

    await waitFor(() => {
      expect(updateBookMock).toHaveBeenCalledTimes(1)
    })

    // The PUT overwrites every column, so the whole record goes up — including
    // the fields this edit never touched. `authors` in particular has to be the
    // book's real list: the server reconciles `book_authors` from it, so `[]`
    // would silently unlink every author on a save that only changed a title.
    const [id, body] = updateBookMock.mock.calls[0]
    expect(id).toBe(1)
    expect(body).toMatchObject({
      name: 'The Dispossessed',
      isbn: '9780061054884',
      category_id: 1,
      publisher: 'Harper Voyager',
      published_date: '1974-05-01',
      pages: 387,
      authors: [1],
    })

    // The invalidation is the point: the detail query refetches.
    await waitFor(() => {
      expect(getBookMock).toHaveBeenCalledTimes(2)
    })
  })

  it('sends the author list the picker produced', async () => {
    const user = userEvent.setup()
    renderBook()
    await screen.findByTestId('book-screen')

    await user.click(screen.getByTestId('edit-book'))
    // Drop the author the book has, add the other one the library knows.
    await user.click(await screen.findByTestId('remove-author-1'))
    await user.selectOptions(screen.getByTestId('add-author'), '5')
    await user.click(screen.getByTestId('save-book'))

    await waitFor(() => {
      expect(updateBookMock).toHaveBeenCalledTimes(1)
    })
    expect(updateBookMock.mock.calls[0][1]).toMatchObject({ authors: [5] })
  })

  it('renders its error state', async () => {
    getBookMock.mockRejectedValue(new ApiError(404, null, 'Book not found'))
    renderBook()

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('Book not found')).toBeInTheDocument()
    expect(screen.getByTestId('screen-error-retry')).toBeInTheDocument()
  })
})
