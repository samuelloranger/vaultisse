import { Button, Text, YStack } from 'tamagui'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'

/**
 * "Delete X?" — the second half of the destructive-action rule.
 *
 * The first half lives in `RowActions`: nothing is red while the row is at
 * rest. The warning is deferred to here, where the user has already said what
 * they want and the red button is information rather than decoration.
 *
 * Cancel comes first and Delete last, matching every other action row in the
 * client — the primary action is always the rightmost.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isPending,
  error,
  testID,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  isPending: boolean
  error: unknown
  testID: string
}) {
  const { t } = useLocale()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      actions={
        <>
          <Button
            testID={`${testID}-cancel`}
            onPress={() => onOpenChange(false)}
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
            testID={`${testID}-confirm`}
            onPress={onConfirm}
            disabled={isPending}
            opacity={isPending ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$red10"
            color="$onPrimary"
          >
            {isPending ? t('DELETING', 'Deleting…') : t('DELETE', 'Delete')}
          </Button>
        </>
      }
    >
      <YStack gap="$2">
        <Text fontSize={15} color="$colorMuted">
          {t('CANNOT_UNDO', 'This cannot be undone.')}
        </Text>
        {error ? (
          <Text testID={`${testID}-error`} fontSize={14} color="$red10">
            {errorMessage(error)}
          </Text>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
