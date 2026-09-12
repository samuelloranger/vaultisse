import { XStack, YStack } from 'tamagui'
import type { BookCounters, Dashboard } from '@/api/types'
import { Card, DisplayText, Eyebrow, MutedText } from '@/components/Card'
import { ArrowDownLeft, ArrowUpRight } from '@/components/icons'

/**
 * The dashboard's KPI row.
 *
 * Data comes from two different endpoints on purpose — `/dashboard` owns the
 * library totals, `/book/counters` owns the library *nav's* quick-filter counts
 * — and they are rendered side by side here because that is what the user sees
 * as one row. Each arrives through its own query hook; the component never
 * knows which request it came from.
 *
 * Layout is a wrapping flex row rather than a fixed grid: at 390px that is two
 * tiles per line with no media query and no minimum width to overflow.
 */

function Tile({
  label,
  value,
  hint,
  testID,
}: {
  label: string
  value: number | string
  hint?: React.ReactNode
  testID: string
}) {
  return (
    <Card
      testID={testID}
      spine="left"
      flexGrow={1}
      flexBasis={150}
      minWidth={0}
      padding="$3"
      gap="$1"
    >
      <Eyebrow numberOfLines={1}>{label}</Eyebrow>
      <XStack alignItems="baseline" gap="$2">
        <DisplayText fontSize={28} lineHeight={34}>
          {value}
        </DisplayText>
        {hint}
      </XStack>
    </Card>
  )
}

export function CounterTiles({
  dashboard,
  counters,
  lending,
}: {
  dashboard: Dashboard
  counters?: BookCounters
  /** The instance-wide lending switch. Off, and the loan counts come out. */
  lending: boolean
}) {
  const trendingUp = dashboard.totalThisMonth >= dashboard.totalLastMonth
  const counterParts = counters
    ? [
        `${counters.total} in the library`,
        `${counters.recent} added in the last 30 days`,
        ...(lending ? [`${counters.onLoan} out`] : []),
        `${counters.noStock} with no copies`,
      ]
    : []

  return (
    <YStack gap="$2">
      <XStack flexWrap="wrap" gap="$2">
        <Tile testID="tile-total" label="Books" value={dashboard.totalBooks} />
        <Tile
          testID="tile-this-month"
          label="Added this month"
          value={dashboard.totalThisMonth}
          hint={
            trendingUp ? (
              <ArrowUpRight size={18} color="$green10" aria-label="up on last month" />
            ) : (
              <ArrowDownLeft size={18} color="$red10" aria-label="down on last month" />
            )
          }
        />
        {lending ? (
          <Tile
            testID="tile-on-loan"
            label="On loan"
            value={dashboard.totalBookedBooks}
          />
        ) : null}
        <Tile testID="tile-authors" label="Authors" value={dashboard.totalAuthors} />
      </XStack>

      {counters ? (
        <MutedText testID="counters-line">{counterParts.join(' · ')}</MutedText>
      ) : null}
    </YStack>
  )
}
