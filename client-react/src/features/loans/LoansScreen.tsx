import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { Loan, LoanFilters as LoanFilterValues } from '@/api/loans'
import { Card, DisplayText, Eyebrow, MutedText } from '@/components/Card'
import {
  EmptyState,
  errorMessage,
  ScreenError,
  ScreenLoading,
} from '@/components/ScreenState'
import { ReturnBooksDialog } from '@/features/dashboard/ReturnBooksDialog'
import { useLocale } from '@/locale/LocaleProvider'
import { useReturnBooks } from '@/queries/book'
import { useCustomerGroups, useCustomers } from '@/queries/customer'
import { useLoans } from '@/queries/loans'
import { formatLoanDate } from './formatLoanDate'
import { LoanFilters } from './LoanFilters'
import { LoanReportDialog } from './LoanReportDialog'

/**
 * Loans — every copy that is out right now, and how to get one back.
 *
 * ## Why this is not `features/entityList`
 *
 * It looks like a list screen and is not one. There is no create, no edit, and
 * no delete: `GET /loans` is read-only by design (`LoansRoute.ts` has no
 * mutation endpoints), a loan is not an entity you name, and the row's one
 * action — return — writes to a different resource entirely. Forcing it through
 * `EntityListScreen` would mean passing three mutations that must never fire.
 *
 * ## What changed from the Vue implementation
 *
 * - **The table is gone.** `v-data-table-server` with Image / Book / Borrower /
 *   Group / Lent on / Actions columns is six columns in 390px. The spec's
 *   mapping is explicit — a data table becomes a purpose-built card layout on
 *   mobile — so each loan is a card: book title first, borrower and group and
 *   date on muted lines beneath, one Return button.
 * - **The cover thumbnail is dropped.** It was a 30x42 image in its own column,
 *   one request per row, carrying no information the title does not.
 * - **The filters are 16px and full-width on a phone.** See `LoanFilters.tsx`.
 * - **Paging is two labelled buttons**, not Vuetify's footer of icon-only
 *   controls with a rows-per-page select the server does not honour anyway
 *   (the page size is fixed at 50 in `LoansRoute.ts`).
 *
 * ## Filter state is local, not in the URL
 *
 * Unlike the search screen, whose filters are a link people share. A loans
 * filter is a momentary narrowing of an operational list; keeping it out of the
 * router keeps this screen renderable in a test with nothing but a query
 * client, which is the pattern `test/renderWithProviders.tsx` documents.
 */
