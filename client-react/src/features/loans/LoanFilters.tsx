import { Button, YStack } from 'tamagui'
import type { CustomerGroupRow } from '@/api/customer'
import type { LoanFilters as LoanFilterValues } from '@/api/loans'
import { NativeDateField, NativeSelect } from '@/features/customers/CustomerControls'

/**
 * The loans list's three filters: borrower group, and a loan-date range.
 *
 * ## The layout is the fix, not a preference
 *
 * The old view put all three in one `display: flex; flex-wrap: wrap` row with
 * `max-width: 170px` on each date field. At 390px that wraps, but each control
 * keeps its cap — so a native date picker gets 170px whatever the screen does,
 * and `density="compact"` took the text to 13px, under the 16px floor that
 * stops iOS Safari zooming the page on focus.
 *
 * Here they stack in a column on a phone and become a row from `sm`, and each
 * one fills whatever box it is given. No control sets its own width.
 *
 * `Clear` appears only when something is set: a permanently visible reset for
 * an untouched form is a control that can only be a no-op.
 */
export function LoanFilters({
  value,
  groups,
  onChange,
}: {
  value: LoanFilterValues
  groups: CustomerGroupRow[]
  onChange: (next: LoanFilterValues) => void
}) {
  const active =
    value.groupId != null || Boolean(value.dateFrom) || Boolean(value.dateTo)

  return (
    <YStack gap="$3" testID="loan-filters">
      <YStack
        gap="$3"
        // One column on a phone; three across from `sm`, where the width to do
        // it honestly actually exists.
        $sm={{ flexDirection: 'row', alignItems: 'flex-end' }}
      >
        <YStack flex={1} minWidth={0}>
          <NativeSelect
            testID="loan-filter-group"
            label="Group"
            value={value.groupId ?? null}
            options={groups.map((group) => ({ value: group.id, label: group.name }))}
            onChange={(groupId) =>
              // Paging is reset by every filter change: page 3 of the old
              // result set is very rarely page 3 of the new one, and an empty
              // page with no way to tell why is the worst outcome.
              onChange({ ...value, groupId, page: 0 })
            }
            emptyLabel="All groups"
          />
        </YStack>
        <YStack flex={1} minWidth={0}>
          <NativeDateField
            testID="loan-filter-from"
            label="Lent from"
            value={value.dateFrom ?? ''}
            onChange={(dateFrom) => onChange({ ...value, dateFrom, page: 0 })}
          />
        </YStack>
        <YStack flex={1} minWidth={0}>
          <NativeDateField
            testID="loan-filter-to"
            label="Lent to"
            value={value.dateTo ?? ''}
            onChange={(dateTo) => onChange({ ...value, dateTo, page: 0 })}
          />
        </YStack>
      </YStack>

      {active ? (
        <Button
          testID="loan-filters-clear"
          onPress={() => onChange({ page: 0 })}
          minHeight={44}
          fontSize={15}
          borderRadius="$control"
          backgroundColor="transparent"
          borderColor="$borderColor"
          color="$color"
          alignSelf="flex-start"
        >
          Clear filters
        </Button>
      ) : null}
    </YStack>
  )
}
