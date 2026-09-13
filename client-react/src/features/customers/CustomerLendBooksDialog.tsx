import { useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import type { CustomerRow } from '@/api/customer'
import { Field } from '@/components/Field'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useLendBooksToCustomer } from '@/queries/customer'

/**
 * Lend copies to one borrower, by the code printed on each copy.
 *
 * `POST /customer/:id/add/books` takes a batch and writes a `loan_history` row
 * per code, so a whole armful goes out in one write rather than one request per
 * book with no way to tell which half succeeded.
 *
 * The old client fronted this with a camera scanner. A scanner is worth having
 * back — as `BarcodeDetector` with a `@zxing/browser` fallback, per the spec's
 * feature-library table — but it can never be the *only* way in: a denied
 * camera permission, a laptop without one, or a scuffed barcode all have to
 * leave a way to finish the job. So the typed field is the primary path.
 */
export function CustomerLendBooksDialog({
  customer,
  onOpenChange,
}: {
  customer: CustomerRow
  onOpenChange: (open: boolean) => void
}) {
  const [codes, setCodes] = useState('')
  const lend = useLendBooksToCustomer()
  const { t, tPlural } = useLocale()

  const parsed = codes
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter(Boolean)

  function close() {
    setCodes('')
    lend.reset()
    onOpenChange(false)
  }

  function submit() {
    if (parsed.length === 0) return
    lend.mutate({ id: customer.id, codes: parsed }, { onSuccess: close })
  }

  return (
    <ResponsiveDialog
      // Mounted by the screen only while it is wanted, so `open` is constant.
      open
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t('LEND_TO', `Lend to ${customer.name}`, { name: customer.name })}
      description={t(
        'LEND_COPIES_DESC',
        'Enter the code printed on each copy. One per line.'
      )}
      actions={
        <>
          <Button
            testID="customer-lend-cancel"
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
            testID="customer-lend-submit"
            onPress={submit}
            disabled={parsed.length === 0 || lend.isPending}
            opacity={parsed.length === 0 || lend.isPending ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {lend.isPending
              ? t('LENDING', 'Lending…')
              : parsed.length > 1
                ? tPlural(
                    'LEND_COPIES',
                    parsed.length,
                    'Lend {count} copy',
                    'Lend {count} copies'
                  )
                : t('LEND_COPY', 'Lend copy')}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <Field
          testID="customer-lend-codes"
          label={t('COPY_CODES', 'Copy codes')}
          value={codes}
          onChangeText={setCodes}
          placeholder={t('COPY_CODE_PLACEHOLDER', 'e.g. 0000000001')}
          autoComplete="off"
          // The codes are digits here, but `numeric` would hide the letters
          // some libraries print. `text` keeps every code typeable.
          inputMode="text"
          onSubmit={submit}
          error={lend.isError ? errorMessage(lend.error) : null}
        />
        {parsed.length > 1 ? (
          <Text fontSize={14} color="$colorMuted">
            {t(
              'COPIES_WILL_GO_OUT',
              `${parsed.length} copies will go out to ${customer.name}.`,
              {
                count: parsed.length,
                name: customer.name,
              }
            )}
          </Text>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