export function LoansScreen() {
  const [filters, setFilters] = useState<LoanFilterValues>({ page: 0 })
  const [returnOpen, setReturnOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const loans = useLoans(filters)
  const groups = useCustomerGroups()
  const customers = useCustomers()
  const returnBooks = useReturnBooks()

  const page = filters.page ?? 0
  const total = loans.data?.total ?? 0
  const limit = loans.data?.limit ?? 50
  const rows = loans.data?.loans ?? []
  const lastPage = Math.max(0, Math.ceil(total / limit) - 1)

  const header = (
    <YStack gap="$4">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$3"
        flexWrap="wrap"
      >
        <YStack gap="$1" minWidth={0} flexShrink={1}>
          <Eyebrow>Lending</Eyebrow>
          <DisplayText fontSize={26} lineHeight={32}>
            Loans
          </DisplayText>
        </YStack>
        <XStack gap="$2" flexWrap="wrap">
          <Button
            testID="loans-report-open"
            onPress={() => setReportOpen(true)}
            minHeight={44}
            fontSize={15}
            paddingHorizontal="$3"
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            Report
          </Button>
          <Button
            testID="loans-return-open"
            onPress={() => setReturnOpen(true)}
            minHeight={44}
            fontSize={15}
            paddingHorizontal="$3"
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            Return copies
          </Button>
        </XStack>
      </XStack>

      <LoanFilters value={filters} groups={groups.data ?? []} onChange={setFilters} />
    </YStack>
  )

  const dialogs = (
    <>
      {/*
        Mounted only while open. A closed Tamagui Sheet still renders its
        title, its body and its buttons into the document — reachable by a
        screen reader, and picked up as page text by an audit — so a modal
        left permanently in the tree is a modal permanently announced.
      */}
      {returnOpen ? <ReturnBooksDialog open onOpenChange={setReturnOpen} /> : null}
      {reportOpen ? (
        <LoanReportDialog
          groups={groups.data ?? []}
          customers={customers.data ?? []}
          onOpenChange={(next) => (next ? undefined : setReportOpen(false))}
        />
      ) : null}
    </>
  )

  // The header stays mounted through loading and failure: the filters are what
  // caused both, and a screen that hides them leaves no way to undo the filter
  // that emptied it.
  if (loans.isPending) {
    return (
      <YStack gap="$4" testID="loans-screen">
        {header}
        <ScreenLoading label="Loading loans…" />
        {dialogs}
      </YStack>
    )
  }

  if (loans.isError) {
    return (
      <YStack gap="$4" testID="loans-screen">
        {header}
        <ScreenError
          error={loans.error}
          onRetry={() => loans.refetch()}
          title="The loans did not load"
        />
        {dialogs}
      </YStack>
    )
  }

  return (
    <YStack gap="$4" testID="loans-screen">
      {header}

      {returnBooks.isError ? (
        <Text testID="loans-return-error" fontSize={14} color="$red10">
          {errorMessage(returnBooks.error)}
        </Text>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing is out"
          description="Every copy is on its shelf. Lend one from a borrower's row on the Borrowers screen."
        />
      ) : (
        <>
          <MutedText testID="loans-count" fontSize={13}>
            {rangeLabel(page, limit, rows.length, total)}
          </MutedText>

          <YStack gap="$3">
            {rows.map((loan) => (
              <LoanCard
                key={loan.stockId}
                loan={loan}
                onReturn={() => returnBooks.mutate([loan.stockCode])}
                isReturning={returnBooks.isPending}
              />
            ))}
          </YStack>

          {total > limit ? (
            <XStack gap="$2" justifyContent="center" flexWrap="wrap">
              <Button
                testID="loans-prev"
                // Guarded as well as `disabled`: Tamagui renders a disabled
                // Button as `aria-disabled` on a real, still-focusable
                // `<button>`, so the guard is what stops a page of -1.
                onPress={() => page > 0 && setFilters({ ...filters, page: page - 1 })}
                disabled={page === 0}
                opacity={page === 0 ? 0.5 : 1}
                minHeight={44}
                fontSize={15}
                paddingHorizontal="$3"
                borderRadius="$control"
                backgroundColor="transparent"
                borderColor="$borderColor"
                color="$color"
              >
                Previous
              </Button>
              <Button
                testID="loans-next"
                onPress={() =>
                  page < lastPage && setFilters({ ...filters, page: page + 1 })
                }
                disabled={page >= lastPage}
                opacity={page >= lastPage ? 0.5 : 1}
                minHeight={44}
                fontSize={15}
                paddingHorizontal="$3"
                borderRadius="$control"
                backgroundColor="transparent"
                borderColor="$borderColor"
                color="$color"
              >
                Next
              </Button>
            </XStack>
          ) : null}
        </>
      )}

      {dialogs}
    </YStack>
  )
}

/**
 * One outstanding loan.
 *
 * Title-first and full-width, with the borrower, the group and the date on
 * muted lines beneath — the same shape `EntityRow` uses, for the same reason:
 * at 390px the old arrangement gave a wrapped book title about 180px to share
 * with four other columns.
 *
 * The book title is a real link. The old table made it one too, and that is
 * worth keeping: it is the fastest route from "who has this" to "what is this".
 */
function LoanCard({
  loan,
  onReturn,
  isReturning,
}: {
  loan: Loan
  onReturn: () => void
  isReturning: boolean
}) {
  const { locale } = useLocale()
  return (
    <Card testID="loan-row" spine="left" padding="$3" gap="$2">
      <XStack alignItems="center" gap="$3" flexWrap="wrap">
        <YStack flex={1} minWidth={140} gap="$1">
          <Link
            to="/book/$book_id"
            params={{ book_id: String(loan.bookId) }}
            style={{
              textDecoration: 'none',
              minWidth: 0,
              // The anchor is the touch target, so the 44px floor lives on
              // *it*. Padding on the Text inside does not grow an inline
              // <a>'s box — measured at 334x24 before this.
              display: 'flex',
              alignItems: 'center',
              minHeight: 44,
            }}
          >
            <Text fontSize={16} fontWeight="600" color="$color">
              {loan.bookName}
            </Text>
          </Link>
          <MutedText fontSize={13}>
            {loan.customerName}
            {loan.groupName ? ` · ${loan.groupName}` : ''}
          </MutedText>
          <MutedText fontFamily="$mono" fontSize={12}>
            {loan.stockCode} · out {formatLoanDate(loan.loanedAt, locale)}
          </MutedText>
        </YStack>

        <Button
          testID={`loan-return-${loan.stockCode}`}
          onPress={onReturn}
          disabled={isReturning}
          opacity={isReturning ? 0.5 : 1}
          minHeight={44}
          fontSize={15}
          paddingHorizontal="$3"
          borderRadius="$control"
          backgroundColor="transparent"
          borderColor="$borderColor"
          color="$color"
          flexShrink={0}
        >
          {isReturning ? 'Returning…' : 'Return'}
        </Button>
      </XStack>
    </Card>
  )
}

/** "1–50 of 128 out" — what page you are on, said in rows rather than pages. */
function rangeLabel(page: number, limit: number, shown: number, total: number): string {
  if (total <= limit) {
    return total === 1 ? '1 copy out' : `${total} copies out`
  }
  const first = page * limit + 1
  return `${first}–${first + shown - 1} of ${total} out`
}
