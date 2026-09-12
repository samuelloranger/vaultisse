import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import { policyKeys } from '@/queries/keys'
import { makeBookCounters, makeDashboard, makePolicy } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { DashboardScreen } from './DashboardScreen'

/**
 * The screen test template.
 *
 * Per the spec, every ported screen gets at least these four:
 *   1. it renders
 *   2. it shows data from a mocked query
 *   3. its primary action fires the right mutation
 *   4. its error state renders
 *
 * Copy this file's shape for the next screen. What is worth copying:
 *
 *  - **The `api/` module is mocked, not the query hook.** That keeps the real
 *    hook, the real cache key and the real invalidation in the test, which is
 *    where the bugs actually are. Mocking `useDashboard` would assert only that
 *    JSX renders props.
 *  - **The policy is seeded into the cache** rather than mocked, because the
 *    `_app` loader is what puts it there in production and `usePolicy` suspends
 *    if it is absent.
 */

vi.mock('@/api/dashboard', () => ({ getDashboard: vi.fn() }))
vi.mock('@/api/book', () => ({ getBookCounters: vi.fn(), returnBooks: vi.fn() }))

import { getBookCounters, returnBooks } from '@/api/book'
import { getDashboard } from '@/api/dashboard'

const getDashboardMock = vi.mocked(getDashboard)
const getBookCountersMock = vi.mocked(getBookCounters)
const returnBooksMock = vi.mocked(returnBooks)

function renderDashboard() {
  const queryClient = createTestQueryClient()
  // What the `_app` route's loader does before this screen ever mounts.
  queryClient.setQueryData(policyKeys.current(), makePolicy())
  return renderWithProviders(<DashboardScreen />, { queryClient })
}

beforeEach(() => {
  getDashboardMock.mockResolvedValue(makeDashboard())
  getBookCountersMock.mockResolvedValue(makeBookCounters())
  returnBooksMock.mockResolvedValue(null)
})

describe('DashboardScreen', () => {
  it('renders', async () => {
    renderDashboard()
    expect(await screen.findByTestId('dashboard-screen')).toBeInTheDocument()
    expect(screen.getByText('Welcome back, Alice Dev')).toBeInTheDocument()
  })

  it('shows data from the queries', async () => {
    renderDashboard()

    // From GET /dashboard.
    const totalTile = await screen.findByTestId('tile-total')
    expect(totalTile).toHaveTextContent('7')
    expect(screen.getByTestId('tile-on-loan')).toHaveTextContent('1')
    expect(screen.getByText('The Left Hand of Darkness')).toBeInTheDocument()
    expect(screen.getByText('Between the World and Me')).toBeInTheDocument()

    // From the second endpoint, GET /book/counters — rendered in the same row.
    await waitFor(() => {
      expect(screen.getByTestId('counters-line')).toHaveTextContent('7 in the library')
    })
  })

  it('fires the return mutation and invalidates the dashboard', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByTestId('dashboard-screen')
    expect(getDashboardMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('open-return-dialog'))
    await user.type(await screen.findByTestId('return-codes'), 'BK-000123')
    await user.click(screen.getByTestId('return-submit'))

    await waitFor(() => {
      expect(returnBooksMock).toHaveBeenCalledWith(['BK-000123'])
    })

    // The point of the mutation is the invalidation, not the POST: the
    // dashboard's counts move when a copy comes back. Asserting the *refetch*
    // rather than the `isInvalidated` flag is deliberate — an invalidated query
    // that is currently mounted refetches immediately and clears the flag
    // again, so the flag is only briefly true and the assertion would flake.
    await waitFor(() => {
      expect(getDashboardMock).toHaveBeenCalledTimes(2)
    })
    expect(getBookCountersMock).toHaveBeenCalledTimes(2)
  })

  it('renders its error state', async () => {
    getDashboardMock.mockRejectedValue(
      new ApiError(500, null, 'Error loading dashboard')
    )
    renderDashboard()

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('Error loading dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('screen-error-retry')).toBeInTheDocument()
  })
})
