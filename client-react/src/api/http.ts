/**
 * The one place this client talks to `/api/rest`.
 *
 * This replaces `client/src/plugins/axiosInstance.ts`. It keeps that file's two
 * genuinely cross-cutting concerns and deliberately drops its third:
 *
 *  1. **Cookie transport.** Every request is `credentials: 'include'` so the
 *     httpOnly session cookie goes out. See `docs/AUTHENTICATION.md`.
 *  2. **Session death.** A dead session bounces the whole app to `/login`.
 *     See {@link isSessionDead} — this distinction is load-bearing.
 *  3. *(dropped)* The global error dialog. The old interceptor rendered every
 *     failure in a singleton dialog controller, which is why callers needed a
 *     non-standard `suppressErrorDialog` flag to opt out. Under TanStack Query
 *     a failed request is just `query.error` / `mutation.error`, owned by the
 *     screen that asked for it — so the opt-out has nothing to opt out of.
 *
 * ## Convention
 *
 * `api/` never imports from `queries/`. A module in here returns parsed data or
 * throws {@link ApiError}; it holds no state, no cache, and no React. Anything
 * about *when* to fetch, what to cache it under, or what to invalidate belongs
 * in `queries/`.
 */

/** Base path every backend REST call is prefixed with (server `ROUTE_PREFIX`). */
export const PATH_PREFIX = '/api/rest'

/** Where the server renders the login page. Not part of the SPA. */
const LOGIN_URL = '/login'

/** A non-2xx response from `/api/rest`, carrying whatever the server said. */
export class ApiError extends Error {
  readonly status: number
  /** Parsed JSON body, or the raw text if it wasn't JSON. */
  readonly body: unknown

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Is this the kind of 401 that means *the session itself is gone* — as opposed
 * to ordinary in-page logic that happens to answer 401 (a wrong current
 * password on the change-password form, say)?
 *
 * The server marks exactly one case: `requireAuth` and `requireAdmin` answer
 * `401 {"message": "Unauthorized", "sessionExpired": true}` when the cookie is
 * missing, expired, or revoked. Nothing else in the API sets that flag — a
 * non-admin hitting an admin route gets `403` with no flag, because logging
 * back in would not help them.
 *
 * Getting this wrong in either direction is a real bug: redirect on every 401
 * and a mistyped password logs you out; redirect on none and a dead session
 * leaves the app showing errors forever.
 */
export function isSessionDead(status: number, body: unknown): boolean {
  if (status !== 401) return false
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { sessionExpired?: unknown }).sessionExpired === true
  )
}

/**
 * Leave the SPA for the server-rendered login page.
 *
 * A real navigation, not a router push: once the session is gone there is no
 * SPA state worth preserving, `/login` is not a route this app owns, and a
 * client-side push would leave the dead query cache in memory.
 *
 * Overridable so tests can assert the redirect without jsdom fighting them over
 * `window.location`.
 */
let navigateToLogin = () => {
  window.location.href = LOGIN_URL
}

/** Test seam. Returns a function that restores the real navigation. */
export function setLoginNavigator(fn: () => void): () => void {
  const previous = navigateToLogin
  navigateToLogin = fn
  return () => {
    navigateToLogin = previous
  }
}

/** Options accepted by {@link request}, minus the ones it owns itself. */
export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /**
   * Serialised as JSON, unless it is `FormData` - three endpoints are
   * multipart (cover image, ebook file, library import) and the browser has
   * to set the `Content-Type` itself so the boundary matches the payload.
   */
  body?: unknown
  /** Appended as a query string; `null`/`undefined` values are dropped. */
  params?: Record<string, string | number | boolean | null | undefined>
  signal?: AbortSignal
}

function buildUrl(path: string, params: RequestOptions['params']): string {
  const url = `${PATH_PREFIX}${path}`
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text === '') return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Perform one API call.
 *
 * @throws {ApiError} on any non-2xx response, *after* handling session death.
 *
 * ### Why `redirect: 'manual'`
 *
 * `requireAuth` has two failure modes, not one. An *invalid* cookie gets the
 * `401 { sessionExpired: true }` JSON above, but **no cookie at all** gets a
 * plain `302` to `/login`. With fetch's default `redirect: 'follow'` the
 * browser would chase that redirect, fetch the login *HTML page*, and hand back
 * a `200` — so the caller sees a successful request whose body is a chunk of
 * HTML, and the failure surfaces later as an incomprehensible JSON parse error.
 * `'manual'` turns it into an opaque redirect (`type === 'opaqueredirect'`,
 * `status === 0`), which is unambiguous and gets the same treatment as a dead
 * session: it *is* one.
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, params, signal } = options

  // Multipart: hand the FormData straight to fetch and let it write the
  // Content-Type. Setting that header ourselves omits the boundary, and the
  // server then parses an empty body.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const response = await fetch(buildUrl(path, params), {
    method,
    // The httpOnly session cookie. Without this, every request is anonymous.
    credentials: 'include',
    redirect: 'manual',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body === undefined || isFormData ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: isFormData ? (body as FormData) : JSON.stringify(body) }),
  })

  // No cookie at all: the server 302s to /login. See the note above.
  if (response.type === 'opaqueredirect' || response.status === 0) {
    navigateToLogin()
    throw new ApiError(401, { sessionExpired: true }, 'Session expired')
  }

  if (response.ok) {
    // 200 with an empty body is a legitimate success here (POST /book/return
    // answers `res.status(200).send()`), so `null` is a valid T for void calls.
    return (await readBody(response)) as T
  }

  const errorBody = await readBody(response)

  if (isSessionDead(response.status, errorBody)) {
    navigateToLogin()
    throw new ApiError(response.status, errorBody, 'Session expired')
  }

  const message =
    typeof errorBody === 'object' &&
    errorBody !== null &&
    typeof (errorBody as { message?: unknown }).message === 'string'
      ? (errorBody as { message: string }).message
      : `Request failed with status ${response.status}`

  throw new ApiError(response.status, errorBody, message)
}
