import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import type { LocationBook, LocationRow } from '@/api/location'
import { renderWithProviders } from '@/test/renderWithProviders'
import { LocationsScreen } from './LocationsScreen'

/**
 * The spec's four-test set, plus two this screen earns on its own: the
 * expandable body, and the count that arrives as a string.
 *
 * As in the dashboard's template the `api/` module is mocked and the query
 * hooks are real, so `locationKeys.list()`, `locationKeys.books(id)` and the
 * cross-resource invalidation are all genuinely exercised.
 */

vi.mock('@/api/location', async (importOriginal) => {
  // `locationBookCount` is a pure helper on the same module and is part of what
  // is being tested (a `bigint` count arrives as a string); keep the real one.
  const actual = await importOriginal<typeof import('@/api/location')>()
  return {
    locationBookCount: actual.locationBookCount,
    getLocations: vi.fn(),
    getLocationBooks: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    addBooksToLocation: vi.fn(),
  }
})

import {
  addBooksToLocation,
  createLocation,
  deleteLocation,
  getLocationBooks,
  getLocations,
  updateLocation,
} from '@/api/location'

const getLocationsMock = vi.mocked(getLocations)
const getLocationBooksMock = vi.mocked(getLocationBooks)
const createLocationMock = vi.mocked(createLocation)
const updateLocationMock = vi.mocked(updateLocation)
const deleteLocationMock = vi.mocked(deleteLocation)
const addBooksToLocationMock = vi.mocked(addBooksToLocation)

/**
 * Shaped from the dev API's real `GET /location`. `total_books` is a **string**
 * on purpose: it is `COUNT(*)`, a Postgres `bigint`, and node-postgres hands
 * bigints back as strings. A fixture that quietly used `6` would let a
 * string-concatenation bug through.
 */
function makeLocations(): LocationRow[] {
  return [
    {
      id: 1,
      name: 'Salon — bibliothèque murale',
      description: 'Grande étagère du salon',
      total_books: '6',
    },
    {
      id: 2,
      name: 'Bureau',
      description: 'Étagère au-dessus du bureau',
      total_books: '0',
    },
    { id: 3, name: 'Sous-sol — boîte 3', description: null, total_books: '0' },
  ]
}

function makeLocationBooks(): LocationBook[] {
  return [
    {
      id: 2,
      book_id: 2,
      name: 'The Left Hand of Darkness',
      code: '0000000002',
      status: 0,
      image_url: null,
    },
    {
      id: 1,
      book_id: 1,
      name: 'The Dispossessed: An Ambiguous Utopia',
      code: '0000000001',
      status: 2,
      image_url: null,
    },
  ]
}

beforeEach(() => {
  getLocationsMock.mockResolvedValue(makeLocations())
  getLocationBooksMock.mockResolvedValue(makeLocationBooks())
  createLocationMock.mockResolvedValue({
    id: 4,
    name: 'Chambre',
    description: '',
    total_books: '0',
  })
  updateLocationMock.mockResolvedValue({
    id: 1,
    name: 'Salon',
    description: '',
    total_books: '6',
  })
  deleteLocationMock.mockResolvedValue({ message: 'Location deleted successfully' })
  addBooksToLocationMock.mockResolvedValue(makeLocationBooks())
})

describe('LocationsScreen', () => {
  it('renders', async () => {
    renderWithProviders(<LocationsScreen />)
    expect(await screen.findByTestId('locations-screen')).toBeInTheDocument()
    expect(screen.getByText('Locations')).toBeInTheDocument()
  })

  it('shows data from the query, counts included', async () => {
    renderWithProviders(<LocationsScreen />)

    expect(await screen.findByText('Salon — bibliothèque murale')).toBeInTheDocument()
    expect(screen.getByText('Grande étagère du salon')).toBeInTheDocument()
    expect(screen.getAllByTestId('locations-screen-row')).toHaveLength(3)

    // The count is the string "6" on the wire. It must read as six copies, not
    // as "6" concatenated into something, and an empty shelf says so in words.
    const counts = screen.getAllByTestId('location-count')
    expect(counts[0]).toHaveTextContent('6 copies')
    expect(counts[1]).toHaveTextContent('Empty')
  })

  it('fires the create mutation and invalidates the list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LocationsScreen />)
    await screen.findByTestId('locations-screen')
    expect(getLocationsMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('locations-screen-add'))
    await user.type(await screen.findByTestId('locations-screen-form-name'), 'Chambre')
    await user.type(
      screen.getByTestId('locations-screen-form-description'),
      'Table de chevet'
    )
    await user.click(screen.getByTestId('locations-screen-form-submit'))

    await waitFor(() => {
      expect(createLocationMock).toHaveBeenCalledWith({
        name: 'Chambre',
        description: 'Table de chevet',
      })
    })
    // The invalidation, not the POST, is what the rewrite is for.
    await waitFor(() => {
      expect(getLocationsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('renders its error state', async () => {
    getLocationsMock.mockRejectedValue(new ApiError(500, null, 'Internal Server Error'))
    renderWithProviders(<LocationsScreen />)

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('The locations did not load')).toBeInTheDocument()
  })

  it('loads a location’s books only once its row is expanded', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LocationsScreen />)
    await screen.findByText('Salon — bibliothèque murale')

    // Ten collapsed rows must not mean ten requests.
    expect(getLocationBooksMock).not.toHaveBeenCalled()

    await user.click(screen.getAllByTestId('locations-screen-row-toggle')[0])

    await waitFor(() => {
      expect(getLocationBooksMock).toHaveBeenCalledWith(1, expect.anything())
    })
    expect(await screen.findByText('The Left Hand of Darkness')).toBeInTheDocument()
    expect(screen.getByText('0000000002')).toBeInTheDocument()
    // `book_stocks.status` 2 is a copy that is out.
    expect(screen.getByText('On loan')).toBeInTheDocument()
  })

  it('moves copies onto a shelf and invalidates both lists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LocationsScreen />)
    await screen.findByText('Bureau')

    await user.click(screen.getByLabelText('Actions for Bureau'))
    await user.click(
      await screen.findByTestId('locations-screen-row-actions-add-books')
    )
    await user.type(
      await screen.findByTestId('location-add-books-codes'),
      '0000000001 0000000002'
    )
    await user.click(screen.getByTestId('location-add-books-submit'))

    await waitFor(() => {
      expect(addBooksToLocationMock).toHaveBeenCalledWith(2, [
        '0000000001',
        '0000000002',
      ])
    })
    // Moving a copy changes both shelves' counts, so the list refetches.
    await waitFor(() => {
      expect(getLocationsMock).toHaveBeenCalledTimes(2)
    })
    expect(updateLocationMock).not.toHaveBeenCalled()
    expect(deleteLocationMock).not.toHaveBeenCalled()
  })
})
