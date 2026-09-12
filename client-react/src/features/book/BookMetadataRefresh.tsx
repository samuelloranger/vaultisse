import { Button, Text, YStack } from 'tamagui'
import type { MetadataField } from '@/api/bookMetadataRefresh'
import { errorMessage } from '@/components/ScreenState'
import { useRefreshBookMetadata } from '@/queries/bookMetadataRefresh'

const FIELD_LABELS: Record<MetadataField, string> = {
  name: 'title',
  description: 'description',
  image_url: 'cover',
  category: 'category',
  publisher: 'publisher',
  published_date: 'publication date',
  pages: 'pages',
  language: 'language',
  authors: 'authors',
}

export function metadataFieldNames(fields: MetadataField[]) {
  return fields.map((field) => FIELD_LABELS[field]).join(', ')
}

export function BookMetadataRefresh({
  bookId,
  isbn,
}: {
  bookId: number
  isbn: string | null
}) {
  const refresh = useRefreshBookMetadata(bookId)
  return (
    <YStack gap="$2" alignItems="flex-start">
      <Button
        minHeight={44}
        fontSize={16}
        borderRadius="$control"
        backgroundColor="transparent"
        borderColor="$borderColor"
        color="$color"
        disabled={!isbn?.trim() || refresh.isPending}
        onPress={() => {
          if (!refresh.isPending) refresh.mutate()
        }}
      >
        {refresh.isPending ? 'Refreshing metadata…' : 'Refresh metadata'}
      </Button>
      <Text fontSize={14} color="$colorMuted">
        {isbn?.trim()
          ? 'Fills missing details from book catalogues. Your existing details and cover are kept.'
          : 'Use Edit to add a valid ISBN, then refresh metadata.'}
      </Text>
      <YStack gap="$1" role="status" aria-live="polite">
        {refresh.isPending ? (
          <Text color="$colorMuted">Checking catalogues…</Text>
        ) : null}
        {refresh.isError ? (
          <Text color="$red10">
            {errorMessage(refresh.error)} Check the ISBN or try again.
          </Text>
        ) : null}
        {refresh.isSuccess ? (
          <>
            <Text color="$color">
              {refresh.data.changed.length
                ? `Updated: ${metadataFieldNames(refresh.data.changed.map((change) => change.field))}.`
                : 'No new metadata found.'}
            </Text>
            {refresh.data.stillMissing.length ? (
              <Text color="$colorMuted">
                Still missing: {metadataFieldNames(refresh.data.stillMissing)}. You can
                add these using Edit.
              </Text>
            ) : null}
            {refresh.data.failedSources.length ? (
              <Text color="$colorMuted">
                Some catalogues could not be reached. Try again later for missing
                details.
              </Text>
            ) : null}
          </>
        ) : null}
      </YStack>
    </YStack>
  )
}
