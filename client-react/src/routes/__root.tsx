import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { YStack } from 'tamagui'
import { ScreenError } from '@/components/ScreenState'
import { DocumentTitle, useDocumentTitle } from '@/lib/documentTitle'
import { useLocale } from '@/locale/LocaleProvider'

/**
 * The root route.
 *
 * It carries the `QueryClient` in the router context, which is what lets a
 * route *loader* — code that runs before the component mounts — reach the cache.
 * That is the mechanism behind the fix described in `routes/_app.tsx`: without
 * it, a loader would have to reach for a module-level singleton client, and we
 * would be back to the pattern this rewrite is removing.
 *
 * It is also where `document.title` is driven from, because the root is the one
 * component that is mounted for every match and therefore the only place a
 * single owner of the title can live. See `lib/documentTitle.tsx`.
 */
export type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootError,
  notFoundComponent: NotFound,
})

function RootError({ error }: { error: unknown }) {
  const { t } = useLocale()
  return (
    <YStack minHeight="100dvh" justifyContent="center" backgroundColor="$background">
      <ScreenError
        error={error}
        title={t('APP_START_ERROR_TITLE', 'The app failed to start')}
      />
    </YStack>
  )
}

/**
 * A 404 names itself too. It has no route to carry a `staticData.title` — it is
 * what renders when no route matched — so it is the one screen that asks for
 * its title directly.
 */
function NotFound() {
  const { t } = useLocale()
  const title = t('NOT_FOUND_TITLE', 'Not found')
  useDocumentTitle(title)
  return (
    <YStack minHeight="100dvh" justifyContent="center" backgroundColor="$background">
      <ScreenError
        error={new Error(t('NOT_FOUND_DESC', 'The page was not found.'))}
        title={title}
      />
    </YStack>
  )
}

function RootLayout() {
  return (
    <DocumentTitle>
      <Outlet />
    </DocumentTitle>
  )
}
