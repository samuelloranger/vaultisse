import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/http'

/**
 * The app's single QueryClient.
 *
 * Exported as a factory as well as a shared instance: tests build a fresh
 * client per test (see `src/test/renderWithProviders.tsx`) so state never leaks
 * between them, while the app itself wants exactly one.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Per-query `staleTime` is set in queries/*.ts, deliberately: how long
        // a resource stays fresh is a fact about that resource, not a global.
        refetchOnWindowFocus: true,
        retry(failureCount, error) {
          // A 4xx is an answer, not a hiccup — retrying it wastes the user's
          // time and, for a dead session, races the /login navigation.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false
          }
          return failureCount < 2
        },
      },
      mutations: {
        // Never retry a mutation by default: POST /book/return is not
        // idempotent in its side effects (it writes loan history rows).
        retry: false,
      },
    },
  })
}

export const queryClient = createQueryClient()
