import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { Card, DisplayText, Eyebrow, MutedText } from '@/components/Card'
import { Undo2 } from '@/components/icons'
import { EmptyState, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { useDocumentTitle } from '@/lib/documentTitle'
import { useLocale } from '@/locale/LocaleProvider'
import { usePolicy } from '@/queries/app'
import { useBookCounters } from '@/queries/book'
import { useDashboard } from '@/queries/dashboard'
import { BookShelf } from './BookShelf'
import { BooksInTimeChart } from './BooksInTimeChart'
import { CounterTiles } from './CounterTiles'
import { ReturnBooksDialog } from './ReturnBooksDialog'
import { StockStatusSummary } from './StockStatusSummary'

/**
 * The dashboard.
 *
 * This screen is the template later screens copy, so the shape matters:
 *
 *  - It reads data through query hooks only. It never imports from `api/`.
 *  - Loading and error are rendered by the shared `ScreenState` components, so
 *    every screen's three non-data states look and test the same.
 *  - The primary action lives in a `ResponsiveDialog` and fires a mutation that
 *    invalidates by key. Nothing on screen is updated by hand.
 *  - The policy comes from `usePolicy()`, which resolves from cache because the
 *    `_app` layout's loader already awaited it.
 */
export function DashboardScreen() {
  const [returnOpen, setReturnOpen] = useState(false)
  const { data: policy } = usePolicy()
  const { t } = useLocale()
  useDocumentTitle(t('DASHBOARD', 'Dashboard'))
  const dashboard = useDashboard()
  const counters = useBookCounters()

  if (dashboard.isPending) {
    return <ScreenLoading label={t('LOADING_LIBRARY', 'Loading your library…')} />
  }

  if (dashboard.isError) {
    return (
      <ScreenError
        error={dashboard.error}
        onRetry={() => dashboard.refetch()}
        title={t('DASHBOARD_NOT_LOADED', 'The dashboard did not load')}
      />
    )
  }

  const data = dashboard.data
  const shelvesWithBooks = data.categoryShelves.filter((s) => s.books.length > 0)
  // Same instance-wide switch the Loans and Borrowers nav rows are behind. The
  // dashboard's lending surface - the return action and the on-loan list - goes
  // with them, or turning lending off leaves the section it removed from the
  // nav sitting on the first screen the user sees.
  const lending = policy.user.leasingEnabled

  return (
    <YStack gap="$4" testID="dashboard-screen">
      <YStack gap="$1">
        <Eyebrow>{t('DASHBOARD', 'Dashboard')}</Eyebrow>
        <DisplayText fontSize={26} lineHeight={32}>
          {t('WELCOME_BACK', `Welcome back, ${policy.user.name}`, {
            name: policy.user.name,
          })}
        </DisplayText>
      </YStack>

      <CounterTiles dashboard={data} counters={counters.data} lending={lending} />

      {lending ? (
        <XStack>
          <Button
            testID="open-return-dialog"
            onPress={() => setReturnOpen(true)}
            icon={Undo2}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {t('RETURN_COPIES', 'Return copies')}
          </Button>
        </XStack>
      ) : null}

      <BooksInTimeChart booksInTime={data.booksInTime} />

      <StockStatusSummary stockStatus={data.stockStatus} />

      <BookShelf title={t('RECENTLY_ADDED', 'Recently added')} books={data.lastBooks} />

      {data.lastBooks.length === 0 ? (
        <EmptyState
          title={t('NOTHING_ADDED_YET', 'Nothing added yet')}
          description={t(
            'NOTHING_ADDED_DESC',
            'Books added in the last 30 days show up here.'
          )}
        />
      ) : null}

      {shelvesWithBooks.map((shelf) => (
        <BookShelf
          key={shelf.id}
          title={shelf.name}
          count={shelf.count}
          books={shelf.books}
        />
      ))}

      {lending ? (
        <Card gap="$2" testID="on-loan-card">
          <XStack alignItems="baseline" gap="$2">
            <Eyebrow>{t('CURRENTLY_ON_LOAN', 'Currently on loan')}</Eyebrow>
            <MutedText>{data.totalBookedBooks}</MutedText>
          </XStack>
          {data.currentlyOnLoan.length === 0 ? (
            <MutedText>
              {t('NOTHING_OUT_MOMENT', 'Nothing is out at the moment.')}
            </MutedText>
          ) : (
            <YStack gap="$2">
              {data.currentlyOnLoan.map((loan) => (
                <XStack
                  key={`${loan.bookId}-${loan.customerId}`}
                  testID="loan-row"
                  justifyContent="space-between"
                  gap="$3"
                  minHeight={44}
                  alignItems="center"
                >
                  <Text fontSize={15} color="$color" flex={1} numberOfLines={1}>
                    {loan.bookName}
                  </Text>
                  <MutedText numberOfLines={1}>{loan.customerName}</MutedText>
                </XStack>
              ))}
            </YStack>
          )}
        </Card>
      ) : null}

      {lending ? (
        <ReturnBooksDialog open={returnOpen} onOpenChange={setReturnOpen} />
      ) : null}
    </YStack>
  )
}
