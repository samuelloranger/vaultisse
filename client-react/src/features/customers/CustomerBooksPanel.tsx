import { Link } from '@tanstack/react-router'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { CustomerRow } from '@/api/customer'
import { MutedText } from '@/components/Card'
import {
  EmptyState,
  errorMessage,
  ScreenError,
  ScreenLoading,
} from '@/components/ScreenState'
import { useCustomerBooks, useReturnCustomerBook } from '@/queries/customer'

/**
 * What one borrower currently holds — the expanded body of a borrower row.
 *
 * ## Why this is not a table
 *
 * The old client rendered `v-data-table-virtual` with Image / Name / Code /
 * Action columns, and Vuetify's automatic mobile stacking turned that into a
 * 55px book cover under the literal label "Image". The spec's mapping is
 * explicit: a data table gets a purpose-built card layout on mobile, not an
 * auto-stacked table. So each copy is title-first with its code on a muted
 * second line, at every width — one layout, nothing to keep in sync, nothing to
 * overflow sideways.
 *
 * The cover thumbnail is dropped for the same reason it is dropped in
 * `LocationBooksPanel`: in a list whose job is "what does this person have", a
 * 30px cover is decoration that costs a request each.
 *
 * ## The Return button is a real labelled button
 *
 * The old one was an icon-only `v-btn` whose only label was `aria-label` and
 * whose hit area the audit measured under the floor. Returning a book is the
 * most consequential thing on this panel, so it says what it does.
 *
 * Mounted only while its row is expanded, which is what starts the query.
 */
export function CustomerBooksPanel({
  customer,
  onLendBooks,
}: {
  customer: CustomerRow
  onLendBooks: () => void
}) {
  const books = useCustomerBooks(customer.id)
  const returnBook = useReturnCustomerBook()

  const lendButton = (
    <Button
      testID={`customer-books-lend-${customer.id}`}
      onPress={onLendBooks}
      minHeight={44}
      fontSize={15}
      borderRadius="$control"
      backgroundColor="transparent"
      borderColor="$borderColor"
      color="$color"
      alignSelf="flex-start"
    >
      Lend books
    </Button>
  )

  if (books.isPending) {
    return <ScreenLoading label={`Loading what ${customer.name} has…`} />
  }

  if (books.isError) {
    return (
      <ScreenError
        error={books.error}
        onRetry={() => books.refetch()}
        title="Those books did not load"
      />
    )
  }

  if (books.data.length === 0) {
    return (
      <EmptyState
        title="Nothing out"
        description={`${customer.name} has no copies on loan. Lend one by entering the code printed on it.`}
        action={lendButton}
      />
    )
  }

  return (
    <YStack
      testID={`customer-books-${customer.id}`}
      padding="$3"
      gap="$3"
      backgroundColor="$backgroundAlt"
    >
      {lendButton}

      {/*
        One error line for the panel rather than one per row: the server answers
        a single message per return, and the row that failed is the one whose
        button was just pressed.
      */}
      {returnBook.isError ? (
        <Text testID="customer-return-error" fontSize={14} color="$red10">
          {errorMessage(returnBook.error)}
        </Text>
      ) : null}

      <YStack gap="$2">
        {books.data.map((book) => (
          <XStack
            key={book.code}
            testID="customer-book-row"
            alignItems="center"
            gap="$3"
            // Wraps before the title and the button ever collide at 390px.
            flexWrap="wrap"
            paddingVertical="$1"
            minWidth={0}
          >
            <YStack flex={1} minWidth={140} gap="$1">
              <Link
                to="/book/$book_id"
                params={{ book_id: String(book.id) }}
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
                <Text fontSize={15} color="$color" lineHeight={22}>
                  {book.name}
                </Text>
              </Link>
              <MutedText fontFamily="$mono" fontSize={13}>
                {book.code}
              </MutedText>
            </YStack>
            <Button
              testID={`customer-book-return-${book.code}`}
              onPress={() => returnBook.mutate({ id: customer.id, code: book.code })}
              disabled={returnBook.isPending}
              opacity={returnBook.isPending ? 0.5 : 1}
              minHeight={44}
              fontSize={15}
              paddingHorizontal="$3"
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
              flexShrink={0}
            >
              {returnBook.isPending ? 'Returning…' : 'Return'}
            </Button>
          </XStack>
        ))}
      </YStack>
    </YStack>
  )
}
