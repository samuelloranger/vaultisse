import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@tamagui/core/reset.css'
import { queryClient } from './lib/queryClient'
import { buildRouter } from './router'
import { installGlobalStyles } from './theme/globals'
import { AppThemeProvider } from './theme/ThemeProvider'

/**
 * Entry point.
 *
 * The provider order is deliberate: the query client is outermost because the
 * router's loaders reach into it through router context, and the theme wraps the
 * router so a route's error component renders themed rather than unstyled.
 *
 * There is no bootstrap fetch here. The old client's `main.ts` awaited
 * `applicationService.fetchPolicy()` before mounting, which is what made the
 * policy a singleton in the first place; that responsibility now belongs to the
 * `_app` route's loader.
 */
installGlobalStyles()

const router = buildRouter(queryClient)

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <RouterProvider router={router} />
      </AppThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
