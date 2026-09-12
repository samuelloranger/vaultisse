import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import type { SearchResponse } from '@/api/search'
import type { Policy } from '@/api/types'
import { policyKeys } from '@/queries/keys'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { SearchScreen } from './SearchScreen'
import type { SearchScreenParams } from './searchParams'

/**
 * The four tests every screen gets, copied from
 * `features/dashboard/DashboardScreen.test.tsx`:
 *   1. it renders
 *   2. it shows data from a mocked query
 *   3. its primary action fires the right mutation
 *   4. its error state renders
 *
 * As in the template, the **`api/` modules are mocked, not the query hooks** —
 * so the real `searchKeys` key and the real invalidation stay under test. Test
 * 3 asserts the refetch rather than the POST for exactly that reason: adding a
 * book has to move the result set, and a mutation that forgot to say so would
 * still pass an assertion that only checked the request went out.
 *
 * `@tanstack/react-router` is stubbed down to a plain anchor. The result cards
 * are real links (a card you cannot middle-click is not a link), and `Link`
 * needs a router in context; rendering the screen under a memory router instead
 * would put a history stack in every test to assert on an `<a href>`.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    style?: React.CSSProperties
  }) => (
    <a href={`/app/book/${params?.book_id}`} {...rest}>
      {children}
    </a>
  ),
}))

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

import { createBook, createBookFromIsbn } from '@/api/book'
import { searchBooks } from '@/api/search'

const searchBooksMock = vi.mocked(searchBooks)
const createBookFromIsbnMock = vi.mocked(createBookFromIsbn)
const createBookMock = vi.mocked(createBook)

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
    categories: [
      { id: 1, name: 'Science-fiction' },
      { id: 2, name: 'Essai' },
    ],
    languages: [{ code: 'en', name: 'English' }],
    formats: [{ id: 9, name: 'Electronic' }],
    locations: [{ id: 1, name: 'Salon' }],
    labels: {},
    maxImportFileSizeMb: 10,
    ...overrides,
  }
}

function makeResults(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    total: 2,
    limit: 50,
    books: [
      {
        id: 1,
        name: 'The Dispossessed: An Ambiguous Utopia',
        image_url: null,
        isbn: '9780061054884',
        category_id: 1,
        language_code: null,
        authors: [{ id: 1, name: 'Ursula K. Le Guin' }],
      },
      {
        id: 3,
        name: 'Between the World and Me',
        image_url: null,
        isbn: '9780812993547',
        category_id: 2,
        language_code: null,
        authors: [{ id: 5, name: 'Ta-Nehisi Coates' }],
      },
    ],
    ...overrides,
  }
}

function renderSearch(params: SearchScreenParams = {}) {
  const queryClient = createTestQueryClient()
  // What the `_app` route's loader does before this screen ever mounts.
  queryClient.setQueryData(policyKeys.current(), makePolicy())
  const onParamsChange = vi.fn()
  const result = renderWithProviders(
    <SearchScreen params={params} onParamsChange={onParamsChange} />,
    { queryClient }
  )
  return { ...result, onParamsChange }
}

beforeEach(() => {
  searchBooksMock.mockResolvedValue(makeResults())
  createBookFromIsbnMock.mockResolvedValue(42)
  createBookMock.mockResolvedValue(43)
})

describe('SearchScreen', () => {
  it('renders', async () => {
    renderSearch()
    expect(await screen.findByTestId('search-screen')).toBeInTheDocument()
    expect(screen.getByTestId('search-filters')).toBeInTheDocument()
    expect(screen.getByTestId('open-add-isbn')).toBeInTheDocument()
  })

  it('shows data from the query', async () => {
    renderSearch()

    expect(await screen.findByTestId('book-grid')).toBeInTheDocument()
    expect(
      screen.getByText('The Dispossessed: An Ambiguous Utopia')
    ).toBeInTheDocument()
    expect(screen.getByText('Ursula K. Le Guin')).toBeInTheDocument()
    expect(screen.getByTestId('search-total')).toHaveTextContent('2 books')
  })

  it('sends the filters the controls set', async () => {
    const user = userEvent.setup()
    const { onParamsChange } = renderSearch()
    await screen.findByTestId('search-screen')

    await user.click(screen.getByTestId('open-filters'))

    await user.click(await screen.findByTestId('stock-ON_LOAN'))
    expect(onParamsChange).toHaveBeenCalledWith({ stock: 'ON_LOAN' })

    await user.click(screen.getByTestId('category-2'))
    expect(onParamsChange).toHaveBeenLastCalledWith({ categoryId: 2 })
  })

  it('keeps the search box out of the drawer and the drawer out of the URL', async () => {
    const user = userEvent.setup()
    const { onParamsChange } = renderSearch()
    await screen.findByTestId('search-screen')

    // The primary action is on the page whether or not the drawer is open.
    expect(screen.getByTestId('search-query')).toBeInTheDocument()
    expect(screen.queryByTestId('category-all')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('open-filters'))
    expect(await screen.findByTestId('category-all')).toBeInTheDocument()
    expect(screen.getByTestId('search-query')).toBeInTheDocument()

    // Opening a drawer is not a navigation.
    expect(onParamsChange).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('filters-done'))
    await waitFor(() => {
      expect(screen.queryByTestId('category-all')).not.toBeInTheDocument()
    })
    expect(onParamsChange).not.toHaveBeenCalled()
  })

  it('counts the filters the drawer is hiding', async () => {
    const plain = renderSearch()
    await screen.findByTestId('search-screen')

    // Nothing narrowing set: no badge at all, rather than a zero.
    expect(screen.queryByTestId('filters-count')).not.toBeInTheDocument()
    plain.unmount()

    // The text box is on the page and sort/group do not narrow anything, so
    // none of these three counts.
    const display = renderSearch({ q: 'dune', sort: 'DATE_NEWEST', group: true })
    await screen.findByTestId('search-screen')
    expect(screen.queryByTestId('filters-count')).not.toBeInTheDocument()
    display.unmount()

    renderSearch({ categoryId: 2, stock: 'ON_LOAN', recent: true, from: '2026-01-01' })
    await screen.findByTestId('search-screen')
    expect(screen.getByTestId('filters-count')).toHaveTextContent('4')
  })

  it('clears every filter, from the page and from the drawer', async () => {
    const user = userEvent.setup()
    const { onParamsChange } = renderSearch({
      q: 'dune',
      categoryId: 2,
      stock: 'ON_LOAN',
      sort: 'DATE_NEWEST',
    })
    await screen.findByTestId('search-screen')

    // The display-only choices survive; everything narrowing goes.
    await user.click(screen.getByTestId('clear-filters'))
    expect(onParamsChange).toHaveBeenLastCalledWith({
      sort: 'DATE_NEWEST',
      group: undefined,
    })

    await user.click(screen.getByTestId('open-filters'))
    await user.click(await screen.findByTestId('filters-clear'))
    expect(onParamsChange).toHaveBeenLastCalledWith({
      sort: 'DATE_NEWEST',
      group: undefined,
    })
  })

  it('fires the ISBN mutation and invalidates the search', async () => {
    const user = userEvent.setup()
    renderSearch()
    await screen.findByTestId('book-grid')
    expect(searchBooksMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('open-add-isbn'))
    await user.type(await screen.findByTestId('isbn-input'), '9780261102217')
    await user.click(screen.getByTestId('isbn-enqueue'))
    await user.click(screen.getByTestId('isbn-submit'))

    await waitFor(() => {
      expect(createBookFromIsbnMock).toHaveBeenCalledWith('9780261102217', null)
    })

    // The point of the mutation is the invalidation: a new book changes what
    // this very result set contains. Asserting the refetch rather than the
    // `isInvalidated` flag is deliberate — a mounted query that is invalidated
    // refetches immediately and clears the flag, so the flag would flake.
    await waitFor(() => {
      expect(searchBooksMock).toHaveBeenCalledTimes(2)
    })
  })

  it('renders its error state', async () => {
    searchBooksMock.mockRejectedValue(new ApiError(500, null, 'Error loading search'))
    renderSearch()

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('Error loading search')).toBeInTheDocument()
    expect(screen.getByTestId('screen-error-retry')).toBeInTheDocument()
  })
})
