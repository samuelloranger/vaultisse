import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthorRow } from '@/api/author'
import { ApiError } from '@/api/http'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AuthorsScreen } from './AuthorsScreen'

/**
 * The spec's four-test set, per `features/dashboard/DashboardScreen.test.tsx`:
 * it renders, it shows data, its primary action fires the right mutation, its
 * error state renders.
 *
 * The `api/` module is mocked, not the hook — so the real `authorKeys.list()`
 * and the real post-mutation invalidation are under test.
 */

vi.mock('@/api/author', () => ({
  getAuthors: vi.fn(),
  createAuthor: vi.fn(),
  updateAuthor: vi.fn(),
  deleteAuthor: vi.fn(),
}))

import { createAuthor, deleteAuthor, getAuthors, updateAuthor } from '@/api/author'

const getAuthorsMock = vi.mocked(getAuthors)
const createAuthorMock = vi.mocked(createAuthor)
const updateAuthorMock = vi.mocked(updateAuthor)
const deleteAuthorMock = vi.mocked(deleteAuthor)

/** Shaped from the dev API's real `GET /author`. */
function makeAuthors(): AuthorRow[] {
  return [
    { id: 1, name: 'Ursula K. Le Guin' },
    { id: 2, name: 'Gabriel García Márquez' },
    { id: 3, name: 'Michel-Rolph Trouillot' },
    { id: 4, name: 'Marguerite Yourcenar' },
    { id: 5, name: 'Ta-Nehisi Coates' },
  ]
}

beforeEach(() => {
  getAuthorsMock.mockResolvedValue(makeAuthors())
  createAuthorMock.mockResolvedValue({ id: 6, name: 'Octavia E. Butler' })
  updateAuthorMock.mockResolvedValue({ id: 1, name: 'Ursula Le Guin' })
  deleteAuthorMock.mockResolvedValue({ message: 'Author deleted successfully' })
})

describe('AuthorsScreen', () => {
  it('renders', async () => {
    renderWithProviders(<AuthorsScreen />)
    expect(await screen.findByTestId('authors-screen')).toBeInTheDocument()
    expect(screen.getByText('Authors')).toBeInTheDocument()
  })

  it('shows data from the query', async () => {
    renderWithProviders(<AuthorsScreen />)

    expect(await screen.findByText('Ursula K. Le Guin')).toBeInTheDocument()
    expect(screen.getByText('Ta-Nehisi Coates')).toBeInTheDocument()
    expect(screen.getAllByTestId('authors-screen-row')).toHaveLength(5)
    // One overflow control per row — never three competing ones.
    expect(screen.getAllByTestId('authors-screen-row-actions')).toHaveLength(5)
  })

  it('fires the create mutation and invalidates the list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AuthorsScreen />)
    await screen.findByTestId('authors-screen')
    expect(getAuthorsMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('authors-screen-add'))
    await user.type(
      await screen.findByTestId('authors-screen-form-name'),
      'Octavia E. Butler'
    )
    await user.click(screen.getByTestId('authors-screen-form-submit'))

    await waitFor(() => {
      expect(createAuthorMock).toHaveBeenCalledWith({ name: 'Octavia E. Butler' })
    })
    await waitFor(() => {
      expect(getAuthorsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('renders its error state', async () => {
    getAuthorsMock.mockRejectedValue(new ApiError(500, null, 'Internal Server Error'))
    renderWithProviders(<AuthorsScreen />)

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('The authors did not load')).toBeInTheDocument()
  })

  it('confirms before deleting, and never deletes on one tap', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AuthorsScreen />)
    await screen.findByText('Ta-Nehisi Coates')

    await user.click(screen.getByLabelText('Actions for Ta-Nehisi Coates'))
    await user.click(await screen.findByTestId('authors-screen-row-actions-delete'))

    // Choosing "Delete" in the menu has not deleted anything yet.
    expect(deleteAuthorMock).not.toHaveBeenCalled()
    expect(await screen.findByText('Delete Ta-Nehisi Coates?')).toBeInTheDocument()

    await user.click(screen.getByTestId('authors-screen-delete-confirm'))
    await waitFor(() => {
      expect(deleteAuthorMock).toHaveBeenCalledWith(5)
    })
    await waitFor(() => {
      expect(getAuthorsMock).toHaveBeenCalledTimes(2)
    })
    expect(updateAuthorMock).not.toHaveBeenCalled()
  })
})
