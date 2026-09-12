import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DocumentTitle,
  formatDocumentTitle,
  SITE_TITLE,
  useDocumentTitle,
} from './documentTitle'

/**
 * These go through a real router rather than rendering `DocumentTitle` with a
 * stubbed match list, because the thing being tested is that a *navigation*
 * changes the title — which is the whole complaint. A hand-fed list of matches
 * would pass whether or not the wiring to the router works.
 */

function BookScreenStub({ name }: { name?: string }) {
  useDocumentTitle(name)
  return <div>{name ?? 'loading'}</div>
}

function buildRouter(bookName?: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <DocumentTitle>
        <Outlet />
      </DocumentTitle>
    ),
  })
  const index = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    staticData: { title: 'Dashboard' },
    component: () => <div>dashboard</div>,
  })
  const library = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library',
    staticData: { title: 'Library' },
    component: () => <div>library</div>,
  })
  const book = createRoute({
    getParentRoute: () => rootRoute,
    path: '/book',
    staticData: { title: 'Book' },
    component: () => <BookScreenStub name={bookName} />,
  })
  const untitled = createRoute({
    getParentRoute: () => rootRoute,
    path: '/untitled',
    component: () => <div>untitled</div>,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([index, library, book, untitled]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

beforeEach(() => {
  document.title = 'Vaultisse'
})

describe('formatDocumentTitle', () => {
  it('puts the page first, because a tab truncates from the right', () => {
    expect(formatDocumentTitle('Library')).toBe(`Library · ${SITE_TITLE}`)
  })

  it('falls back to the product alone rather than a stray separator', () => {
    expect(formatDocumentTitle(undefined)).toBe(SITE_TITLE)
    expect(formatDocumentTitle(null)).toBe(SITE_TITLE)
    expect(formatDocumentTitle('')).toBe(SITE_TITLE)
  })
})

describe('DocumentTitle', () => {
  it('titles the first screen from its route', async () => {
    const router = buildRouter()
    render(<RouterProvider router={router} />)

    await screen.findByText('dashboard')
    await waitFor(() => expect(document.title).toBe('Dashboard · Vaultisse'))
  })

  it('retitles on navigation', async () => {
    const router = buildRouter()
    render(<RouterProvider router={router} />)
    await screen.findByText('dashboard')

    router.history.push('/library')

    await screen.findByText('library')
    await waitFor(() => expect(document.title).toBe('Library · Vaultisse'))
  })

  it('lets a screen name itself more specifically than its route', async () => {
    const router = buildRouter('The Dispossessed')
    render(<RouterProvider router={router} />)
    router.history.push('/book')

    await screen.findByText('The Dispossessed')
    await waitFor(() => expect(document.title).toBe('The Dispossessed · Vaultisse'))
  })

  it('uses the route title while the specific one is still loading', async () => {
    const router = buildRouter(undefined)
    render(<RouterProvider router={router} />)
    router.history.push('/book')

    await screen.findByText('loading')
    // Not a stale name from a previous book, and not a bare "Vaultisse".
    await waitFor(() => expect(document.title).toBe('Book · Vaultisse'))
  })

  it('drops a screen override when that screen goes away', async () => {
    const router = buildRouter('The Dispossessed')
    render(<RouterProvider router={router} />)
    router.history.push('/book')
    await waitFor(() => expect(document.title).toBe('The Dispossessed · Vaultisse'))

    router.history.push('/library')

    await screen.findByText('library')
    await waitFor(() => expect(document.title).toBe('Library · Vaultisse'))
  })

  it('falls back to the product name for a route that names nothing', async () => {
    const router = buildRouter()
    render(<RouterProvider router={router} />)
    router.history.push('/untitled')

    await screen.findByText('untitled')
    await waitFor(() => expect(document.title).toBe('Vaultisse'))
  })
})
