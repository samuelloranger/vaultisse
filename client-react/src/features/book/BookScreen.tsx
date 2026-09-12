import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { DisplayText, Eyebrow } from '@/components/Card'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { usePolicy } from '@/queries/app'
import { useBook, useDeleteBook } from '@/queries/book'
import { BookCover } from './BookCover'
import { BookFilesCard } from './BookFilesCard'
import { BookMetaCard } from './BookMetaCard'
import { BookStocksCard } from './BookStocksCard'

/**
 * The book detail screen: `/app/book/:book_id`.
 *
 * Shaped after the dashboard, which is this client's reference screen: data
 * comes only through query hooks, the three non-data states are rendered by
 * `components/ScreenState`, and every modal is a `ResponsiveDialog` whose
 * mutation invalidates by key rather than editing a local array.
 *
 * The screen takes its book id as a prop and reports a deletion upward rather
 * than navigating itself, for the same reason the search screen takes its
 * filters as props: it stays renderable in a test without a router.
 */

/** `formats.name` for an ebook edition — the old client's `ELECTRONIC_FORMAT_NAME`. */
const ELECTRONIC_FORMAT = 'Electronic'

export function BookScreen({
  bookId,
  onDeleted,
}: {
  bookId: number
  /** Called after a successful delete; the route module navigates away. */
  onDeleted?: () => void
}) {
  const { data: policy } = usePolicy()
  const book = useBook(bookId)
  const remove = useDeleteBook(bookId)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (book.isPending) {
    return <ScreenLoading label="Loading this book…" />
  }

  if (book.isError) {
    return (
      <ScreenError
        error={book.error}
        onRetry={() => book.refetch()}
        title="This book did not load"
      />
    )
  }

  const data = book.data
  const isElectronic =
    policy.formats.find((f) => f.id === data.format_id)?.name === ELECTRONIC_FORMAT

  return (
    <YStack gap="$4" testID="book-screen">
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="$3"
        flexWrap="wrap"
      >
        <YStack gap="$1" flexGrow={1} flexBasis={200} minWidth={0}>
          <Eyebrow>Library</Eyebrow>
          <DisplayText fontSize={22} lineHeight={28} numberOfLines={3}>
            {data.name}
          </DisplayText>
        </YStack>
        {/*
          Not tinted red at rest. Sitting beside Edit, a permanently destructive
          -looking control invites a misfire on touch; the warning belongs in
          the confirmation, which is where it is.
        */}
        <Button
          testID="delete-book"
          onPress={() => setConfirmingDelete(true)}
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          backgroundColor="transparent"
          borderColor="$borderColor"
          color="$color"
        >
          Delete book
        </Button>
      </XStack>

      <YStack gap="$3" $sm={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <YStack $sm={{ width: 240, flexShrink: 0 }}>
          <BookCover bookId={data.id} imageUrl={data.image_url} title={data.name} />
        </YStack>
        <YStack flexGrow={1} minWidth={0} gap="$3">
          <BookMetaCard book={data} policy={policy} />
        </YStack>
      </YStack>

      <BookStocksCard bookId={data.id} stocks={data.stocks} policy={policy} />

      {isElectronic || data.files.length > 0 ? (
        <BookFilesCard bookId={data.id} files={data.files} />
      ) : null}

      <ResponsiveDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this book?"
        description={data.name}
        actions={
          <>
            <Button
              testID="delete-cancel"
              onPress={() => setConfirmingDelete(false)}
              disabled={remove.isPending}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
            >
              Keep it
            </Button>
            <Button
              testID="delete-confirm"
              onPress={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmingDelete(false)
                    onDeleted?.()
                  },
                })
              }
              disabled={remove.isPending}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="$red10"
              color="$onDanger"
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <YStack gap="$2">
          <Text fontSize={15} color="$color">
            This removes the catalogue entry, its {data.stocks.length}{' '}
            {data.stocks.length === 1 ? 'copy' : 'copies'} and any backed-up files. It
            cannot be undone.
          </Text>
          {remove.isError ? (
            <Text testID="delete-error" fontSize={14} color="$red10">
              {errorMessage(remove.error)}
            </Text>
          ) : null}
        </YStack>
      </ResponsiveDialog>
    </YStack>
  )
}
