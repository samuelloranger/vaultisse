import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { LocaleProvider } from '@/locale/LocaleProvider'
import { policyKeys } from '@/queries/keys'
import { makePolicy } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { ScanScreen } from './ScanScreen'
import type { Decode } from './useBarcodeScanner'

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
vi.mock('./useBarcodeScanner', () => ({ useBarcodeScanner: vi.fn() }))

import { createBookFromIsbn } from '@/api/book'
import { searchBooks } from '@/api/search'
import { useBarcodeScanner } from './useBarcodeScanner'

const searchBooksMock = vi.mocked(searchBooks)
const createFromIsbnMock = vi.mocked(createBookFromIsbn)
const scannerMock = vi.mocked(useBarcodeScanner)
let decode: ((value: Decode) => void) | undefined

beforeEach(() => {
  searchBooksMock.mockResolvedValue({ total: 0, limit: 50, books: [] })
  createFromIsbnMock.mockRejectedValue(
    new ApiError(404, {
      error: 'source_not_configured',
      sourcesTried: [],
      unconfiguredSources: ['google-books'],
      failedSources: [],
    })
  )
  scannerMock.mockImplementation(({ onDecode }) => {
    decode = onDecode
    return {
      videoRef: { current: null },
      status: 'scanning',
      error: null,
      decoderKind: null,
      torchSupported: false,
      torchOn: false,
      toggleTorch: vi.fn(),
    } as ReturnType<typeof useBarcodeScanner>
  })
})

describe('ScanScreen locale', () => {
  it('shows a localized metadata failure from the queue', async () => {
    const labels = {
      METADATA_SOURCES_NOT_CONFIGURED:
        'Configuration manquante sur ce serveur pour : {sources}.',
      METADATA_SOURCE_NOT_CONFIGURED:
        'Métadonnées indisponibles : {configured} Demandez à un administrateur de vérifier la configuration ou ajoutez le livre manuellement.',
    }
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      policyKeys.current(),
      makePolicy({
        user: { ...makePolicy().user, language: 'fr', region: 'CA' },
        labels,
      })
    )
    renderWithProviders(
      <LocaleProvider language="fr" region="CA" labels={labels}>
        <ScanScreen open onClose={vi.fn()} onAddManually={vi.fn()} />
      </LocaleProvider>,
      { queryClient }
    )

    expect(decode).toBeDefined()
    act(() => decode?.({ value: '9780261102217', format: 'ean_13' }))

    expect(
      await screen.findByText(
        'Métadonnées indisponibles : Configuration manquante sur ce serveur pour : google-books. Demandez à un administrateur de vérifier la configuration ou ajoutez le livre manuellement.'
      )
    ).toBeInTheDocument()
  })
})
