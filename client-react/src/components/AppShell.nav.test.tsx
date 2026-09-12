import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { policyKeys } from '@/queries/keys'
import { makePolicy } from '@/test/fixtures'
import { createTestQueryClient } from '@/test/renderWithProviders'
import { AppThemeProvider } from '@/theme/ThemeProvider'
import { AppShell, NavList } from './AppShell'

/**
 * Which nav row is lit, and on which route.
 *
 * This is the one part of the nav that cannot be tested the way
 * `AppShell.test.tsx` tests the gates. `visibleNavItems` is an array filter and
 * needs no router; "is this row the current one" is a question only the router
 * can answer, and answering it by hand — comparing `location.pathname` — is the
 * bug this is guarding against, not the implementation.
 *
 * A stub route tree rather than the app's own: what is under test is the
 * `activeOptions` rule, and the real tree would drag every screen, loader and
 * query into the assertion.
 */

const ROUTES = [
  '/',
  '/library/search',
  '/locations',
  '/categories',
  '/authors',
  '/loans',
  '/customers',
  '/profile',
  '/admin',
  // A child of `/locations`, so the default prefix match has something to
  // match: a section stays lit on its own sub-routes.
  '/locations/$id',
] as const

function renderAt(
  pathname: string,
  inside: (props: { children: React.ReactNode }) => React.ReactNode
) {
  const rootRoute = createRootRoute({
    component: () => inside({ children: <Outlet /> }),
  })
  const children = ROUTES.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null })
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren(children),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  const queryClient = createTestQueryClient()
  // What the `_app` loader has already put there by the time the shell renders.
  queryClient.setQueryData(policyKeys.current(), makePolicy())

  render(
    <QueryClientProvider client={queryClient}>
      {/* The real provider, not a bare `TamaguiProvider`: `AppShell`'s theme
          toggle reads `useColorScheme()` and throws without it. */}
      <AppThemeProvider>
        {/* biome-ignore lint/suspicious/noExplicitAny: a stub tree, not the app's registered router */}
        <RouterProvider router={router as any} />
      </AppThemeProvider>
    </QueryClientProvider>
  )
}

/** Just the rows, with no shell around them. */
function renderNavAt(pathname: string) {
  renderAt(pathname, ({ children }) => (
    <>
      <NavList />
      {children}
    </>
  ))
}

/** The whole shell, so the drawer is in the tree the way the app has it. */
function renderShellAt(pathname: string) {
  renderAt(pathname, ({ children }) => <AppShell>{children}</AppShell>)
}

/** The row the router considers current, by its label. */
async function currentRow(): Promise<string[]> {
  await screen.findByTestId('nav-Dashboard')
  return await waitFor(() => {
    const marked = document.querySelectorAll('[aria-current="page"]')
    return [...marked].map((el) => el.getAttribute('data-testid') ?? '?')
  })
}

describe('the selected nav row', () => {
  it('marks the dashboard on the dashboard', async () => {
    renderNavAt('/')
    expect(await currentRow()).toEqual(['nav-Dashboard'])
  })

  it('moves to the row you navigated to', async () => {
    renderNavAt('/locations')
    expect(await currentRow()).toEqual(['nav-Locations'])
  })

  it('does not light the dashboard on every screen', async () => {
    // `/` is the root route and every other path is under it, so "starts with
    // `/`" is true everywhere. Router 1.170 happens not to answer it that way
    // — its prefix test also requires a `/` boundary — so this passes with or
    // without `activeOptions={{ exact: true }}` today. It is here because it is
    // the rule, not because it is currently the only thing enforcing it: a nav
    // that lights two rows at once is a regression whichever layer causes it.
    renderNavAt('/library/search')
    const marked = await currentRow()
    expect(marked).not.toContain('nav-Dashboard')
    expect(marked).toEqual(['nav-Library'])
  })

  it('keeps a section lit on its child route', async () => {
    renderNavAt('/locations/3')
    expect(await currentRow()).toEqual(['nav-Locations'])
  })

  it('paints the selected row differently from its neighbours', async () => {
    // The defect this replaces was not a missing attribute — `navActiveBg` was
    // defined and never used, so the selected row looked exactly like every
    // other row. Asserting only on `aria-current` would pass with no highlight
    // at all, so this compares what is actually on the element.
    renderNavAt('/locations')
    const selected = await screen.findByTestId('nav-Locations')
    const other = await screen.findByTestId('nav-Categories')

    const rowOf = (link: HTMLElement) => link.firstElementChild as HTMLElement
    expect(rowOf(selected).className).not.toEqual(rowOf(other).className)
  })
})

/**
 * The drawer's own contents, when the drawer is shut.
 *
 * Separate from the rows above because it is not about *which* row is lit — it
 * is about the drawer being in the tab order at all. Tamagui's `Sheet` keeps
 * its children mounted and parked below the viewport when closed, and the
 * mobile drawer is in the tree at **every** width (above `sm` it is simply
 * never opened), so before this a keyboard user on a desktop tabbed off the
 * bottom of the page into ten rows of a nav they could not see.
 *
 * jsdom reports no media match, which is the narrow layout, so what is asserted
 * here is the closed-and-narrow case; the desktop case is the same `Sheet` with
 * `open` false for a second reason.
 */
describe('the closed nav drawer', () => {
  it('is not in the document', async () => {
    renderShellAt('/')

    // The shell itself is up…
    expect(await screen.findByTestId('app-bar')).toBeInTheDocument()
    // …and the drawer's contents are not.
    expect(screen.queryByTestId('close-nav')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-Dashboard')).not.toBeInTheDocument()
  })

  it('appears when it is opened', async () => {
    renderShellAt('/')

    ;(await screen.findByTestId('open-nav')).click()

    expect(await screen.findByTestId('nav-Dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('close-nav')).toBeInTheDocument()
  })
})
