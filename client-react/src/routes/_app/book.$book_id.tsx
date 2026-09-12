import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BookScreen } from '@/features/book/BookScreen'
import { bookQueryOptions } from '@/queries/book'

/**
 * `/app/book/:book_id` — one book.
 *
 * The param is `book_id` rather than `id` because that is what the old client's
 * route called it, and a deep link to a book is the single most shared URL this
 * app has.
 *
 * The id is parsed once here, at the edge, so nothing below this file has to
 * think about the fact that a path segment is a string: the screen, the query
 * key and the API module all take a number.
 */
export const Route = createFileRoute('/_app/book/$book_id')({
  staticData: { title: 'Book' },
  loader: ({ context, params }) => {
    const id = Number(params.book_id)
    if (Number.isInteger(id)) {
      void context.queryClient.prefetchQuery(bookQueryOptions(id))
    }
  },
  component: BookRoute,
})

function BookRoute() {
  const { book_id } = Route.useParams()
  const navigate = useNavigate()

  return (
    <BookScreen
      bookId={Number(book_id)}
      onDeleted={() => navigate({ to: '/library/search' })}
    />
  )
}
