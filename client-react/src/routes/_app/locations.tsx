import { createFileRoute } from '@tanstack/react-router'
import { LocationsScreen } from '@/features/locations/LocationsScreen'
import { locationsQueryOptions } from '@/queries/location'

/**
 * `/app/locations`.
 *
 * `prefetchQuery`, not `ensureQueryData`: the screen has a real loading state,
 * so awaiting here would hold the navigation on a blank frame for no gain. The
 * request still starts before the component mounts, so the round trip overlaps
 * the render. Only the policy — which the shell cannot draw without — is
 * awaited, one level up in `_app.tsx`.
 *
 * The per-location book lists are deliberately *not* prefetched: ten collapsed
 * rows would mean ten requests for lists nobody has asked to see. They start
 * when a row is expanded.
 */
export const Route = createFileRoute('/_app/locations')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(locationsQueryOptions)
  },
  component: LocationsScreen,
})
