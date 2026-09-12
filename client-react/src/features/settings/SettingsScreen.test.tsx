import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/http'
import type { ActivityEntry, UserSession } from '@/api/user'
import { policyKeys } from '@/queries/keys'
import { makePolicy } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { AppThemeProvider } from '@/theme/ThemeProvider'
import { SettingsScreen } from './SettingsScreen'

/**
 * The spec's four, plus the three this screen earns on its own: the
 * instance-wide lending toggle, the password change that must *not* log this
 * tab out, and the backup codes that can only be shown once.
 *
 * `api/user` is mocked and the query hooks are real, as in the dashboard
 * template — so `userKeys.sessions()`, `policyKeys.all` and the invalidation
 * each mutation declares are all genuinely exercised. `importOriginal` keeps
 * the module's pure helpers (`weakPasswordRules`) real, since they are part of
 * what the dialog does rather than part of the transport.
 */

vi.mock('@/api/user', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/user')>()
  return {
    ...actual,
    getSessions: vi.fn(),
    getActivity: vi.fn(),
    updateProfile: vi.fn(),
    uploadProfileImage: vi.fn(),
    deleteProfileImage: vi.fn(),
    setTheme: vi.fn(),
    setLeasingEnabled: vi.fn(),
    changePassword: vi.fn(),
    revokeSession: vi.fn(),
    setupTwoFactor: vi.fn(),
    enableTwoFactor: vi.fn(),
    disableTwoFactor: vi.fn(),
    deleteAccount: vi.fn(),
  }
})

import {
  changePassword,
  enableTwoFactor,
  getActivity,
  getSessions,
  setLeasingEnabled,
  setupTwoFactor,
  updateProfile,
} from '@/api/user'

const getSessionsMock = vi.mocked(getSessions)
const getActivityMock = vi.mocked(getActivity)
const updateProfileMock = vi.mocked(updateProfile)
const setLeasingEnabledMock = vi.mocked(setLeasingEnabled)
const changePasswordMock = vi.mocked(changePassword)
const setupTwoFactorMock = vi.mocked(setupTwoFactor)
const enableTwoFactorMock = vi.mocked(enableTwoFactor)

/** Shaped from the dev API's real `GET /user/sessions`. */
function makeSessions(): UserSession[] {
  return [
    {
      id: 52,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1',
      ipAddress: '203.0.113.4',
      createdDate: '2026-09-12T02:19:52.673Z',
      lastSeenDate: '2026-09-12T02:19:52.673Z',
      isCurrent: true,
    },
    {
      id: 44,
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      ipAddress: '198.51.100.9',
      createdDate: '2026-09-12T01:44:53.562Z',
      lastSeenDate: '2026-09-12T02:10:50.186Z',
      isCurrent: false,
    },
  ]
}

/** `id` is a string: `activity_log.id` is a Postgres `bigint`. */
function makeActivity(): ActivityEntry[] {
  return [
    {
      id: '55',
      action: 'login',
      metadata: { ip: '203.0.113.4' },
      createdDate: '2026-09-12T02:19:52.675Z',
    },
    {
      id: '54',
      action: 'login_failed',
      metadata: { ip: '198.51.100.200' },
      createdDate: '2026-09-12T02:05:22.661Z',
    },
  ]
}

function renderSettings(userOverrides: Record<string, unknown> = {}) {
  const queryClient = createTestQueryClient()
  const policy = makePolicy()
  queryClient.setQueryData(policyKeys.current(), {
    ...policy,
    user: { ...policy.user, ...userOverrides },
  })
  // The appearance card reads the real `useColorScheme`, and the shared render
  // helper (which this task does not own) mounts only `TamaguiProvider`. Adding
  // the theme provider here keeps the real hook in the test rather than mocking
  // the one piece of this screen that owns client state.
  return renderWithProviders(
    <AppThemeProvider>
      <SettingsScreen />
    </AppThemeProvider>,
    { queryClient }
  )
}

beforeEach(() => {
  getSessionsMock.mockResolvedValue(makeSessions())
  getActivityMock.mockResolvedValue(makeActivity())
  updateProfileMock.mockResolvedValue({ message: 'User updated successfully' })
  setLeasingEnabledMock.mockResolvedValue({
    message: 'Leasing preference updated successfully',
  })
  changePasswordMock.mockResolvedValue({
    success: true,
    message: 'Password updated successfully',
  })
  setupTwoFactorMock.mockResolvedValue({
    secret: 'JBSWY3DPEHPK3PXP',
    qrCodeDataUrl: 'data:image/png;base64,AAAA',
  })
  enableTwoFactorMock.mockResolvedValue({
    success: true,
    backupCodes: ['A1B2C3D4-E5F6G7H8', 'I9J0K1L2-M3N4O5P6'],
  })
})

