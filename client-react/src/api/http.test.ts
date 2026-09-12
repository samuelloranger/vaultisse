import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, isSessionDead, request, setLoginNavigator } from './http'

/**
 * The session rules from `docs/AUTHENTICATION.md`, pinned.
 *
 * This is the highest-value test in the client: both directions of the
 * `sessionExpired` distinction are silent failures in production. Redirect on
 * every 401 and a mistyped password logs the user out; redirect on none and a
 * dead session leaves the app showing errors until someone reloads by hand.
 */

function mockFetch(response: Partial<Response> & { bodyText?: string }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    type: response.type ?? 'basic',
    text: async () => response.bodyText ?? '',
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('isSessionDead', () => {
  it('is true only for a 401 carrying the sessionExpired flag', () => {
    expect(isSessionDead(401, { message: 'Unauthorized', sessionExpired: true })).toBe(
      true
    )
    // requireAdmin's non-admin case: a valid session, so logging back in would
    // not help and the app must not bounce.
    expect(isSessionDead(403, { message: 'Forbidden' })).toBe(false)
    // In-page logic, e.g. "Invalid current password".
    expect(isSessionDead(401, { message: 'Invalid current password' })).toBe(false)
    expect(isSessionDead(401, null)).toBe(false)
    expect(isSessionDead(500, { sessionExpired: true })).toBe(false)
  })
})

describe('request', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
    vi.unstubAllGlobals()
  })

  it('sends the session cookie and parses JSON', async () => {
    const fetchMock = mockFetch({ bodyText: '{"total":7}' })
    await expect(request('/book/counters')).resolves.toEqual({ total: 7 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/rest/book/counters')
    expect(init.credentials).toBe('include')
    // Without 'manual', a missing cookie's 302 would be followed and the login
    // HTML page would come back as a 200.
    expect(init.redirect).toBe('manual')
  })

  it('navigates to /login on a 401 with sessionExpired', async () => {
    mockFetch({
      ok: false,
      status: 401,
      bodyText: '{"message":"Unauthorized","sessionExpired":true}',
    })
    const navigate = vi.fn()
    restore = setLoginNavigator(navigate)

    await expect(request('/dashboard')).rejects.toBeInstanceOf(ApiError)
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('does NOT navigate on a 401 from in-page logic', async () => {
    mockFetch({
      ok: false,
      status: 401,
      bodyText: '{"message":"Invalid current password"}',
    })
    const navigate = vi.fn()
    restore = setLoginNavigator(navigate)

    await expect(request('/user/password', { method: 'POST' })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid current password',
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does NOT navigate on a 403 from requireAdmin', async () => {
    mockFetch({ ok: false, status: 403, bodyText: '{"message":"Forbidden"}' })
    const navigate = vi.fn()
    restore = setLoginNavigator(navigate)

    await expect(request('/admin/users')).rejects.toMatchObject({ status: 403 })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('treats an opaque redirect as a dead session', async () => {
    // What the browser hands back when requireAuth 302s a cookie-less request.
    mockFetch({ ok: false, status: 0, type: 'opaqueredirect' })
    const navigate = vi.fn()
    restore = setLoginNavigator(navigate)

    await expect(request('/dashboard')).rejects.toBeInstanceOf(ApiError)
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('returns null for a 200 with an empty body', async () => {
    mockFetch({ bodyText: '' })
    // POST /book/return answers `res.status(200).send()`.
    await expect(
      request('/book/return', { method: 'POST', body: { books: [] } })
    ).resolves.toBeNull()
  })

  it('drops null and undefined query params', async () => {
    const fetchMock = mockFetch({ bodyText: '{}' })
    await request('/loans', {
      params: { page: 0, group_id: null, date_from: undefined },
    })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rest/loans?page=0')
  })
})

/**
 * Multipart bodies. Three endpoints are `multipart/form-data` (cover image,
 * ebook file, library import), and the failure here is silent: pinning
 * `Content-Type: application/json` on a FormData body omits the multipart
 * boundary, so the server parses an empty payload and the upload "succeeds"
 * with nothing attached.
 */
describe('request() with FormData', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes the FormData through without serialising it', async () => {
    mockFetch({ ok: true, status: 200, bodyText: '12' })
    const form = new FormData()
    form.append('name', 'A book')

    await request<number>('/book', { method: 'POST', body: form })

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.body).toBe(form)
    expect(typeof init.body).not.toBe('string')
  })

  it('lets the browser set Content-Type so the boundary matches', async () => {
    mockFetch({ ok: true, status: 200, bodyText: '12' })

    await request<number>('/book', { method: 'POST', body: new FormData() })

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('still sets Content-Type for a plain JSON body', async () => {
    mockFetch({ ok: true, status: 200, bodyText: '{}' })

    await request('/book/1', { method: 'PUT', body: { name: 'x' } })

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"name":"x"}')
  })
})
