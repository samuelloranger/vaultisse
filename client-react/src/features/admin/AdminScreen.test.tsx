import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminAccount } from '@/api/admin'
import { ApiError } from '@/api/http'
import { policyKeys } from '@/queries/keys'
import { makePolicy } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { AdminScreen } from './AdminScreen'

/**
 * The spec's four, plus the two this screen exists to get right: a guard rail's
 * message reaching the user verbatim, and a non-admin being refused rather than
 * redirected.
 *
 * As in the dashboard template, `api/admin` is mocked and the query hooks are
 * real, so `adminKeys.users()` and the invalidation after a mutation are
 * genuinely exercised rather than asserted about.
 */

vi.mock('@/api/admin', () => ({
  getAdminUsers: vi.fn(),
  updateAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
}))

import { deleteAdminUser, getAdminUsers, updateAdminUser } from '@/api/admin'

const getAdminUsersMock = vi.mocked(getAdminUsers)
const updateAdminUserMock = vi.mocked(updateAdminUser)
const deleteAdminUserMock = vi.mocked(deleteAdminUser)

/** Shaped from the dev API's real `GET /admin/users`. */
function makeAccounts(): AdminAccount[] {
  return [
    {
      id: 1,
      code: 'alice',
      name: 'Alice Dev',
      email: 'alice@dev.local',
      role: 'admin',
      disabled: false,
      createdDate: '2026-09-12T03:17:47.383Z',
      lastLoginDate: '2026-09-12T06:19:52.664Z',
      isSelf: true,
    },
    {
      id: 2,
      code: 'bob',
      name: 'Bob Dev',
      email: 'bob@dev.local',
      role: 'user',
      disabled: false,
      createdDate: '2026-09-12T03:17:47.575Z',
      lastLoginDate: null,
      isSelf: false,
    },
  ]
}

function renderAdmin({ isAdmin = true }: { isAdmin?: boolean } = {}) {
  const queryClient = createTestQueryClient()
  const policy = makePolicy()
  // What the `_app` loader puts there before this screen mounts.
  queryClient.setQueryData(policyKeys.current(), {
    ...policy,
    user: { ...policy.user, isAdmin, role: isAdmin ? 'admin' : 'user' },
  })
  return renderWithProviders(<AdminScreen />, { queryClient })
}

beforeEach(() => {
  getAdminUsersMock.mockResolvedValue(makeAccounts())
  updateAdminUserMock.mockResolvedValue({
    ...makeAccounts()[1],
    role: 'admin',
  })
  deleteAdminUserMock.mockResolvedValue({ message: 'Account deleted' })
})

describe('AdminScreen', () => {
  it('renders', async () => {
    renderAdmin()
    expect(await screen.findByTestId('admin-screen')).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
  })

  it('shows the accounts from the query', async () => {
    renderAdmin()

    expect(await screen.findByText('Alice Dev')).toBeInTheDocument()
    expect(screen.getByText('Bob Dev')).toBeInTheDocument()
    expect(screen.getAllByTestId('admin-row')).toHaveLength(2)
    expect(screen.getByText('bob@dev.local')).toBeInTheDocument()
    // An account that has never signed in is a pending registration.
    expect(screen.getByText('· Never signed in')).toBeInTheDocument()
    // `isSelf` is the only marker of the caller the server hands out.
    expect(screen.getByTestId('account-self')).toBeInTheDocument()
  })

  it('promotes an account and refreshes the list', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByText('Bob Dev')
    expect(getAdminUsersMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByLabelText('Actions for Bob Dev'))
    await user.click(await screen.findByTestId('admin-row-actions-role'))

    await waitFor(() => {
      expect(updateAdminUserMock).toHaveBeenCalledWith(2, { role: 'admin' })
    })
    // The list is refetched rather than patched in place: a guard rail the
    // client cannot evaluate may have changed what the server actually did.
    await waitFor(() => {
      expect(getAdminUsersMock).toHaveBeenCalledTimes(2)
    })
  })

  it("renders a guard rail's own message instead of redirecting", async () => {
    const user = userEvent.setup()
    updateAdminUserMock.mockRejectedValue(
      new ApiError(
        403,
        { message: 'You cannot change your own role.' },
        'You cannot change your own role.'
      )
    )
    renderAdmin()
    await screen.findByText('Bob Dev')

    await user.click(screen.getByLabelText('Actions for Bob Dev'))
    await user.click(await screen.findByTestId('admin-row-actions-role'))

    // The server writes these sentences to be read by the person who hit them.
    expect(await screen.findByTestId('admin-refusal')).toHaveTextContent(
      'You cannot change your own role.'
    )
  })

  it('refuses a non-admin without asking the server', async () => {
    renderAdmin({ isAdmin: false })

    expect(await screen.findByTestId('admin-forbidden')).toBeInTheDocument()
    expect(screen.getByText('You do not have access to this page')).toBeInTheDocument()
    // A 403 the client can predict is a 403 it does not need to provoke.
    expect(getAdminUsersMock).not.toHaveBeenCalled()
  })

  it('renders its error state', async () => {
    getAdminUsersMock.mockRejectedValue(
      new ApiError(500, null, 'Internal server error')
    )
    renderAdmin()

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('Accounts did not load')).toBeInTheDocument()
  })

  it('deletes an account after confirmation', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByText('Bob Dev')

    await user.click(screen.getByLabelText('Actions for Bob Dev'))
    await user.click(await screen.findByTestId('admin-row-actions-delete'))
    await user.click(await screen.findByTestId('admin-delete-confirm'))

    await waitFor(() => {
      expect(deleteAdminUserMock).toHaveBeenCalledWith(2)
    })
    await waitFor(() => {
      expect(getAdminUsersMock).toHaveBeenCalledTimes(2)
    })
  })
})