describe('SettingsScreen', () => {
  it('renders', async () => {
    renderSettings()
    expect(await screen.findByTestId('settings-screen')).toBeInTheDocument()
    expect(screen.getByText('Your account')).toBeInTheDocument()
    expect(screen.getByTestId('settings-profile')).toBeInTheDocument()
  })

  it('shows the policy, the sessions and the activity', async () => {
    renderSettings()

    // From the policy, already in the cache — no spinner, first frame.
    expect(await screen.findByTestId('settings-screen')).toBeInTheDocument()
    expect(screen.getByTestId('profile-email')).toHaveValue('alice@dev.local')
    expect(screen.getByTestId('twofactor-state')).toHaveTextContent('Off')

    // From GET /user/sessions.
    await waitFor(() => {
      expect(screen.getAllByTestId('session-row')).toHaveLength(2)
    })
    expect(screen.getByText('Safari · iPhone')).toBeInTheDocument()
    expect(screen.getByTestId('session-current')).toBeInTheDocument()

    // From GET /user/activity. A failed attempt is the row worth noticing.
    expect(await screen.findByText('Failed sign-in attempt')).toBeInTheDocument()
    expect(screen.getAllByTestId('activity-row')).toHaveLength(2)
  })

  it('saves the profile and invalidates the policy', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderSettings()
    await screen.findByTestId('settings-screen')

    // Nothing has changed yet, so there is nothing to save. (Tamagui's Button
    // is a div with `role="button"`, so the disabled state is `aria-disabled`
    // rather than the native attribute — which is also what a screen reader
    // reads.)
    expect(screen.getByTestId('profile-save')).toHaveAttribute('aria-disabled', 'true')

    await user.clear(screen.getByTestId('profile-name'))
    await user.type(screen.getByTestId('profile-name'), 'Alice Devereux')
    await user.click(screen.getByTestId('profile-save'))

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith({
        name: 'Alice Devereux',
        email: 'alice@dev.local',
        language: 'en',
        region: 'US',
      })
    })
    // The shell renders the user from the policy, so the save is not finished
    // until the policy is refetched.
    await waitFor(() => {
      expect(queryClient.getQueryState(policyKeys.current())?.isInvalidated).toBe(true)
    })
  })

  it('flips the instance-wide lending toggle', async () => {
    const user = userEvent.setup()
    renderSettings({ leasingEnabled: true })
    await screen.findByTestId('settings-lending')

    await user.click(screen.getByTestId('lending-toggle'))

    await waitFor(() => {
      expect(setLeasingEnabledMock).toHaveBeenCalledWith(false)
    })
  })

  it('changes the password without logging this tab out', async () => {
    const user = userEvent.setup()
    renderSettings()
    await screen.findByTestId('settings-screen')
    expect(getSessionsMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('password-open'))
    await user.type(await screen.findByTestId('password-current'), 'DevPass1!')
    await user.type(screen.getByTestId('password-new'), 'NewDevPass2!')
    await user.type(screen.getByTestId('password-confirm'), 'NewDevPass2!')
    await user.click(screen.getByTestId('password-submit'))

    await waitFor(() => {
      expect(changePasswordMock).toHaveBeenCalledWith({
        currentPassword: 'DevPass1!',
        newPassword: 'NewDevPass2!',
      })
    })
    // Every *other* session was revoked server-side, so the list is stale.
    await waitFor(() => {
      expect(getSessionsMock).toHaveBeenCalledTimes(2)
    })
    // …and this tab is still on the settings screen, not at /login.
    expect(screen.getByTestId('settings-screen')).toBeInTheDocument()
  })

  it('shows the backup codes once and will not let them be dismissed by accident', async () => {
    const user = userEvent.setup()
    renderSettings({ totpEnabled: false })
    await screen.findByTestId('settings-twofactor')

    await user.click(screen.getByTestId('twofactor-setup-open'))
    expect(await screen.findByTestId('twofactor-secret')).toHaveTextContent(
      'JBSWY3DPEHPK3PXP'
    )

    await user.type(screen.getByTestId('twofactor-code'), '123456')
    await user.click(screen.getByTestId('twofactor-setup-submit'))

    await waitFor(() => {
      expect(enableTwoFactorMock).toHaveBeenCalledWith('123456')
    })

    const codes = await screen.findByTestId('twofactor-codes')
    expect(codes).toHaveTextContent('A1B2C3D4-E5F6G7H8')
    // The codes exist nowhere else: only hashes are stored. So the way out is
    // gated until the user says they have saved them.
    expect(screen.getByTestId('twofactor-codes-done')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await user.click(screen.getByTestId('twofactor-ack'))
    expect(screen.getByTestId('twofactor-codes-done')).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('renders its error state', async () => {
    getSessionsMock.mockRejectedValue(new ApiError(500, null, 'Internal Server Error'))
    renderSettings()

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('Sessions did not load')).toBeInTheDocument()
  })
})
