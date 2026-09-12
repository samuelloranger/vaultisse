import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminAccount } from '@/api/admin'
import { ApiError } from '@/api/http'
import { parseTabParam } from '@/components/ScreenTabs'
import { policyKeys } from '@/queries/keys'
import { makePolicy } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { ADMIN_TAB_VALUES, AdminScreen, type AdminTab } from './AdminScreen'

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
  getInstanceSettings: vi.fn(),
  updateInstanceSettings: vi.fn(),
}))

import {
  deleteAdminUser,
  getAdminUsers,
  getInstanceSettings,
  type InstanceSettings,
  updateAdminUser,
  updateInstanceSettings,
} from '@/api/admin'

const getAdminUsersMock = vi.mocked(getAdminUsers)
const updateAdminUserMock = vi.mocked(updateAdminUser)
const deleteAdminUserMock = vi.mocked(deleteAdminUser)
const getInstanceSettingsMock = vi.mocked(getInstanceSettings)
const updateInstanceSettingsMock = vi.mocked(updateInstanceSettings)

/** Shaped from the dev API's real `GET /admin/settings`. */
function makeSettings(overrides: Partial<InstanceSettings> = {}): InstanceSettings {
  return {
    leasingEnabled: true,
    registrationRequiresApproval: false,
    registrationApprovalFromEnv: true,
    defaultLanguage: 'en',
    defaultRegion: 'US',
    defaultTheme: 'beige',
    ...overrides,
  }
}

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

function renderAdmin({
  isAdmin = true,
  tab,
  onTabChange,
}: {
  isAdmin?: boolean
  /** What the route reads off `?tab=`. Omitted, the screen keeps it locally. */
  tab?: AdminTab
  onTabChange?: (next: AdminTab) => void
} = {}) {
  const queryClient = createTestQueryClient()
  const policy = makePolicy()
  // What the `_app` loader puts there before this screen mounts.
  queryClient.setQueryData(policyKeys.current(), {
    ...policy,
    user: { ...policy.user, isAdmin, role: isAdmin ? 'admin' : 'user' },
  })
  return renderWithProviders(<AdminScreen tab={tab} onTabChange={onTabChange} />, {
    queryClient,
  })
}

