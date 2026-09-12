import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import type { Policy } from '@/api/types'
import { policyKeys } from '@/queries/keys'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { AddBookIsbnDialog } from './AddBookIsbnDialog'

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

import { createBookFromIsbn } from '@/api/book'

const createFromIsbnMock = vi.mocked(createBookFromIsbn)
const ISBN = '9780261102217'

function makePolicy(): Policy {
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
    customers: [],
    categories: [],
    languages: [],
    formats: [],
    locations: [{ id: 1, name: 'Salon' }],
    labels: {},
    maxImportFileSizeMb: 10,
  }
}

function renderDialog() {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(policyKeys.current(), makePolicy())
  return renderWithProviders(<AddBookIsbnDialog open onOpenChange={vi.fn()} />, {
    queryClient,
  })
}

async function submitIsbn() {
  const user = userEvent.setup()
  await user.type(screen.getByTestId('isbn-input'), ISBN)
  await user.click(screen.getByTestId('isbn-enqueue'))
  await waitFor(() => expect(screen.getByTestId('isbn-queue')).toBeInTheDocument())
  fireEvent.click(screen.getByTestId('isbn-submit'))
}

beforeEach(() => {
  createFromIsbnMock.mockResolvedValue(42)
})

describe('AddBookIsbnDialog metadata failures', () => {
  it('explains which metadata source is not configured', async () => {
    createFromIsbnMock.mockRejectedValue(
      new ApiError(404, {
        error: 'source_not_configured',
        sourcesTried: [],
        unconfiguredSources: ['google-books'],
        failedSources: [],
      })
    )
    renderDialog()

    await submitIsbn()

    expect(
      await screen.findByText(
        'Metadata source unavailable: google-books is not configured on this server. Ask an administrator to configure it, or add the book manually.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/open library/i)).not.toBeInTheDocument()
  })

  it('says the checked ISBN has no catalogue metadata', async () => {
    createFromIsbnMock.mockRejectedValue(
      new ApiError(404, {
        error: 'no_metadata',
        sourcesTried: ['google-books', 'bnf'],
        unconfiguredSources: [],
        failedSources: [],
      })
    )
    renderDialog()

    await submitIsbn()

    expect(
      await screen.findByText(
        'This ISBN was checked, but no catalogue returned metadata. Add it manually instead.'
      )
    ).toBeInTheDocument()
  })
})
