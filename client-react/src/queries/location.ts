import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  addBooksToLocation,
  createLocation,
  deleteLocation,
  getLocationBooks,
  getLocations,
  type LocationInput,
  updateLocation,
} from '@/api/location'
import { bookKeys, dashboardKeys, locationKeys, policyKeys } from './keys'

/**
 * Locations: the list, one location's books, and the four mutations.
 *
 * ## What a location mutation actually moves
 *
 * More than the locations list, which is why every mutation here names several
 * keys. A location appears in `/app/policy`'s reference lists (the book form's
 * shelf picker reads it), the dashboard counts them (`totalLocations`), and a
 * book's detail screen shows where each of its copies lives. The old client
 * kept those in sync by hand — `applicationService.setLocations(...)` after
 * every delete — and got it wrong the moment a second member was editing too.
 * Here the mutation says what it touched and the cache refetches whatever
 * happens to be mounted.
 *
 * No optimistic updates. `total_books` is computed server-side per request, so
 * a guessed local value is a guess about a shared library that another member
 * may be changing at the same moment.
 */

/** Everything the locations screen lists, counts included. */
export const locationsQueryOptions = queryOptions({
  queryKey: locationKeys.list(),
  queryFn: ({ signal }) => getLocations(signal),
  // Short: the counts move whenever anybody shelves or lends a copy.
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
})

/** The locations list. */
export function useLocations() {
  return useQuery(locationsQueryOptions)
}

/**
 * The copies shelved at one location.
 *
 * A separate query rather than a field on the list row, because the server
 * exposes it separately and because a screen showing ten locations should not
 * fetch ten book lists to render ten collapsed rows. The panel mounts when a
 * row is expanded, and that is what starts this.
 */
export function locationBooksQueryOptions(id: number) {
  return queryOptions({
    queryKey: locationKeys.books(id),
    queryFn: ({ signal }) => getLocationBooks(id, signal),
    staleTime: 30 * 1000,
  })
}

/** The copies shelved at one location. */
export function useLocationBooks(id: number) {
  return useQuery(locationBooksQueryOptions(id))
}

/**
 * Invalidate everything a change to the set of locations can be seen through.
 *
 * Deliberately a prefix sweep rather than a surgical list: these are cheap
 * endpoints, a stale shelf picker is a real bug users have hit, and a key that
 * is forgotten here fails silently and invisibly.
 */
function invalidateLocations(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: locationKeys.all })
  // `/app/policy` carries the shelf picker's list of locations.
  queryClient.invalidateQueries({ queryKey: policyKeys.all })
  // `totalLocations` is a dashboard tile.
  queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
}

/** Create a location. */
export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LocationInput) => createLocation(input),
    onSuccess: () => invalidateLocations(queryClient),
  })
}

/** Rename / re-describe a location. */
export function useUpdateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: LocationInput }) =>
      updateLocation(id, input),
    onSuccess: () => invalidateLocations(queryClient),
  })
}

/** Delete a location. */
export function useDeleteLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteLocation(id),
    onSuccess: () => invalidateLocations(queryClient),
  })
}

/**
 * Move a batch of copies onto a shelf.
 *
 * This one moves book data, not location data: the source location's count
 * drops, the destination's rises, and each moved copy's book detail now reports
 * a different shelf. So it invalidates books as well — and `locationKeys.all`
 * rather than just this location's, because the copies came *from* somewhere.
 */
export function useAddBooksToLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, codes }: { id: number; codes: string[] }) =>
      addBooksToLocation(id, codes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationKeys.all })
      queryClient.invalidateQueries({ queryKey: bookKeys.all })
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}
