import { Text, XStack, YStack } from 'tamagui'
import type { StockStatusCount } from '@/api/types'
import { Card, DisplayText, Eyebrow, MutedText } from '@/components/Card'
import { statusLabel } from '@/features/book/stockStatus'
import { useLocale } from '@/locale/LocaleProvider'

/**
 * A compact breakdown of the physical copies returned by `/dashboard`.
 *
 * This is intentionally text-first rather than a chart: the statuses are
 * discrete categories, and omitting zeroes keeps the response honest for
 * small libraries. The wrapping row keeps every tile readable at 390px.
 */
export function StockStatusSummary({
  stockStatus,
}: {
  stockStatus: StockStatusCount[]
}) {
  const { t, tPlural } = useLocale()
  return (
    <Card gap="$3" testID="stock-status-card">
      <Eyebrow>{t('COPY_STATUS', 'Copy status')}</Eyebrow>
      {stockStatus.length === 0 ? (
        <MutedText testID="stock-status-empty">
          {t('NO_COPIES_TO_CLASSIFY', 'No copies to classify yet.')}
        </MutedText>
      ) : (
        <XStack gap="$2" flexWrap="wrap">
          {stockStatus.map(({ status, count }) => (
            <YStack
              key={status}
              testID={`stock-status-${status}`}
              flexGrow={1}
              flexBasis={124}
              minWidth={112}
              gap="$1"
              padding="$3"
              backgroundColor="$backgroundAlt"
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$control"
            >
              <MutedText>{statusLabel(status, t)}</MutedText>
              <DisplayText fontSize={24} lineHeight={29}>
                {count}{' '}
                <Text fontSize={13} color="$colorMuted">
                  {tPlural('COPIES', count, 'copy', 'copies')}
                </Text>
              </DisplayText>
            </YStack>
          ))}
        </XStack>
      )}
    </Card>
  )
}
