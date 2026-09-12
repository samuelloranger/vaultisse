import { Link } from '@tanstack/react-router'
import { Image, Text, XStack, YStack } from 'tamagui'
import type { SearchBook } from '@/api/search'
import { Eyebrow } from '@/components/Card'
import { BookOpen } from '@/components/icons'

/**
 * The result grid: one poster-style card per book.
 *
 * A real CSS grid (`repeat(auto-fill, minmax(...))`) rather than a wrapping
 * flex row. Both fit three covers into 390px with no media query, but a flex
 * row sizes each row independently, so a final row holding one book stretches
 * that card to the full track width while every row above it is a third of it.
 * `auto-fill` keeps the column count fixed across rows, which is what makes the
 * last row line up with the ones above it.
 *
 * The whole card is the link, not the title inside it: a 12px title is a 12px
 * tap target, and the audit's 44px floor is about the target, not the text.
 */

const COVER_RATIO = 3 / 2

function Cover({ book }: { book: SearchBook }) {
  return (
    <YStack
      width="100%"
      aspectRatio={1 / COVER_RATIO}
      maxWidth="100%"
      borderRadius="$control"
      overflow="hidden"
      backgroundColor="$surfaceAlt"
      borderWidth={1}
      borderColor="$borderColor"
      alignItems="center"
      justifyContent="center"
    >
      {book.image_url ? (
        <Image
          src={book.image_url}
          alt=""
          width="100%"
          height="100%"
          objectFit="cover"
        />
      ) : (
        <BookOpen size={22} color="$colorMuted" />
      )}
    </YStack>
  )
}

export function BookCard({ book }: { book: SearchBook }) {
  return (
    <Link
      to="/book/$book_id"
      params={{ book_id: String(book.id) }}
      // `minWidth: 0` is load-bearing, not tidiness: a grid item's automatic
      // minimum size is its content's min-content width, so without it the
      // longest unbreakable word in a title ("Silencing", an author's surname)
      // widens that column and the grid comes out ragged.
      style={{ textDecoration: 'none', minWidth: 0 }}
      data-testid="book-card"
    >
      <YStack gap="$1.5" minHeight={44} width="100%">
        <Cover book={book} />
        <Text fontSize={13} lineHeight={17} color="$color" numberOfLines={2}>
          {book.name}
        </Text>
        {book.authors.length > 0 ? (
          <Text fontSize={12} lineHeight={15} color="$colorMuted" numberOfLines={1}>
            {book.authors[0].name}
          </Text>
        ) : null}
      </YStack>
    </Link>
  )
}

export function BookGrid({ books }: { books: SearchBook[] }) {
  return (
    <div
      data-testid="book-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
        gap: 12,
      }}
    >
      {books.map((book) => (
        <BookCard key={book.id} book={book} />
      ))}
    </div>
  )
}

/** One category's worth of results, when "group by category" is on. */
export function BookGroup({ title, books }: { title: string; books: SearchBook[] }) {
  return (
    <YStack gap="$2" testID="book-group">
      <XStack alignItems="center" gap="$2">
        <Eyebrow>{title}</Eyebrow>
        <Text fontSize={12} color="$colorMuted">
          {books.length}
        </Text>
      </XStack>
      <BookGrid books={books} />
    </YStack>
  )
}
