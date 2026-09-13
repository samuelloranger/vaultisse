import { useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import type { LocationRow } from '@/api/location'
import { Field } from '@/components/Field'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useAddBooksToLocation } from '@/queries/location'

/**
 * Move copies onto a shelf, by the code printed on each copy.
 *
 * `POST /location/:id/add/books` takes a batch, and only touches
 * `location_id` — a copy that is out on loan keeps its borrower and its status,
 * so reorganising the shelves while books are checked out does not quietly
 * return them.
 *
 * The old client fronted this with a camera scanner. A scanner is worth having
 * back, but as an addition: a denied camera permission, a laptop without one,
 * or a scuffed barcode all have to leave a way to finish the job, so the typed
 * field is the primary path.
 */
export function LocationAddBooksDialog({
  location,
  onOpenChange,
}: {
  location: LocationRow
  onOpenChange: (open: boolean) => void
}) {
  const [codes, setCodes] = useState('')
  const addBooks = useAddBooksToLocation()
  const { t, tPlural } = useLocale()

  const parsed = codes
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter(Boolean)

  function close() {
    setCodes('')
    addBooks.reset()
    onOpenChange(false)
  }

  function submit() {
    if (parsed.length === 0) return
    addBooks.mutate({ id: location.id, codes: parsed }, { onSuccess: close })
  }

  return (
    <ResponsiveDialog
      // Mounted by the screen only while it is wanted, so `open` is constant.
      open
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t('ADD_COPIES_TO', `Add copies to ${location.name}`, {
        name: location.name,
      })}
      description={t(
        'ADD_COPIES_DESC',
        'Enter the code printed on each copy. One per line.'
      )}
      actions={
        <>
          <Button
            testID="location-add-books-cancel"
            onPress={close}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            {t('CANCEL', 'Cancel')}
          </Button>
          <Button
            testID="location-add-books-submit"
            onPress={submit}
            disabled={parsed.length === 0 || addBooks.isPending}
            opacity={parsed.length === 0 ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {addBooks.isPending
              ? t('MOVING', 'Moving…')
              : parsed.length > 1
                ? tPlural(
                    'MOVE_COPIES',
                    parsed.length,
                    'Move {count} copy',
                    'Move {count} copies'
                  )
                : t('MOVE_COPY', 'Move copy')}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <Field
          testID="location-add-books-codes"
          label={t('COPY_CODES', 'Copy codes')}
          value={codes}
          onChangeText={setCodes}
          placeholder={t('COPY_CODE_PLACEHOLDER', 'e.g. 0000000001')}
          autoComplete="off"
          // The codes are digits, but `numeric` would hide the letters some
          // libraries print. `text` keeps every code typeable.
          inputMode="text"
          onSubmit={submit}
          error={addBooks.isError ? errorMessage(addBooks.error) : null}
        />
        {parsed.length > 1 ? (
          <Text fontSize={14} color="$colorMuted">
            {t('COPIES_WILL_MOVE', `${parsed.length} copies will be moved here.`, {
              count: parsed.length,
            })}
          </Text>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
