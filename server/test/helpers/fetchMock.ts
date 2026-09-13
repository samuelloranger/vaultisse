/**
 * Stubs the external HTTP calls the server makes for ISBN metadata and cover
 * images (Google Books, Open Library). It replaced `jest.mock("axios")` when
 * those call sites moved to `fetch`.
 *
 * `fetch` is a global rather than a module, so there is nothing to
 * `mock.module()`: the stub is installed on `globalThis` for the duration of
 * a file and put back afterwards. That matters because `bun test` runs every
 * file in one process - a stub left in place would silently answer for every
 * file that runs later.
 *
 * The helpers below return real `Response` objects on purpose. The code under
 * test reads `response.ok`, `response.status`, `response.headers.get(...)`,
 * `response.json()` and `response.body?.cancel()`; a hand-rolled literal
 * would have to keep all five in sync with whatever the routes do next.
 */
// Imported explicitly rather than relied on as globals: bun only injects
// the test globals into test files, not into the modules they import.
import { afterAll, beforeAll, mock } from "bun:test";

const realFetch = globalThis.fetch;

/** The stub itself - set its behaviour with `mockImplementation` / `mockResolvedValue`. */
export const mockedFetch = mock();

/** Call once at the top of a test file, next to `setupTestApp()`. */
export function useMockedFetch(): void {
    beforeAll(() => {
        globalThis.fetch = mockedFetch as unknown as typeof fetch;
    });

    afterAll(() => {
        globalThis.fetch = realFetch;
    });
}

/** A JSON body, the way both metadata providers answer. */
export function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/**
 * Answer every request with the same JSON body, as a **fresh** `Response`
 * each time.
 *
 * `mockedFetch.mockResolvedValue(jsonResponse(...))` hands the identical
 * Response object to every caller, and a body can only be read once - so the
 * moment a route consults more than one provider (the ISBN lookup asks up to
 * three), the second one gets `ERR_BODY_ALREADY_USED` rather than the empty
 * answer the test meant to stage, and the route reports a provider outage
 * instead of a miss.
 */
export function alwaysJson(body: unknown, status = 200): void {
    mockedFetch.mockImplementation(() => Promise.resolve(jsonResponse(body, status)));
}

/**
 * A cover-image probe answer. The routes only look at the status and the
 * content type - they never read the bytes - so the body is a placeholder.
 */
export function imageResponse(status = 200, contentType: string | null = "image/jpeg"): Response {
    return new Response(status === 200 ? "binary" : null, {
        status,
        headers: contentType ? { "content-type": contentType } : {},
    });
}
