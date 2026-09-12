import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { YStack } from 'tamagui'
import { ScreenError } from '@/components/ScreenState'

/**
 * The root route.
 *
 * It carries the `QueryClient` in the router context, which is what lets a
 * route *loader* — code that runs before the component mounts — reach the cache.
 * That is the mechanism behind the fix described in `routes/_app.tsx`: without
 * it, a loader would have to reach for a module-level singleton client, and we
 * would be back to the pattern this rewrite is removing.
 */
export type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: ({ error }) => (
    <YStack minHeight="100dvh" justifyContent="center" backgroundColor="$background">
      <ScreenError error={error} title="The app failed to start" />
    </YStack>
  ),
  notFoundComponent: () => (
    <YStack minHeight="100dvh" justifyContent="center" backgroundColor="$background">
      <ScreenError error={new Error('That page does not exist.')} title="Not found" />
    </YStack>
  ),
})
