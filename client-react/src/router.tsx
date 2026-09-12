import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/**
 * Build the router.
 *
 * `basepath: '/app'` matches Vite's `base: '/app/'` and the server's catch-all
 * for `/app` and `/app/*`, which is what makes a hard refresh on a deep link
 * boot the app instead of 404ing.
 *
 * A factory rather than a module-level instance so tests can build a router
 * with their own QueryClient — the same reason `createQueryClient` is a
 * factory. The app builds exactly one, in `main.tsx`.
 */
export function buildRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    basepath: '/app',
    context: { queryClient },
    // Screens own their loading UI; the router should not hold a navigation on
    // a blank frame waiting for one.
    defaultPendingMs: 0,
    scrollRestoration: true,
  })
}

export type AppRouter = ReturnType<typeof buildRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
