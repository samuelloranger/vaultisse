import { ApiError, request } from './http'

/**
 * `/api/rest/user` — the caller's own account.
 *
 * Everything here acts on the account behind the session cookie; no endpoint in
 * this module takes a user id, and none of them can be aimed at somebody else.
 * Administering *other* accounts is `api/admin.ts`, a different resource behind
 * a different middleware.
 *
 * Two documents define this surface and both are worth having open while
 * editing it: `docs/SETTINGS.md` (profile, preferences, the lending toggle,
 * account deletion) and `docs/AUTHENTICATION.md` (sessions, password,
 * two-factor, the activity log). The second one is the reason several of these
 * calls have consequences that are not visible in their signature — see the
 * notes on {@link changePassword} and {@link revokeSession}.
 */

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Body of `PUT /user`. All four columns are written on every save. */
export type ProfileInput = {
  name: string
  email: string
  /** UI language code — `users.language`. */
  language: string
  /** ISO country code — `users.region`. */
  region: string
}

/** `PUT /user` — name, email, language, region. */
export function updateProfile(input: ProfileInput): Promise<{ message: string }> {
  return request<{ message: string }>('/user', { method: 'PUT', body: input })
}

/**
 * `POST /user/image` — replace the profile picture.
 *
 * Multipart, field name `image`; PNG or JPEG only, 2MB cap, both enforced
 * server-side by multer. `request` hands `FormData` straight to fetch so the
 * browser writes the boundary itself.
 */
export function uploadProfileImage(file: File): Promise<{ message: string }> {
  const form = new FormData()
  form.append('image', file)
  return request<{ message: string }>('/user/image', { method: 'POST', body: form })
}

