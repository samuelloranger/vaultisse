import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { BookStock } from '@/api/book'
import type { Policy } from '@/api/types'
import { BookStockStatus } from '@/api/types'
import { Card, Eyebrow, MutedText } from '@/components/Card'
import { useLocale } from '@/locale/LocaleProvider'
import { StockDialog } from './StockDialog'
import { statusLabel } from './stockStatus'

/**
 * The physical copies of this book.
 *
 * ## Cards, not a table
 *
 * The spec's component mapping is explicit: `v-data-table` becomes a
 * purpose-built card layout on mobile, not an auto-stacked table. A stock row
 * is four fields and one action, which is a paragraph on a phone and a row on a
 * desktop — so it is written as a flex row that wraps, and is both.
 *
 * ## One action per row
 *
 * "Edit" opens `StockDialog`, which carries every action that applies to the
 * copy including discarding it. Three competing controls in a 390px row is the
 * defect the audit recorded; an overflow menu is the other fix, and this one
 * needs no menu primitive.
 *
 * Printing a barcode label is deliberately absent: it needs `jspdf`/`jsbarcode`
 * and a print queue, which are their own screen.
 */

function statusTone(status: BookStockStatus) {
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

function StockRow({
  stock,
  leasingEnabled,
  onEdit,
  translate,
}: {
  stock: BookStock
  leasingEnabled: boolean
  onEdit: () => void
  translate: (code: string, fallback: string) => string
}) {
  return (
    <XStack
      testID="stock-row"
      gap="$3"
      flexWrap="wrap"
      alignItems="center"
      paddingVertical="$3"
      borderTopWidth={1}
      borderTopColor="$borderColor"
    >
      <YStack gap="$0.5" flexGrow={1} flexBasis={160} minWidth={0}>
        <Text fontFamily="$mono" fontSize={14} color="$color">
          {stock.code}
        </Text>
        <MutedText numberOfLines={1}>
          {stock.location_name ?? translate('NO_SHELF', 'No shelf')}
        </MutedText>
      </YStack>

      <YStack gap="$0.5" flexGrow={1} flexBasis={120} minWidth={0}>
        <Text fontSize={14} color={statusTone(stock.status)}>
          {statusLabel(stock.status, translate)}
        </Text>
        {leasingEnabled && stock.customer_name ? (
          <MutedText numberOfLines={1}>{stock.customer_name}</MutedText>
        ) : null}
      </YStack>

      <Button
        testID={`edit-stock-${stock.id}`}
        onPress={onEdit}
        aria-label={translate('EDIT_COPY', `Edit copy ${stock.code}`)}
        minHeight={44}
        fontSize={15}
        borderRadius="$control"
        backgroundColor="transparent"
        borderColor="$borderColor"
        color="$color"
      >
        {translate('EDIT', 'Edit')}
      </Button>
    </XStack>
  )
}

export function BookStocksCard({
  bookId,
  stocks,
  policy,
}: {
  bookId: number
  stocks: BookStock[]
  policy: Policy
}) {
  const [editing, setEditing] = useState<BookStock | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const { t } = useLocale()

  function openFor(stock?: BookStock) {
    setEditing(stock)
    setOpen(true)
  }

  return (
    <Card gap="$2" testID="book-stocks">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$3"
        flexWrap="wrap"
      >
        <XStack alignItems="baseline" gap="$2">
          <Eyebrow>{t('COPIES', 'Copies')}</Eyebrow>
          <MutedText>{stocks.length}</MutedText>
        </XStack>
        <Button
          testID="add-stock"
          onPress={() => openFor(undefined)}
          disabled={policy.locations.length === 0}
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          backgroundColor="$primary"
          color="$onPrimary"
        >
          {t('ADD_COPY', 'Add a copy')}
        </Button>
      </XStack>

      {stocks.length === 0 ? (
        <MutedText>
          {t(
            'NO_PHYSICAL_COPIES',
            'No physical copies yet. Add one to put this book on a shelf.'
          )}
        </MutedText>
      ) : (
        <YStack>
          {stocks.map((stock) => (
            <StockRow
              key={stock.id}
              stock={stock}
              leasingEnabled={policy.user.leasingEnabled}
              onEdit={() => openFor(stock)}
              translate={t}
            />
          ))}
        </YStack>
      )}

      <StockDialog
        bookId={bookId}
        stock={editing}
        policy={policy}
        open={open}
        onOpenChange={setOpen}
      />
    </Card>
  )
}
