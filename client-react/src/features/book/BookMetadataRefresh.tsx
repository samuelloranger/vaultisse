import { Button, Text, YStack } from 'tamagui'
import type { MetadataField } from '@/api/bookMetadataRefresh'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
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

export function metadataFieldNames(
  fields: MetadataField[],
  translate?: (code: string, fallback: string) => string
) {
  return fields
    .map((field) => {
      const fallback = FIELD_LABELS[field]
      return translate
        ? translate(`METADATA_FIELD_${field.toUpperCase()}`, fallback)
        : fallback
    })
    .join(', ')
}

export function BookMetadataRefresh({
  bookId,
  isbn,
}: {
  bookId: number
  isbn: string | null
}) {
  const refresh = useRefreshBookMetadata(bookId)
  const { t } = useLocale()
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
        {refresh.isPending
          ? t('REFRESHING_METADATA', 'Refreshing metadata…')
          : t('REFRESH_METADATA', 'Refresh metadata')}
      </Button>
      <Text fontSize={14} color="$colorMuted">
        {isbn?.trim()
          ? t(
              'REFRESH_METADATA_DESC',
              'Fills missing details from book catalogues. Your existing details and cover are kept.'
            )
          : t(
              'REFRESH_METADATA_NO_ISBN',
              'Use Edit to add a valid ISBN, then refresh metadata.'
            )}
      </Text>
      <YStack gap="$1" role="status" aria-live="polite">
        {refresh.isPending ? (
          <Text color="$colorMuted">
            {t('CHECKING_CATALOGUES', 'Checking catalogues…')}
          </Text>
        ) : null}
        {refresh.isError ? (
          <Text color="$red10">
            {errorMessage(refresh.error)}{' '}
            {t('CHECK_ISBN_RETRY', 'Check the ISBN or try again.')}
          </Text>
        ) : null}
        {refresh.isSuccess ? (
          <>
            <Text color="$color">
              {refresh.data.changed.length
                ? t(
                    'METADATA_UPDATED',
                    `Updated: ${metadataFieldNames(
                      refresh.data.changed.map((change) => change.field),
                      t
                    )}.`,
                    {
                      fields: metadataFieldNames(
                        refresh.data.changed.map((change) => change.field),
                        t
                      ),
                    }
                  )
                : t('NO_NEW_METADATA', 'No new metadata found.')}
            </Text>
            {refresh.data.stillMissing.length ? (
              <Text color="$colorMuted">
                {t(
                  'METADATA_STILL_MISSING',
                  `Still missing: ${metadataFieldNames(refresh.data.stillMissing, t)}. You can add these using Edit.`,
                  { fields: metadataFieldNames(refresh.data.stillMissing, t) }
                )}
              </Text>
            ) : null}
            {refresh.data.failedSources.length ? (
              <Text color="$colorMuted">
                {t(
                  'METADATA_SOURCES_FAILED',
                  'Some catalogues could not be reached. Try again later for missing details.'
                )}
              </Text>
            ) : null}
          </>
        ) : null}
      </YStack>
    </YStack>
  )
}
