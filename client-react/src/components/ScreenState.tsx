import { Button, Spinner, Text, YStack } from 'tamagui'
import { ApiError } from '@/api/http'
import { DisplayText, MutedText } from './Card'
import { AlertTriangle, Inbox, RefreshCw } from './icons'

/**
 * The three states every screen has besides "showing data": loading, failed,
 * and empty.
 *
 * They live here so each screen renders the same thing, and so the spec's
 * "its error state renders" test has one selector to look for
 * (`testID="screen-error"`) on every screen rather than a bespoke one each time.
 */

/** Turn an unknown thrown value into something worth putting on screen. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

export function ScreenLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <YStack
      testID="screen-loading"
      role="status"
      aria-live="polite"
      alignItems="center"
      justifyContent="center"
      gap="$3"
      paddingVertical="$9"
    >
      <Spinner size="large" color="$accent" />
      <MutedText>{label}</MutedText>
    </YStack>
  )
}

export function ScreenError({
  error,
  onRetry,
  title = 'This did not load',
}: {
  error: unknown
  onRetry?: () => void
  title?: string
}) {
  return (
    <YStack
      testID="screen-error"
      role="alert"
      alignItems="center"
      justifyContent="center"
      gap="$3"
      paddingVertical="$8"
      paddingHorizontal="$4"
    >
      <AlertTriangle size={28} color="$red10" />
      <DisplayText fontSize={20} textAlign="center">
        {title}
      </DisplayText>
      <Text color="$colorMuted" fontSize={15} textAlign="center" maxWidth={440}>
        {errorMessage(error)}
      </Text>
      {onRetry ? (
        <Button
          testID="screen-error-retry"
          onPress={onRetry}
          icon={RefreshCw}
          minHeight={44}
          backgroundColor="$primary"
          color="$onPrimary"
          borderRadius="$control"
          fontSize={16}
        >
          Try again
        </Button>
      ) : null}
    </YStack>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <YStack
      testID="empty-state"
      alignItems="center"
      justifyContent="center"
      gap="$2"
      paddingVertical="$6"
      paddingHorizontal="$4"
    >
      <Inbox size={24} color="$colorMuted" />
      <DisplayText fontSize={17} textAlign="center">
        {title}
      </DisplayText>
      {description ? (
        <MutedText textAlign="center" maxWidth={420}>
          {description}
        </MutedText>
      ) : null}
      {action}
    </YStack>
  )
}
