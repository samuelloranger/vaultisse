import { Button, Text, XStack, YStack } from 'tamagui'
import type { LocationRow } from '@/api/location'
import { BookStockStatus } from '@/api/types'
import { MutedText } from '@/components/Card'
import { EmptyState, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useLocationBooks } from '@/queries/location'

/**
 * The copies shelved at one location — the expanded body of a location row.
 *
 * ## Why this is not a table
 *
 * The old client rendered `v-data-table-virtual` with Image / Name / Code /
 * Status columns, and Vuetify's automatic mobile stacking turned that into a
 * 55px book cover under the literal label "Image". The spec's mapping is
 * explicit: a data table gets a purpose-built card layout on mobile, not an
 * auto-stacked table. So each copy is title-first with its code and status on a
 * muted second line, at every width — there is no second layout to keep in
 * sync, and nothing to overflow sideways.
 *
 * The cover thumbnail is dropped here on purpose. In a list whose job is "what
 * is on this shelf", a 30px cover is decoration that costs a request each.
 *
 * Mounted only while its row is expanded, which is what starts the query.
 */

/** `book_stocks.status` as something a person can read. */
function statusLabel(
  status: number,
  t: (
    code: string,
    fallback: string,
    values?: Record<string, string | number>
  ) => string
): string {
  switch (status) {
    case BookStockStatus.Available:
      return t('AVAILABLE', 'Available')
    case BookStockStatus.NotAvailable:
      return t('NOT_AVAILABLE', 'Not available')
    case BookStockStatus.Booked:
      return t('ON_LOAN', 'On loan')
    case BookStockStatus.Damaged:
      return t('DAMAGED', 'Damaged')
    default:
      return t('STATUS_UNKNOWN', `Status ${status}`, { status })
  }
}

function statusColor(status: number) {
  switch (status) {
    case BookStockStatus.Available:
      return '$green10' as const
    case BookStockStatus.Booked:
      return '$accent' as const
    case BookStockStatus.Damaged:
      return '$red10' as const
    default:
      return '$colorMuted' as const
  }
}

export function LocationBooksPanel({
  location,
  onAddBooks,
}: {
  location: LocationRow
  onAddBooks: () => void
}) {
  const books = useLocationBooks(location.id)
  const { t } = useLocale()

  const addButton = (
    <Button
      testID={`location-books-add-${location.id}`}
      onPress={onAddBooks}
      minHeight={44}
      fontSize={15}
      borderRadius="$control"
      backgroundColor="transparent"
      borderColor="$borderColor"
      color="$color"
      alignSelf="flex-start"
    >
      {t('ADD_COPIES', 'Add copies')}
    </Button>
  )

  if (books.isPending) {
    return (
      <ScreenLoading
        label={t('LOADING_LOCATION_BOOKS', `Loading what is on ${location.name}…`, {
          name: location.name,
        })}
      />
    )
  }

  if (books.isError) {
    return (
      <ScreenError
        error={books.error}
        onRetry={() => books.refetch()}
        title={t('LOCATION_BOOKS_NOT_LOADED', 'Those books did not load')}
      />
    )
  }

  if (books.data.length === 0) {
    return (
      <EmptyState
        title={t('NOTHING_SHELVED', 'Nothing shelved here')}
        description={t(
          'NOTHING_SHELVED_DESC',
          'Move copies onto this shelf by entering the code printed on each one.'
        )}
        action={addButton}
      />
    )
  }

  return (
    <YStack
      testID={`location-books-${location.id}`}
      padding="$3"
      gap="$3"
      backgroundColor="$backgroundAlt"
    >
      {addButton}
      <YStack gap="$2">
        {books.data.map((book) => (
          <YStack
            key={book.id}
            testID="location-book-row"
            gap="$1"
            paddingVertical="$1"
            minWidth={0}
          >
            <Text fontSize={15} color="$color">
              {book.name}
            </Text>
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <MutedText fontFamily="$mono" fontSize={13}>
                {book.code}
              </MutedText>
              <MutedText fontSize={13} color={statusColor(book.status)}>
                {statusLabel(book.status, t)}
              </MutedText>
            </XStack>
          </YStack>
        ))}
      </YStack>
    </YStack>
  )
}
