import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryRow } from '@/api/category'
import { ApiError } from '@/api/http'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CategoriesScreen } from './CategoriesScreen'

/**
 * The four-test set from the spec, in the shape
 * `features/dashboard/DashboardScreen.test.tsx` established.
 *
 * The `api/` module is mocked, never the query hook. That keeps the real
 * `useCategories`, the real `categoryKeys.list()` and the real invalidation in
 * the test — which is where the bug this rewrite exists to kill actually lives.
 * Mocking `useCategories` would assert only that JSX renders props.
 *
 * No policy is seeded: unlike the dashboard, these screens do not read it.
 *
 * `test/setup.ts` makes `matchMedia` report no match, so every test here runs
 * the **phone** layout — the one the spec's hard requirements are about, and
 * the one where a row's actions collapse into a single overflow control.
 */

vi.mock('@/api/category', () => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} from '@/api/category'

const getCategoriesMock = vi.mocked(getCategories)
const createCategoryMock = vi.mocked(createCategory)
const updateCategoryMock = vi.mocked(updateCategory)
const deleteCategoryMock = vi.mocked(deleteCategory)

/** Shaped from the dev API's real `GET /category`. */
function makeCategories(): CategoryRow[] {
  return [
    { id: 1, name: 'Science-fiction' },
    { id: 2, name: 'Essai' },
    { id: 3, name: 'Roman graphique' },
    { id: 4, name: 'Histoire' },
  ]
}

beforeEach(() => {
  getCategoriesMock.mockResolvedValue(makeCategories())
  createCategoryMock.mockResolvedValue({ id: 5, name: 'Poésie' })
  updateCategoryMock.mockResolvedValue({ id: 1, name: 'SF' })
  deleteCategoryMock.mockResolvedValue({ message: 'Category deleted successfully' })
})

describe('CategoriesScreen', () => {
  it('renders', async () => {
    renderWithProviders(<CategoriesScreen />)
    expect(await screen.findByTestId('categories-screen')).toBeInTheDocument()
    expect(screen.getByText('Categories')).toBeInTheDocument()
  })

  it('shows data from the query', async () => {
    renderWithProviders(<CategoriesScreen />)

    expect(await screen.findByText('Science-fiction')).toBeInTheDocument()
    expect(screen.getByText('Roman graphique')).toBeInTheDocument()
    expect(await screen.findAllByTestId('categories-screen-row')).toHaveLength(4)

    // One overflow control per row, not three competing ones. This is the
    // defect the screens were rebuilt around, so it is asserted, not assumed.
    expect(screen.getAllByTestId('categories-screen-row-actions')).toHaveLength(4)
    expect(screen.getByLabelText('Actions for Science-fiction')).toBeInTheDocument()
  })

  it('fires the create mutation and invalidates the list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoriesScreen />)
    await screen.findByTestId('categories-screen')
    expect(getCategoriesMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('categories-screen-add'))
    await user.type(await screen.findByTestId('categories-screen-form-name'), 'Poésie')
    await user.click(screen.getByTestId('categories-screen-form-submit'))

    await waitFor(() => {
      expect(createCategoryMock).toHaveBeenCalledWith({ name: 'Poésie' })
    })

    // The POST is not the point; the refetch is. A category another member adds
    // used to stay invisible until a full page reload.
    await waitFor(() => {
      expect(getCategoriesMock).toHaveBeenCalledTimes(2)
    })
  })

  it('renders its error state', async () => {
    getCategoriesMock.mockRejectedValue(
      new ApiError(500, null, 'Internal Server Error')
    )
    renderWithProviders(<CategoriesScreen />)

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('The categories did not load')).toBeInTheDocument()
    expect(screen.getByTestId('screen-error-retry')).toBeInTheDocument()
  })

  it('edits and deletes through the row overflow menu', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CategoriesScreen />)
    await screen.findByText('Science-fiction')

    // Edit: overflow → Edit → the form opens seeded with the current name.
    await user.click(screen.getByLabelText('Actions for Science-fiction'))
    await user.click(await screen.findByTestId('categories-screen-row-actions-edit'))
    const nameField = await screen.findByTestId('categories-screen-form-name')
    expect(nameField).toHaveValue('Science-fiction')
    await user.clear(nameField)
    await user.type(nameField, 'SF')
    await user.click(screen.getByTestId('categories-screen-form-submit'))
    await waitFor(() => {
      expect(updateCategoryMock).toHaveBeenCalledWith(1, { name: 'SF' })
    })

    // Delete: overflow → Delete → a confirmation, never a one-tap destroy.
    await user.click(screen.getByLabelText('Actions for Essai'))
    await user.click(await screen.findByTestId('categories-screen-row-actions-delete'))
    await user.click(await screen.findByTestId('categories-screen-delete-confirm'))
    await waitFor(() => {
      expect(deleteCategoryMock).toHaveBeenCalledWith(2)
    })
  })
})
