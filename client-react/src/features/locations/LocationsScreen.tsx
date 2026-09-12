import { useState } from 'react'
import { type LocationInput, type LocationRow, locationBookCount } from '@/api/location'
import { MutedText } from '@/components/Card'
import { EntityListScreen } from '@/features/entityList/EntityListScreen'
import type { EntityFormField } from '@/features/entityList/types'
import {
  useCreateLocation,
  useDeleteLocation,
  useLocations,
  useUpdateLocation,
} from '@/queries/location'
import { LocationAddBooksDialog } from './LocationAddBooksDialog'
import { LocationBooksPanel } from './LocationBooksPanel'

/**
 * Locations — where the physical copies actually are.
 *
 * The richest of the three catalogue screens, and the reason the pattern in
 * `features/entityList` takes a `renderExpanded` and an `extraActions` rather
 * than being three separate screens: a location row carries a live count, opens
 * to show what is on the shelf, and has a fourth action (move copies here).
 * Categories and authors use the same component with those three props absent.
 */
const FIELDS: EntityFormField[] = [
  {
    name: 'name',
    label: 'Name',
    placeholder: 'e.g. Salon — bibliothèque murale',
    autoComplete: 'off',
    inputMode: 'text',
    required: true,
  },
  {
    name: 'description',
    label: 'Description',
    placeholder: 'Optional — where it is, what it holds',
    autoComplete: 'off',
    inputMode: 'text',
  },
]

/** "6 copies" / "1 copy" / "Empty". The count is live server-side. */
function countLabel(count: number): string {
  if (count === 0) return 'Empty'
  return count === 1 ? '1 copy' : `${count} copies`
}

export function LocationsScreen() {
  const query = useLocations()
  const create = useCreateLocation()
  const update = useUpdateLocation()
  const remove = useDeleteLocation()

  /** The location the "add copies" dialog is pointed at, or `null` when shut. */
  const [addingTo, setAddingTo] = useState<LocationRow | null>(null)

  return (
    <>
      <EntityListScreen<LocationRow, LocationInput>
        testID="locations-screen"
        eyebrow="Catalogue"
        title="Locations"
        noun="location"
        addLabel="Add location"
        loadingLabel="Loading locations…"
        errorTitle="The locations did not load"
        emptyTitle="No locations yet"
        emptyDescription="A location is a shelf, a room, a box — wherever a copy physically lives."
        query={query}
        create={create}
        update={update}
        remove={remove}
        fields={FIELDS}
        getId={(location) => location.id}
        getName={(location) => location.name}
        toValues={(location) => ({
          name: location.name,
          description: location.description ?? '',
        })}
        toInput={(values) => ({
          name: values.name ?? '',
          description: values.description ?? '',
        })}
        renderMeta={(location) => (
          <>
            <MutedText testID="location-count" fontSize={13}>
              {countLabel(locationBookCount(location))}
            </MutedText>
            {location.description ? (
              <MutedText fontSize={13} numberOfLines={1}>
                {location.description}
              </MutedText>
            ) : null}
          </>
        )}
        renderExpanded={(location) => (
          <LocationBooksPanel
            location={location}
            onAddBooks={() => setAddingTo(location)}
          />
        )}
        extraActions={(location) => [
          {
            key: 'add-books',
            label: 'Add copies',
            onSelect: () => setAddingTo(location),
          },
        ]}
      />

      {addingTo ? (
        <LocationAddBooksDialog
          location={addingTo}
          onOpenChange={(next) => (next ? undefined : setAddingTo(null))}
        />
      ) : null}
    </>
  )
}
