import { Image, Text, XStack, YStack } from 'tamagui'
import type { ShelfBook } from '@/api/types'
import { Eyebrow } from '@/components/Card'
import { BookOpen } from '@/components/icons'

/**
 * A horizontally scrolling row of book covers.
 *
 * The only place in the client allowed to scroll sideways, and it does so
 * inside its own container — the page body must never scroll horizontally.
 *
 * Note what this is *not*: a drag-to-scroll carousel with arrow buttons. Native
 * overflow scrolling works with a finger, a trackpad, a mouse wheel and the
 * keyboard without any of them being a special case, and the spec forbids a
 * drag-only affordance as the sole path to anything.
 */

const COVER_WIDTH = 92
const COVER_HEIGHT = 138

function Cover({ book }: { book: ShelfBook }) {
  return (
    <YStack width={COVER_WIDTH} gap="$1.5" testID="shelf-book">
      <YStack
        width={COVER_WIDTH}
        height={COVER_HEIGHT}
        borderRadius="$control"
        overflow="hidden"
        backgroundColor="$surfaceAlt"
        alignItems="center"
        justifyContent="center"
        borderWidth={1}
        borderColor="$borderColor"
      >
        {book.image_url ? (
          <Image
            src={book.image_url}
            alt=""
            width={COVER_WIDTH}
            height={COVER_HEIGHT}
            objectFit="cover"
          />
        ) : (
          <BookOpen size={22} color="$colorMuted" />
        )}
      </YStack>
      <Text fontSize={13} lineHeight={17} color="$color" numberOfLines={2}>
        {book.name}
      </Text>
    </YStack>
  )
}

export function BookShelf({
  title,
  count,
  books,
}: {
  title: string
  count?: number
  books: ShelfBook[]
}) {
  if (books.length === 0) return null

  return (
    <YStack gap="$2">
      <XStack alignItems="center" gap="$2">
        <Eyebrow>{title}</Eyebrow>
        {count === undefined ? null : (
          <Text fontSize={12} color="$colorMuted">
            {count}
          </Text>
        )}
      </XStack>
      <XStack
        gap="$3"
        overflow="scroll"
        paddingBottom="$2"
        // Keeps the last cover clear of the viewport edge while scrolled right.
        paddingRight="$2"
      >
        {books.map((book) => (
          <Cover key={book.id} book={book} />
        ))}
      </XStack>
    </YStack>
  )
}
