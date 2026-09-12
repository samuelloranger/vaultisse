import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RenderResult, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { TamaguiProvider } from 'tamagui'
import config from '@/theme/tamagui.config'

/**
 * Render a component under the providers it expects, with a **fresh**
 * QueryClient per call so nothing leaks between tests.
 *
 * Retries are off: a test that asserts an error state should see it on the
 * first failed request, not three seconds later.
 *
 * Screens are rendered directly rather than through the router. A route module
 * in this client is four lines — a loader and a `component:` — and testing the
 * screen component with seeded cache data covers the behaviour without dragging
 * a router and a history stack into every test. Route loaders belong in the
 * Playwright pass, where there is a real server to load from.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  })
}

export type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient() }: { queryClient?: QueryClient } = {}
): RenderWithProvidersResult {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TamaguiProvider config={config} defaultTheme="light">
        {ui}
      </TamaguiProvider>
    </QueryClientProvider>
  )
  return Object.assign(result, { queryClient })
}
