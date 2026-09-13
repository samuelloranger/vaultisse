import { useState } from 'react'
import { type LocationInput, type LocationRow, locationBookCount } from '@/api/location'
import { MutedText } from '@/components/Card'
import { EntityListScreen } from '@/features/entityList/EntityListScreen'
import type { EntityFormField } from '@/features/entityList/types'
import { useDocumentTitle } from '@/lib/documentTitle'
import { useLocale } from '@/locale/LocaleProvider'
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
/** "6 copies" / "1 copy" / "Empty". The count is live server-side. */
export function LocationsScreen() {
  const { t, tPlural } = useLocale()
  useDocumentTitle(t('LOCATIONS', 'Locations'))
  const query = useLocations()
  const create = useCreateLocation()
  const update = useUpdateLocation()
  const remove = useDeleteLocation()
  const fields: EntityFormField[] = [
    {
      name: 'name',
      label: t('NAME', 'Name'),
      placeholder: t('LOCATION_NAME_PLACEHOLDER', 'e.g. Salon — bibliothèque murale'),
      autoComplete: 'off',
      inputMode: 'text',
      required: true,
    },
    {
      name: 'description',
      label: t('DESCRIPTION', 'Description'),
      placeholder: t(
        'LOCATION_DESCRIPTION_PLACEHOLDER',
        'Optional — where it is, what it holds'
      ),
      autoComplete: 'off',
      inputMode: 'text',
    },
  ]

  /** The location the "add copies" dialog is pointed at, or `null` when shut. */
  const [addingTo, setAddingTo] = useState<LocationRow | null>(null)

  return (
    <>
      <EntityListScreen<LocationRow, LocationInput>
        testID="locations-screen"
        eyebrow={t('CATALOGUE', 'Catalogue')}
        title={t('LOCATIONS', 'Locations')}
        noun={t('LOCATION', 'location')}
        deleteDescriptionKind="location"
        addLabel={t('ADD_LOCATION', 'Add location')}
        loadingLabel={t('LOADING_LOCATIONS', 'Loading locations…')}
        errorTitle={t('LOCATIONS_NOT_LOADED', 'The locations did not load')}
        emptyTitle={t('LOCATIONS_EMPTY', 'No locations yet')}
        emptyDescription={t(
          'LOCATIONS_EMPTY_DESC',
          'A location is a shelf, a room, a box — wherever a copy physically lives.'
        )}
        query={query}
        create={create}
        update={update}
        remove={remove}
        fields={fields}
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
              {locationBookCount(location) === 0
                ? t('EMPTY', 'Empty')
                : tPlural(
                    'LOCATION_COPIES',
                    locationBookCount(location),
                    '{count} copy',
                    '{count} copies'
                  )}
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
            label: t('ADD_COPIES', 'Add copies'),
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
