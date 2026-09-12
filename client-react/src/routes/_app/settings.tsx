import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/app/settings` — the old path, kept as a redirect to `/app/profile`.
 *
 * The screen was renamed, not moved: everything on it is still here. A route
 * that only redirects is the cheapest way to keep a bookmark, a link in an old
 * email and anything a browser autocompleted from history working, and it costs
 * a file with no component in it.
 *
 * `replace` so the redirect does not sit in the history stack — without it,
 * Back from the profile screen lands on `/settings`, which redirects forward
 * again and traps the user.
 */
export const Route = createFileRoute('/_app/settings')({
  beforeLoad: () => {
    throw redirect({ to: '/profile', replace: true })
  },
})
