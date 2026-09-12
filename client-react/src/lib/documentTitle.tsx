import { useMatches } from '@tanstack/react-router'
import { createContext, use, useEffect, useMemo, useState } from 'react'

/**
 * The one thing in this client that owns `document.title`.
 *
 * Before this, `index.html` set `<title>Vaultisse</title>` once and nothing ever
 * touched it again. Eleven routes, one name: every tab said "Vaultisse", every
 * history entry said "Vaultisse", and every navigation announced "Vaultisse" to
 * a screen reader — which is the same as announcing nothing, since the one
 * thing a title change is *for* is telling a non-visual user that the page
 * moved.
 *
 * ## Why the router, and why an effect
 *
 * The title belongs to the route, so it is declared on the route — as
 * `staticData.title`, which every route option object already supports and
 * which puts the name next to the loader and the component instead of in a
 * lookup table that drifts. TanStack Router's `head`/`<HeadContent />` was the
 * other candidate and is the right tool when there is a document to render on a
 * server; this client is client-only, `document.title` is one string rather
 * than a set of tags, and `head` is resolved during matching, which the *book*
 * route rules out — see below.
 *
 * ## The one dynamic title
 *
 * "Book" is a useless tab title; the book's name is the point. But the book
 * route deliberately only *prefetches* (`book.$book_id.tsx`), so at match time
 * there is no book to name, and a route-static mechanism cannot wait for one
 * without turning that prefetch into an await and holding the navigation on a
 * blank frame.
 *
 * So there are two inputs and a defined precedence rather than two competing
 * writers: the route supplies the default, a screen may supply a better one
 * through {@link useDocumentTitle}, and this provider is the only code that
 * assigns `document.title`. That ordering is not incidental — effects run child
 * first, so a screen writing the title directly would be overwritten by
 * anything the root did afterwards.
 */

/** The product name every title ends with. */
export const SITE_TITLE = 'Vaultisse'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /**
     * What this route is called in the tab, in history and on navigation.
     * Omitted on pathless layouts and on routes that only redirect.
     */
    title?: string
  }
}

/**
 * `Library · Vaultisse`.
 *
 * Page name first: a tab is narrow and truncates from the right, so the half
 * that identifies the screen has to be the half that survives. A missing page
 * name falls back to the product alone rather than rendering a stray separator.
 */
export function formatDocumentTitle(page?: string | null): string {
  return page ? `${page} · ${SITE_TITLE}` : SITE_TITLE
}

type SetOverride = (title: string | null) => void

const OverrideContext = createContext<SetOverride>(() => {})

/**
 * Drives `document.title` from the matched route, and lets one screen refine it.
 *
 * Mounted once, in the root route.
 */
export function DocumentTitle({ children }: { children: React.ReactNode }) {
  const matches = useMatches()
  const [override, setOverride] = useState<string | null>(null)

  // The deepest match that names itself wins, so a child route overrides the
  // layout it sits in rather than the other way round.
  const routeTitle = useMemo(() => {
    for (let i = matches.length - 1; i >= 0; i--) {
      const title = matches[i].staticData?.title
      if (title) return title
    }
    return null
  }, [matches])

  useEffect(() => {
    document.title = formatDocumentTitle(override ?? routeTitle)
  }, [override, routeTitle])

  return <OverrideContext value={setOverride}>{children}</OverrideContext>
}

/**
 * Give the current screen a more specific title than its route's.
 *
 * Pass `undefined` while the name is still loading: the route's own title
 * stands in, so the tab reads "Book · Vaultisse" for the moment before it reads
 * "The Dispossessed · Vaultisse" — never a stale name from the *previous* book,
 * which is what clearing on every change rather than only on unmount buys.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  const setOverride = use(OverrideContext)

  useEffect(() => {
    setOverride(title ?? null)
    return () => setOverride(null)
  }, [title, setOverride])
}
