import { request } from './http'
import type { Dashboard } from './types'

/**
 * `/api/rest/dashboard` — one aggregate endpoint, no mutations.
 */

/** `GET /dashboard` — every KPI tile, shelf and chart series in one call. */
export function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  return request<Dashboard>('/dashboard', { signal })
}
