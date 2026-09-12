import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  changePassword,
  deleteAccount,
  deleteProfileImage,
  disableTwoFactor,
  enableTwoFactor,
  getActivity,
  getSessions,
  type PasswordChangeInput,
  type ProfileInput,
  revokeSession,
  setLeasingEnabled,
  setTheme,
  setupTwoFactor,
  type ThemeName,
  updateProfile,
  uploadProfileImage,
} from '@/api/user'
import { policyKeys, userKeys } from './keys'

/**
 * The settings screen's server state: the two lists it reads, and the nine
 * mutations it fires.
 *
 * ## Why almost everything here invalidates the policy
 *
 * `/app/policy` carries the user object the whole shell renders from — name,
 * avatar, language, `totpEnabled`, and the instance-wide `leasingEnabled` that
 * decides whether the Loans and Customers nav entries exist at all. So a
 * profile save, an avatar change, a 2FA flip and the lending toggle are all
 * *policy* mutations wearing a `/user` path, and none of them are visibly
 * finished until the policy is refetched. The old client kept the singleton in
 * sync by hand and got it wrong; here the mutation names the key.
 *
 * ## Why several also invalidate the sessions list
 *
 * Because the server revokes sessions behind the caller's back, and the list is
 * wrong the instant it does. Changing your password revokes every *other*
 * session (`docs/AUTHENTICATION.md#token_version-revoke-everywhere`); revoking
 * one revokes that one. Neither is visible to a list that is not refetched.
 */

/**
 * Active logins.
 *
 * `staleTime` is short and focus refetching is on: this list exists so somebody
 * can *notice* a session they do not recognise, and a list cached for five
 * minutes answers a question about five minutes ago. It is also the one screen
 * where a row disappearing on its own — a session that timed out — is correct
 * behaviour rather than a glitch.
 */
export const sessionsQueryOptions = queryOptions({
  queryKey: userKeys.sessions(),
  queryFn: ({ signal }) => getSessions(signal),
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
})

/** This device plus every other live login. */
export function useSessions() {
  return useQuery(sessionsQueryOptions)
}

/** Recent auth events for the caller — logins, failed logins, logouts. */
export const activityQueryOptions = queryOptions({
  queryKey: userKeys.activity(),
  queryFn: ({ signal }) => getActivity(20, signal),
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
})

/** Recent auth events for the caller. */
export function useActivity() {
  return useQuery(activityQueryOptions)
}

/** Name, email, language, region. Moves the shell's user block. */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfileInput) => updateProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
    },
  })
}

/** Replace the avatar. The policy serves it back as a data URL. */
export function useUploadProfileImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadProfileImage(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
    },
  })
}

/** Clear the avatar. */
export function useDeleteProfileImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteProfileImage(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
    },
  })
}

/**
 * Persist the display theme.
 *
 * Fire-and-forget by design: the theme is already on screen (the provider owns
 * that, and it must not wait for a round trip), and this call exists only so
 * the choice survives into the next login on another device. A failure here
 * changes nothing the user can see, so it does not invalidate the policy and
 * does not surface an error.
 */
export function useSetTheme() {
  return useMutation({
    mutationFn: (theme: ThemeName) => setTheme(theme),
  })
}

/**
 * The instance-wide lending toggle.
 *
 * Not a personal preference: it is `app_settings.leasing_enabled`, one row for
 * the whole instance, and it decides whether Loans and Customers exist in the
 * nav — for everyone. Invalidating the policy is therefore the entire point of
 * the mutation, not a tidy-up after it.
 *
 * No optimistic update. A switch that flips back a moment later is worse than
 * one that takes 80ms, and this one is changing what other people see.
 */
export function useSetLeasingEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leasingEnabled: boolean) => setLeasingEnabled(leasingEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
    },
  })
}

/**
 * Change the password.
 *
 * **This tab stays logged in.** The server reissues a cookie for this device
 * with the same `sid` before answering, so there is nothing to do about the
 * current session and nothing to redirect. Every *other* session is revoked,
 * which is why the sessions list is invalidated.
 */
export function useChangePassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PasswordChangeInput) => changePassword(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.sessions() })
      queryClient.invalidateQueries({ queryKey: userKeys.activity() })
    },
  })
}

/**
 * "Log out this device."
 *
 * Revoking the current session clears this browser's cookie too. Leaving for
 * `/login` afterwards is the screen's call, not this hook's — the hook cannot
 * know which row was pressed, and a navigation buried in a mutation is a
 * surprise.
 */
export function useRevokeSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => revokeSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.sessions() })
      queryClient.invalidateQueries({ queryKey: userKeys.activity() })
    },
  })
}

/**
 * Start 2FA enrolment.
 *
 * A mutation rather than a query even though it reads like one: it *writes*
 * `users.totp_secret`, and calling it twice deliberately discards the first
 * secret. A query would be refetched on focus and silently invalidate the QR
 * code the user is in the middle of scanning.
 */
export function useSetupTwoFactor() {
  return useMutation({
    mutationFn: () => setupTwoFactor(),
  })
}

/**
 * Confirm a code and turn 2FA on.
 *
 * The response carries the backup codes, shown exactly once and stored only as
 * hashes. They live in `mutation.data` for as long as the dialog is open; the
 * dialog is what makes saving them deliberate.
 */
export function useEnableTwoFactor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => enableTwoFactor(code),
    onSuccess: () => {
      // `user.totpEnabled` lives in the policy.
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
    },
  })
}

/** Turn 2FA off. Re-auths with the account password, not a code. */
export function useDisableTwoFactor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (password: string) => disableTwoFactor(password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
    },
  })
}

/**
 * Delete the account.
 *
 * On success the browser is already on its way to `/login` (see
 * `api/user.ts#deleteAccount`), so there is nothing to invalidate and no cache
 * left that matters. The mutation exists for its pending and error states.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (password: string) => deleteAccount(password),
  })
}
