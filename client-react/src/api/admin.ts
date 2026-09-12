import { request } from './http'

/**
 * `/api/rest/admin/users` — account administration.
 *
 * A different resource from `api/user.ts` behind a different middleware:
 * `requireAdmin` rather than `requireAuth`. Everything here is aimed at *other*
 * people's accounts by id.
 *
 * ## The 403 is not a session problem, and must not be treated as one
 *
 * `requireAdmin` fails in two distinguishable ways on purpose
 * (`docs/AUTHENTICATION.md#roles-and-the-admin-panel`):
 *
 *  - no session at all → `401 {"message": "Unauthorized", "sessionExpired":
 *    true}`, which `api/http.ts` turns into a hard navigation to `/login`;
 *  - a perfectly good session that simply is not an admin → `403 {"message":
 *    "Forbidden"}` with **no** flag, because logging back in would not help.
 *
 * The same applies to the guard rails below. A 403 here reaches the screen as
 * an `ApiError` whose `message` is the server's own sentence, and the screen's
 * job is to render that sentence — not to redirect, and not to replace it with
 * a generic one. The server's wording is written to be read by the person who
 * hit it.
 */

/**
 * One account, as the admin list reports it. Enumerated column by column
 * server-side, so the password hash, the TOTP secret and the image blob never
 * leave the database.
 */
export type AdminAccount = {
  id: number
  /** The login handle — `users.code`. */
  code: string
  name: string
  email: string
  role: 'admin' | 'user'
  /** `true` means the account cannot authenticate at all. */
  disabled: boolean
  createdDate: string
  /** `null` for an account that has never logged in — a pending registration. */
  lastLoginDate: string | null
  /**
   * Is this the caller's own row?
   *
   * The only way the client can know. The policy payload deliberately does not
   * expose the caller's user id, and it should not have to: the three actions
   * the server refuses on yourself (demote, disable, delete) are exactly the
   * three this flag disables. The server still refuses them — this only stops
   * the UI from offering a button whose answer is already known.
   */
  isSelf: boolean
}

/** `GET /admin/users` — every account on the instance, oldest first. */
export function getAdminUsers(signal?: AbortSignal): Promise<AdminAccount[]> {
  return request<AdminAccount[]>('/admin/users', { signal })
}

/**
 * Body of `PATCH /admin/users/:id`. Both fields optional, **at least one
 * required** — an empty body is a `400`, not a no-op.
 */
export type AdminAccountPatch = {
  role?: 'admin' | 'user'
  disabled?: boolean
}

/**
 * `PATCH /admin/users/:id` — promote/demote and/or enable/disable.
 *
 * Enabling is how a registration is approved when
 * `REGISTRATION_REQUIRES_APPROVAL=true`. Disabling revokes the account's live
 * sessions immediately (and bumps `token_version`, so re-enabling it later does
 * not resurrect the tokens it was holding).
 *
 * Answers the updated account in the same shape as the list, so the cache can
 * be refreshed from the response rather than guessed at.
 *
 * `403` means a guard rail refused: the last usable admin, your own role, or
 * your own account. `404` means the account is already gone — likely deleted by
 * another admin while this list was on screen.
 */
export function updateAdminUser(
  id: number,
  patch: AdminAccountPatch
): Promise<AdminAccount> {
  return request<AdminAccount>(`/admin/users/${id}`, { method: 'PATCH', body: patch })
}

/**
 * `DELETE /admin/users/:id` — permanently remove an account.
 *
 * What it does **not** remove: everything that account contributed to the
 * shared library. Those foreign keys are `ON DELETE SET NULL`, so the books,
 * copies, files and loan history stay and lose only their "added by"
 * attribution. Saying that in the confirmation is the difference between a
 * warning someone reads and one they dismiss.
 *
 * Refuses your own account with a 403 that points at Settings instead — that
 * path asks for your password, which this one has no reason to.
 */
export function deleteAdminUser(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/users/${id}`, { method: 'DELETE' })
}