beforeEach(() => {
  getAdminUsersMock.mockResolvedValue(makeAccounts())
  getInstanceSettingsMock.mockResolvedValue(makeSettings())
  updateInstanceSettingsMock.mockImplementation(async (patch) => ({
    ...makeSettings(),
    ...patch,
  }))
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
    expect(screen.getByText('Administration')).toBeInTheDocument()
    expect(await screen.findByTestId('admin-accounts')).toBeInTheDocument()
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

  it('shows the account count on the Accounts tab', async () => {
    renderAdmin()
    expect(await screen.findByText('2 accounts')).toBeInTheDocument()
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

  /**
   * The tabs. The interesting assertions are the ones about what Tamagui
   * actually does rather than what its docs say it does - `@tamagui/tabs`
   * composes `@tamagui/roving-focus`, and `components/ScreenTabs.tsx` leans on
   * that composition instead of re-implementing the WAI-ARIA tabs pattern, so
   * this is where that leaning is checked.
   */
  it('marks exactly one tab selected and keeps the rest out of the tab order', async () => {
    renderAdmin()
    await screen.findByTestId('admin-screen')

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(screen.getByRole('tablist')).toHaveAccessibleName('Admin sections')

    // Roving tabindex: one stop for the whole bar, not three.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[2]).toHaveAttribute('tabindex', '-1')

    // The panel is wired to its tab both ways.
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0].id)
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id)
  })

  it('moves between tabs with the arrow keys and commits on Enter', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByTestId('admin-screen')

    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveFocus()

    // `activationMode="manual"`: arrowing past a tab must not open it, or
    // reaching the third would fire the second one's request on the way.
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(getInstanceSettingsMock).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(await screen.findByTestId('admin-library')).toBeInTheDocument()
  })

  it('keeps the focused tab as the only tab stop while manual navigation is pending', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByTestId('admin-screen')

    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')

    // Focus and selection deliberately split in manual mode: arrows move the
    // roving stop while Enter/Space chooses the panel.
    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('tabindex', '0')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{End}')
    expect(tabs[2]).toHaveFocus()
    expect(tabs[2]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveFocus()
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[2]).toHaveAttribute('tabindex', '-1')
  })

  it("does not fetch a tab's data until that tab is opened", async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByTestId('admin-accounts')

    // Accounts is the first tab, so its list is already on screen...
    expect(getAdminUsersMock).toHaveBeenCalledTimes(1)
    // ...and the other two panels do not exist yet, so neither does their query.
    expect(getInstanceSettingsMock).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('admin-tabs-tab-new-accounts'))
    await screen.findByTestId('admin-registration')
    expect(getInstanceSettingsMock).toHaveBeenCalledTimes(1)
  })

  /**
   * Moved here from `features/settings/SettingsScreen.test.tsx` along with the
   * card. Invalidating the policy is the whole mutation, not a tidy-up after
   * it: `AppShell` reads `leasingEnabled` off the policy to decide whether the
   * Loans and Customers nav entries exist, so a toggle that did not invalidate
   * would move the switch and leave the nav behind.
   */
  it('flips the instance-wide lending toggle and invalidates the policy', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderAdmin()
    await screen.findByTestId('admin-screen')

    await user.click(screen.getByTestId('admin-tabs-tab-library'))
    await screen.findByTestId('settings-lending')

    await user.click(screen.getByTestId('lending-toggle'))

    await waitFor(() => {
      expect(updateInstanceSettingsMock).toHaveBeenCalledWith({ leasingEnabled: false })
    })
    await waitFor(() => {
      expect(queryClient.getQueryState(policyKeys.current())?.isInvalidated).toBe(true)
    })
  })

  it('sets the registration defaults for the next account only', async () => {
    const user = userEvent.setup()
    renderAdmin()
    await screen.findByTestId('admin-screen')

    await user.click(screen.getByTestId('admin-tabs-tab-new-accounts'))
    await screen.findByTestId('admin-registration')

    // The instance is still inheriting approval from the environment, and the
    // panel says so rather than showing a value it does not own.
    expect(screen.getByTestId('approval-from-env')).toBeInTheDocument()

    await user.selectOptions(screen.getByTestId('default-language'), 'es')
    await waitFor(() => {
      expect(updateInstanceSettingsMock).toHaveBeenCalledWith({ defaultLanguage: 'es' })
    })

    await user.click(screen.getByTestId('approval-toggle'))
    await waitFor(() => {
      expect(updateInstanceSettingsMock).toHaveBeenCalledWith({
        registrationRequiresApproval: true,
      })
    })
  })

  it('opens the tab the URL asks for, and falls back for one it does not know', async () => {
    const { unmount } = renderAdmin({ tab: 'new-accounts' })
    expect(await screen.findByTestId('admin-registration')).toBeInTheDocument()
    unmount()

    // `parseTabParam` is what the route runs on the raw param; an unknown value
    // has to land on the first tab rather than on an empty frame.
    expect(parseTabParam('nonsense', ADMIN_TAB_VALUES)).toBe('accounts')
    expect(parseTabParam(undefined, ADMIN_TAB_VALUES)).toBe('accounts')
  })

  it('reports the chosen tab so the route can put it in the URL', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    renderAdmin({ onTabChange })
    await screen.findByTestId('admin-screen')

    await user.click(screen.getByTestId('admin-tabs-tab-library'))
    expect(onTabChange).toHaveBeenCalledWith('library')
  })

  it('refuses a non-admin before any tab is drawn', async () => {
    renderAdmin({ isAdmin: false })

    expect(await screen.findByTestId('admin-forbidden')).toBeInTheDocument()
    // All three tabs are admin-only, so the refusal replaces the bar rather
    // than sitting inside one of them.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(getInstanceSettingsMock).not.toHaveBeenCalled()
  })
})
