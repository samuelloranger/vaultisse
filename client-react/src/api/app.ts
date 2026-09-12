import { request } from './http'
import type { Policy } from './types'

/**
 * `/api/rest/app` — the application bootstrap resource.
 *
 * Thin wrapper, no caching, no state. See `queries/app.ts` for when this is
 * called and how long its result is considered fresh.
 */

/** `GET /app/policy` — current user plus every reference list. */
export function getPolicy(signal?: AbortSignal): Promise<Policy> {
  return request<Policy>('/app/policy', { signal })
}
