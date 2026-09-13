import { useEffect, useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import type { BookStock, StockInput } from '@/api/book'
import type { Policy } from '@/api/types'
import { BookStockStatus } from '@/api/types'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useAddBookStock, useDeleteBookStock, useUpdateBookStock } from '@/queries/book'
import { SelectField } from './BookFields'
import { statusLabel } from './stockStatus'

/**
 * Add or edit one physical copy.
 *
 * ## Why delete lives in here
 *
 * The spec requires per-row actions to collapse into **one** control on a
 * phone rather than three competing ones in a 390px row. Rather than build an
 * overflow menu, each row has a single "Edit" button and this dialog carries
 * every action that applies to the copy — including the destructive one, behind
 * its own confirm step, where a warning belongs and where it cannot be hit by a
 * misfire aimed at the row next to it.
 */

/**
 * `POST /book/:id/stock` answers 406 for `Booked`: a copy cannot be created
 * already lent out, because lending writes a `loan_history` row and that is the
 * update path's job. So the option is offered only when editing.
 */
const CREATE_STATUSES = [
  BookStockStatus.Available,
  BookStockStatus.NotAvailable,
  BookStockStatus.Damaged,
]

const ALL_STATUSES = [
  BookStockStatus.Available,
  BookStockStatus.NotAvailable,
  BookStockStatus.Booked,
  BookStockStatus.Damaged,
]

export function StockDialog({
  bookId,
  stock,
  policy,
  open,
  onOpenChange,
}: {
  bookId: number
  /** Undefined for "add a copy". */
  stock?: BookStock
  policy: Policy
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const add = useAddBookStock(bookId)
  const update = useUpdateBookStock(bookId)
  const remove = useDeleteBookStock(bookId)
  const { t } = useLocale()

  const [status, setStatus] = useState<BookStockStatus>(
    stock?.status ?? BookStockStatus.Available
  )
  const [locationId, setLocationId] = useState<number | null>(
    stock?.location_id ?? policy.locations[0]?.id ?? null
  )
  const [customerId, setCustomerId] = useState<number | null>(
    stock?.customer_id ?? null
  )
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // The dialog is kept mounted by its parent, so reset when it is (re)opened
  // for a different copy rather than relying on a remount to do it.
  useEffect(() => {
    if (!open) return
    setStatus(stock?.status ?? BookStockStatus.Available)
    setLocationId(stock?.location_id ?? policy.locations[0]?.id ?? null)
    setCustomerId(stock?.customer_id ?? null)
    setConfirmingDelete(false)
    add.reset()
    update.reset()
    remove.reset()
    // The three `reset`s are stable callbacks off their mutation observers, so
    // listing them costs nothing and keeps the dependency list honest.
  }, [open, stock, policy.locations, add.reset, update.reset, remove.reset])

  const statuses = stock ? ALL_STATUSES : CREATE_STATUSES
  const busy = add.isPending || update.isPending || remove.isPending
  const error = add.error ?? update.error ?? remove.error

  function submit() {
    if (locationId === null) return
    const input: StockInput = {
      status,
      location_id: locationId,
      // The server only keeps a borrower while the copy is on loan; sending one
      // for any other status would be a customer link nothing ever clears.
      customer_id: status === BookStockStatus.Booked ? customerId : null,
    }

    if (stock) {
      update.mutate(
        { stockId: stock.id, input },
        { onSuccess: () => onOpenChange(false) }
      )
    } else {
      add.mutate(input, { onSuccess: () => onOpenChange(false) })
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        stock
          ? t('COPY_CODE_TITLE', `Copy ${stock.code}`, { code: stock.code })
          : t('ADD_COPY', 'Add a copy')
      }
      description={
        stock
          ? t(
              'EDIT_COPY_DESC',
              'Move it to another shelf, change its state, or discard it.'
            )
          : t(
              'ADD_COPY_DESC',
              'A scannable code is generated for the new copy automatically.'
            )
      }
      actions={
        <>
          <Button
            testID="stock-cancel"
            onPress={() => onOpenChange(false)}
            disabled={busy}
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
            testID="stock-submit"
            onPress={submit}
            disabled={busy || locationId === null}
            opacity={locationId === null ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {busy
              ? t('SAVING', 'Saving…')
              : stock
                ? t('SAVE_COPY', 'Save copy')
                : t('ADD_COPY_SHORT', 'Add copy')}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <SelectField
          testID="stock-status"
          label={t('STATE', 'State')}
          value={status}
          options={statuses.map((value) => ({ value, label: statusLabel(value, t) }))}
          onChange={(next) => setStatus(next ?? BookStockStatus.Available)}
          emptyLabel={t('AVAILABLE', 'Available')}
        />

        <SelectField
          testID="stock-location"
          label={t('SHELF', 'Shelf')}
          value={locationId}
          options={policy.locations.map((l) => ({ value: l.id, label: l.name }))}
          onChange={setLocationId}
          emptyLabel={t('CHOOSE_SHELF', 'Choose a shelf')}
        />

        {status === BookStockStatus.Booked ? (
          <SelectField
            testID="stock-customer"
            label={t('LENT_TO', 'Lent to')}
            value={customerId}
            options={policy.customers.map((c) => ({ value: c.id, label: c.name }))}
            onChange={setCustomerId}
            emptyLabel={t('NOBODY_YET', 'Nobody yet')}
          />
        ) : null}

        {error ? (
          <Text testID="stock-error" fontSize={14} color="$red10">
            {errorMessage(error)}
          </Text>
        ) : null}

        {stock ? (
          <YStack
            gap="$2"
            paddingTop="$3"
            borderTopWidth={1}
            borderTopColor="$borderColor"
          >
            {confirmingDelete ? (
              <>
                <Text fontSize={14} color="$color">
                  {t(
                    'DISCARD_COPY_CONFIRM',
                    `Discard copy ${stock.code}? Its loan history is kept, the copy is not.`,
                    { code: stock.code }
                  )}
                </Text>
                <Button
                  testID="stock-delete-confirm"
                  onPress={() =>
                    remove.mutate(stock.id, { onSuccess: () => onOpenChange(false) })
                  }
                  disabled={busy}
                  minHeight={44}
                  fontSize={16}
                  borderRadius="$control"
                  backgroundColor="$red10"
                  color="$onDanger"
                >
                  {remove.isPending
                    ? t('DISCARDING', 'Discarding…')
                    : t('YES_DISCARD', 'Yes, discard it')}
                </Button>
                <Button
                  testID="stock-delete-cancel"
                  onPress={() => setConfirmingDelete(false)}
                  minHeight={44}
                  fontSize={16}
                  borderRadius="$control"
                  backgroundColor="transparent"
                  borderColor="$borderColor"
                  color="$color"
                >
                  {t('KEEP_IT', 'Keep it')}
                </Button>
              </>
            ) : (
              <Button
                testID="stock-delete"
                onPress={() => setConfirmingDelete(true)}
                disabled={busy}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="transparent"
                borderColor="$borderColor"
                color="$red10"
              >
                {t('DISCARD_COPY', 'Discard this copy')}
              </Button>
            )}
          </YStack>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