/** `DELETE /user/image` — back to the initials avatar. */
export function deleteProfileImage(): Promise<{ message: string }> {
  return request<{ message: string }>('/user/image', { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** `users.theme`. The React client renders these as its light and dark themes. */
export type ThemeName = 'beige' | 'library'

/** `PATCH /user/theme` — persist the display preference for the next login. */
export function setTheme(theme: ThemeName): Promise<{ message: string }> {
  return request<{ message: string }>('/user/theme', {
    method: 'PATCH',
    body: { theme },
  })
}

/*
 * Lending used to be `setLeasingEnabled` here, calling `PATCH /user/leasing`.
 * It is not a personal preference — it is `app_settings.leasing_enabled`, one
 * row shared by every account, and flipping it moves the Loans and Borrowers
 * nav entries for everybody. It now lives in `api/admin.ts` as part of the
 * instance settings, behind `requireAdmin`. The *value* still arrives for every
 * account inside the policy's `user` object, because the nav needs it; only the
 * write moved.
 */

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export type PasswordChangeInput = {
  currentPassword: string
  newPassword: string
}

/**
 * `POST /user/password`.
 *
 * Three things happen server-side that the caller has to account for:
 *
 *  1. `users.token_version` is bumped, which invalidates **every** token issued
 *     for this account before now.
 *  2. A fresh cookie is issued for *this* device with the same `sid`, so the
 *     tab that made the change stays logged in. Do not log the user out here.
 *  3. Every other `user_sessions` row is revoked, so the active-sessions list
 *     is stale the moment this resolves.
 *
 * A wrong current password answers `401 {"message": "Invalid current
 * password."}` — a 401 **without** `sessionExpired`, which is exactly why
 * `api/http.ts` refuses to redirect on an unflagged 401. A weak new password
 * answers `400` with a `missing` array of the rules it failed.
 */
export function changePassword(input: PasswordChangeInput): Promise<{
  success: boolean
  message: string
}> {
  return request<{ success: boolean; message: string }>('/user/password', {
    method: 'POST',
    body: input,
  })
}

/** The `400` body from {@link changePassword} when the new password is too weak. */
export type WeakPasswordBody = {
  success: false
  message: string
  missing: string[]
}

/** The unmet password rules from a `400`, or `null` if this is another error. */
export function weakPasswordRules(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null
  const body = error.body as Partial<WeakPasswordBody> | null
  return Array.isArray(body?.missing) ? body.missing : null
}

// ---------------------------------------------------------------------------
// Sessions and activity
// ---------------------------------------------------------------------------

/** A row from `GET /user/sessions` — one live login, not one user. */
export type UserSession = {
  id: number
  userAgent: string | null
  ipAddress: string | null
  createdDate: string
  lastSeenDate: string
  /** The device asking. Revoking it logs this tab out. */
  isCurrent: boolean
}

/**
 * `GET /user/sessions` — this device plus every other still-live login.
 *
 * "Live" means un-revoked *and* seen within `SESSION_TIME`, so a session that
 * quietly timed out drops off by itself. A short list is therefore normal and
 * an empty one is impossible: the caller is always in it.
 */
export function getSessions(signal?: AbortSignal): Promise<UserSession[]> {
  return request<UserSession[]>('/user/sessions', { signal })
}

/**
 * `DELETE /user/sessions/:id` — "log out this device".
 *
 * Scoped server-side to the caller's own sessions, so an id belonging to
 * somebody else is a 404 rather than a leak. Revoking the **current** session
 * also clears this browser's cookie in the same response; the screen is
 * responsible for leaving for `/login` afterwards, because a cleared cookie
 * with the SPA still mounted is a tab that only looks logged in.
 */
export function revokeSession(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/user/sessions/${id}`, { method: 'DELETE' })
}

/** The auth actions `GET /user/activity` can report. */
export type ActivityAction = 'login' | 'login_failed' | 'logout' | 'password_changed'

/**
 * A row from `GET /user/activity`.
 *
 * `id` is a string: `activity_log.id` is a `bigint`, and node-postgres returns
 * bigints as strings because they do not all fit in a JS number. Typed honestly
 * rather than coerced — nothing here does arithmetic on it.
 */
export type ActivityEntry = {
  id: string
  action: ActivityAction | string
  metadata: { ip?: string; username?: string; stage?: string } | null
  createdDate: string
}

/**
 * `GET /user/activity` — the caller's own auth events, newest first.
 *
 * Deliberately includes `login_failed`: "somebody tried your password and
 * failed" is the single most useful thing this list can tell you, and it is
 * only visible because the server attributes a wrong-password attempt to the
 * account whose username matched.
 */
export function getActivity(
  limit = 20,
  signal?: AbortSignal
): Promise<ActivityEntry[]> {
  return request<ActivityEntry[]>('/user/activity', { params: { limit }, signal })
}

// ---------------------------------------------------------------------------
// Two-factor
// ---------------------------------------------------------------------------

/** `POST /user/2fa/setup` — a new secret, stored but not yet in force. */
export type TwoFactorSetup = {
  /** The base32 secret. Must be copyable: the QR is useless on the same phone. */
  secret: string
  /** A `data:image/png;base64,...` QR encoding the same secret. */
  qrCodeDataUrl: string
}

/**
 * `POST /user/2fa/setup` — start (or restart) enrolment.
 *
 * Writes `users.totp_secret` but leaves `totp_enabled` alone, so calling it and
 * walking away changes nothing. Calling it again discards the previous secret,
 * which is what makes "start over" safe.
 */
export function setupTwoFactor(): Promise<TwoFactorSetup> {
  return request<TwoFactorSetup>('/user/2fa/setup', { method: 'POST' })
}

/**
 * `POST /user/2fa/enable` — verify a code and turn 2FA on.
 *
 * The backup codes in the response are **shown exactly once**; only bcrypt
 * hashes are stored, so a dialog dismissed before they are saved cannot be
 * recovered from anywhere. The UI is responsible for making that moment
 * deliberate.
 *
 * Rate limited to 5 attempts / 5 minutes, separately from login's limiter.
 */
export function enableTwoFactor(code: string): Promise<{
  success: boolean
  backupCodes: string[]
}> {
  return request<{ success: boolean; backupCodes: string[] }>('/user/2fa/enable', {
    method: 'POST',
    body: { code },
  })
}

/**
 * `POST /user/2fa/disable` — re-auth with the **account password**, not a TOTP
 * code.
 *
 * Deliberate asymmetry: this removes a security layer rather than adding one,
 * so it should be harder to do by accident, and a phone that is already
 * unlocked and holding the authenticator is not evidence of anything.
 */
export function disableTwoFactor(password: string): Promise<{
  success: boolean
  message: string
}> {
  return request<{ success: boolean; message: string }>('/user/2fa/disable', {
    method: 'POST',
    body: { password },
  })
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * `DELETE /user` — delete the caller's own account, password required.
 *
 * ## Why the success path looks like a failure
 *
 * The server answers a `302` to `/login` rather than JSON. `api/http.ts` uses
 * `redirect: 'manual'`, so that arrives as an opaque redirect, which it treats
 * as a dead session: it navigates the browser to `/login` and *then* throws.
 * Which is the correct outcome — the account is gone, there is nothing to stay
 * logged into — but it would surface in the UI as "something went wrong" at the
 * exact moment everything went right.
 *
 * So that one throw is swallowed here, where the reason is documented, rather
 * than special-cased in a component. A genuine 401 is indistinguishable from it
 * and gets the same treatment, which costs nothing: both end at `/login`.
 *
 * Contributions survive. The ten library tables reference the account through
 * `created_by ... ON DELETE SET NULL`, so the household's books stay on the
 * shelves and lose only their attribution.
 */
export function deleteAccount(password: string): Promise<void> {
  return request<void>('/user', { method: 'DELETE', body: { password } }).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        const body = error.body as { sessionExpired?: unknown } | null
        if (body?.sessionExpired === true) return
      }
      throw error
    }
  )
}
