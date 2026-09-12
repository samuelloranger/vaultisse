import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getInstanceSettings } from '@/api/admin'
import { searchBooks } from '@/api/search'
import { bookKeys, dashboardKeys, searchKeys } from '@/queries/keys'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { AdminLibraryTab } from './AdminLibraryTab'

vi.mock('@/api/admin', () => ({
  getInstanceSettings: vi.fn(),
  updateInstanceSettings: vi.fn(),
}))
vi.mock('@/api/search', () => ({ searchBooks: vi.fn() }))

beforeEach(() => {
  vi.mocked(getInstanceSettings).mockResolvedValue({
    leasingEnabled: true,
    registrationRequiresApproval: false,
    registrationApprovalFromEnv: false,
    defaultLanguage: 'en',
    defaultRegion: 'US',
    defaultTheme: 'beige',
  })
  vi.mocked(searchBooks).mockResolvedValue({
    total: 3,
    limit: 50,
    books: [
      {
        id: 11,
        name: 'One',
        isbn: '9780061054884',
        image_url: null,
        category_id: null,
        language_code: null,
        authors: [],
      },
      {
        id: 12,
        name: 'Two',
        isbn: null,
        image_url: null,
        category_id: null,
        language_code: null,
        authors: [],
      },
      {
        id: 13,
        name: 'Three',
        isbn: '9780061054884',
        image_url: null,
        category_id: null,
        language_code: null,
        authors: [],
      },
    ],
  })
})
afterEach(() => vi.unstubAllGlobals())

it('keeps the selection after a failed request and offers an honest retry', async () => {
  const user = userEvent.setup()
  const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network unavailable'))
  vi.stubGlobal('fetch', fetchMock)
  renderWithProviders(<AdminLibraryTab />)
  await user.click(await screen.findByRole('button', { name: 'Choose books' }))
  await user.click(await screen.findByRole('checkbox', { name: /One/ }))
  await user.click(screen.getByRole('button', { name: 'Refresh 1 selected books' }))
  expect(
    await screen.findByText(/Some books may already have refreshed/)
  ).toHaveTextContent('Network unavailable')
  expect(screen.getByRole('checkbox', { name: /One/ })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Refresh 1 selected books' }))
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('caps selection at 50 across search pages and re-enables choices when a book is removed', async () => {
  const user = userEvent.setup()
  const books = Array.from({ length: 51 }, (_, index) => ({
    id: index + 1,
    name: `Book ${index + 1}`,
    isbn: null,
    image_url: null,
    category_id: null,
    language_code: null,
    authors: [],
  }))
  vi.mocked(searchBooks).mockImplementation(async (_criteria, page) => ({
    total: 51,
    limit: 50,
    books: page === 0 ? books.slice(0, 50) : books.slice(50),
  }))
  renderWithProviders(<AdminLibraryTab />)
  await user.click(await screen.findByRole('button', { name: 'Choose books' }))
  await screen.findByRole('checkbox', { name: 'Book 1 — no ISBN' })
  for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox)
  await user.click(screen.getByRole('button', { name: 'Load more books' }))
  expect(
    await screen.findByRole('checkbox', { name: 'Book 51 — no ISBN' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Refresh 50 selected books' })
  ).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Book 1 — no ISBN' }))
  expect(screen.getByRole('checkbox', { name: 'Book 51 — no ISBN' })).toBeEnabled()
})

it('refreshes explicit selections once and reports changed, unchanged and skipped books', async () => {
  const user = userEvent.setup()
  let finish!: (response: Response) => void
  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      })
  )
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(bookKeys.detail(11), { id: 11 })
  queryClient.setQueryData(dashboardKeys.summary(), { total: 3 })
  renderWithProviders(<AdminLibraryTab />, { queryClient })
  await user.click(await screen.findByRole('button', { name: 'Choose books' }))
  await user.click(await screen.findByRole('checkbox', { name: /One/ }))
  await user.click(screen.getByRole('checkbox', { name: /Two/ }))
  await user.click(screen.getByRole('checkbox', { name: /Three/ }))
  await user.click(screen.getByRole('button', { name: 'Refresh 3 selected books' }))
  const pendingButton = screen.getByRole('button', { name: 'Refreshing 3 books…' })
  expect(pendingButton).toHaveAttribute('aria-disabled', 'true')
  pendingButton.focus()
  await user.keyboard('{Enter}{Enter}')
  expect(screen.getByRole('checkbox', { name: /One/ })).toBeDisabled()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/rest/book/refresh',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ ids: [11, 12, 13], overwrite: false }),
    })
  )
  finish(
    new Response(
      JSON.stringify({
        mode: 'fill',
        results: [
          {
            bookId: 11,
            name: 'One',
            status: 'ok',
            changed: ['pages'],
            stillMissing: ['category'],
          },
          { bookId: 12, name: 'Two', status: 'no_isbn', changed: [], stillMissing: [] },
          { bookId: 13, name: 'Three', status: 'ok', changed: [], stillMissing: [] },
        ],
      })
    )
  )
  expect(
    await screen.findByText('1 changed · 1 unchanged · 1 skipped or failed')
  ).toBeInTheDocument()
  expect(screen.getByText(/Add a valid ISBN/)).toBeInTheDocument()
  expect(screen.getByText(/Still missing: category/)).toBeInTheDocument()
  await waitFor(() =>
    expect(queryClient.getQueryState(bookKeys.detail(11))?.isInvalidated).toBe(true)
  )
  expect(queryClient.getQueryState(dashboardKeys.summary())?.isInvalidated).toBe(true)
  expect(queryClient.getQueriesData({ queryKey: searchKeys.all })).not.toHaveLength(0)
})
