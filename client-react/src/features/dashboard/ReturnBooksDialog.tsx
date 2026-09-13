import { useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import { Field } from '@/components/Field'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useReturnBooks } from '@/queries/book'

/**
 * The dashboard's primary action: return a physical copy by its stock code.
 *
 * The old client put a camera scanner behind this. A scanner is worth having
 * back — as `BarcodeDetector` with a `@zxing/browser` fallback, per the spec's
 * feature-library table — but it can never be the *only* way in: a denied
 * camera permission, a desktop without one, or a scuffed barcode all have to
 * leave a way to finish the job. So the typed field is the primary path and the
 * scanner will be an addition to it, not a replacement for it.
 *
 * Codes are `book_stocks.code` values — the code printed on the copy, not a
 * book id. Several can be returned at once, one per line, which is what the
 * endpoint takes.
 */
export function ReturnBooksDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [codes, setCodes] = useState('')
  const returnBooks = useReturnBooks()
  const { t, tPlural } = useLocale()

  const parsed = codes
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter(Boolean)

  function close() {
    setCodes('')
    returnBooks.reset()
    onOpenChange(false)
  }

  function submit() {
    if (parsed.length === 0) return
    returnBooks.mutate(parsed, { onSuccess: close })
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t('RETURN_COPIES', 'Return copies')}
      description={t(
        'RETURN_COPIES_DESC',
        'Enter the code printed on each copy. One per line.'
      )}
      actions={
        <>
          <Button
            testID="return-cancel"
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
            testID="return-submit"
            onPress={submit}
            disabled={parsed.length === 0 || returnBooks.isPending}
            opacity={parsed.length === 0 ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {returnBooks.isPending
              ? t('RETURNING', 'Returning…')
              : parsed.length > 1
                ? tPlural(
                    'RETURN_COPIES_COUNT',
                    parsed.length,
                    'Return {count} copy',
                    'Return {count} copies'
                  )
                : t('RETURN_COPY', 'Return copy')}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <Field
          testID="return-codes"
          label={t('COPY_CODES', 'Copy codes')}
          value={codes}
          onChangeText={setCodes}
          placeholder={t('RETURN_COPY_CODE_PLACEHOLDER', 'e.g. BK-000123')}
          autoComplete="off"
          inputMode="text"
          onSubmit={submit}
          error={returnBooks.isError ? errorMessage(returnBooks.error) : null}
        />
        {parsed.length > 1 ? (
          <Text fontSize={14} color="$colorMuted">
            {t('CODES_WILL_BE_RETURNED', `${parsed.length} codes will be returned.`, {
              count: parsed.length,
            })}
          </Text>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
