import { useEffect, useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { SearchBook } from '@/api/search'
import { Card, DisplayText, Eyebrow, MutedText } from '@/components/Card'
import { Field } from '@/components/Field'
import { EmptyState, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { usePolicy } from '@/queries/app'
import { useSearchBooks } from '@/queries/search'
import { AddBookIsbnDialog } from './AddBookIsbnDialog'
import { AddBookManuallyDialog } from './AddBookManuallyDialog'
import { BookGrid, BookGroup } from './BookGrid'
import { SearchFiltersDialog } from './SearchFiltersDialog'
import {
  clearedFilters,
  countActiveFilters,
  hasActiveFilters,
  type SearchScreenParams,
  toSearchCriteria,
} from './searchParams'

/**
 * The library search screen.
 *
 * ## Why it takes its state as props
 *
 * The screen's filters live in the URL (see `searchParams.ts`), but this
 * component never touches the router: the route module reads and writes the
 * search params and hands them down. That is what lets the screen be rendered
 * directly in a test with seeded cache data, which is the pattern the dashboard
 * established and `test/renderWithProviders.tsx` documents.
 *
 * ## What changed from the Vue implementation
 *
 * - **The filter controls belong to this screen.** The old client moved them
 *   into a menu docked in the global app bar's search box, reachable only
 *   through a module-level `activeSearchController` ref that the app bar wrote
 *   into on mount. The library screen was left rendering removable chips for
 *   filters it had no control to set. They are in a drawer now (see
 *   `SearchFiltersDialog.tsx`), but it is *this screen's* drawer, opened by a
 *   control sitting next to the search box.
 * - **"Group by category" is a labelled control.** It was an icon button whose
 *   only label was a `v-tooltip`, and tooltips never open on touch.
 * - **Paging is a button.** See `queries/search.ts` for why the scroll sentinel
 *   is gone.
 *
 * ## What stays on the page
 *
 * The text box and its Search button. It is the primary way anyone reaches a
 * book, and a drawer for the thing people came to do would be the same mistake
 * the app bar menu was. Everything that *narrows* an already-visible list goes
 * behind "Filters", which carries the count of what it is hiding.
 */

const SORT_OPTIONS = [
  { value: 'NAME_ASC', label: 'Title A–Z' },
  { value: 'NAME_DESC', label: 'Title Z–A' },
  { value: 'DATE_NEWEST', label: 'Newest' },
  { value: 'DATE_OLDEST', label: 'Oldest' },
] as const

const STOCK_OPTIONS = [
  { value: 'HAS_STOCK', label: 'Has copies' },
  { value: 'NO_STOCK', label: 'No copies' },
  { value: 'ON_LOAN', label: 'On loan' },
] as const

/** Split loaded results into one section per category, uncategorised last. */
function groupByCategory(
  books: SearchBook[],
  categories: { id: number; name: string }[]
): { key: string; title: string; books: SearchBook[] }[] {
  const buckets = new Map<number | null, SearchBook[]>()
  for (const book of books) {
    const bucket = buckets.get(book.category_id)
    if (bucket) bucket.push(book)
    else buckets.set(book.category_id, [book])
  }

  const named = [...buckets.entries()]
    .filter(([id]) => id !== null)
    .map(([id, group]) => ({
      key: String(id),
      title: categories.find((c) => c.id === id)?.name ?? 'Unknown category',
      books: group,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const loose = buckets.get(null)
  if (loose) named.push({ key: 'uncategorised', title: 'Uncategorised', books: loose })

  return named
}

export function SearchScreen({
  params,
  onParamsChange,
  onBookCreated,
}: {
  params: SearchScreenParams
  onParamsChange: (next: SearchScreenParams) => void
  /** Where to go once a book has been created. The route module navigates. */
  onBookCreated?: (id: number) => void
}) {
  const { data: policy } = usePolicy()
  const results = useSearchBooks(toSearchCriteria(params))

  const [isbnOpen, setIsbnOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  // Local, not a search param: opening a drawer is not somewhere you navigated
  // to, and putting it in the URL would put it in the history stack and in
  // every link anyone shares.
  const [filtersOpen, setFiltersOpen] = useState(false)

  // The text box is local and applied on submit rather than bound straight to
  // the URL: a navigation and a refetch per keystroke is three requests for
  // "hob" on the way to "hobbit", and the back button would then walk back
  // through every prefix.
  const [text, setText] = useState(params.q ?? '')
  useEffect(() => {
    setText(params.q ?? '')
  }, [params.q])

  function update(patch: Partial<SearchScreenParams>) {
    onParamsChange({ ...params, ...patch })
  }

  const books = results.data?.pages.flatMap((page) => page.books) ?? []
  const total = results.data?.pages[0]?.total ?? 0
  const filtered = hasActiveFilters(params)
  const activeCount = countActiveFilters(params)
  // What the drawer says about itself while it is covering the results.
  const resultSummary = results.isSuccess
    ? total === 1
      ? '1 book matches'
      : `${total} books match`
    : 'Searching the library…'

  return (
    <YStack gap="$4" testID="search-screen">
      <YStack gap="$1">
        <Eyebrow>Library</Eyebrow>
        <XStack alignItems="baseline" gap="$2" flexWrap="wrap">
          <DisplayText fontSize={26} lineHeight={32}>
            Search
          </DisplayText>
          {results.isSuccess ? (
            <MutedText testID="search-total">
              {total === 1 ? '1 book' : `${total} books`}
            </MutedText>
          ) : null}
        </XStack>
      </YStack>

      <XStack gap="$2" flexWrap="wrap">
        <Button
          testID="open-add-isbn"
          onPress={() => setIsbnOpen(true)}
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          backgroundColor="$primary"
          color="$onPrimary"
        >
          Add by ISBN
        </Button>
        <Button
          testID="open-add-manual"
          onPress={() => setManualOpen(true)}
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          backgroundColor="transparent"
          borderColor="$borderColor"
          color="$color"
        >
          Add manually
        </Button>
      </XStack>

      <Card gap="$3" testID="search-filters">
        <Field
          testID="search-query"
          label="Title or ISBN"
          value={text}
          onChangeText={setText}
          onSubmit={() => update({ q: text.trim() || undefined })}
          placeholder="Search the library"
          autoComplete="off"
          inputMode="search"
        />
        <XStack flexWrap="wrap" gap="$2">
          <Button
            testID="search-submit"
            onPress={() => update({ q: text.trim() || undefined })}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            Search
          </Button>
          <Button
            testID="open-filters"
            onPress={() => setFiltersOpen(true)}
            aria-label={
              activeCount === 1 ? 'Filters, 1 active' : `Filters, ${activeCount} active`
            }
            minHeight={44}
            paddingHorizontal="$3"
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor={activeCount > 0 ? '$primary' : '$borderColor'}
          >
            {/* An explicit row rather than bare children: `Button` wraps a lone
                string in its own text node, and mixing that with an element is
                the one thing it does not promise to lay out. */}
            <XStack alignItems="center" gap="$2">
              <Text fontSize={16} color="$color">
                Filters
              </Text>
              {activeCount > 0 ? (
                <Text
                  testID="filters-count"
                  minWidth={22}
                  height={22}
                  lineHeight={22}
                  textAlign="center"
                  paddingHorizontal={6}
                  borderRadius={1000}
                  fontSize={13}
                  fontWeight="600"
                  backgroundColor="$primary"
                  color="$onPrimary"
                >
                  {activeCount}
                </Text>
              ) : null}
            </XStack>
          </Button>
          {filtered ? (
            <Button
              testID="clear-filters"
              onPress={() => onParamsChange(clearedFilters(params))}
              minHeight={44}
              fontSize={15}
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
            >
              Clear filters
            </Button>
          ) : null}
        </XStack>
      </Card>

      <SearchFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        params={params}
        onParamsChange={onParamsChange}
        categories={policy.categories}
        resultSummary={resultSummary}
        sortOptions={SORT_OPTIONS}
        stockOptions={STOCK_OPTIONS}
      />

      {results.isPending ? <ScreenLoading label="Searching the library…" /> : null}

      {results.isError ? (
        <ScreenError
          error={results.error}
          onRetry={() => results.refetch()}
          title="The search did not load"
        />
      ) : null}

      {results.isSuccess && books.length === 0 ? (
        <EmptyState
          title={filtered ? 'Nothing matches those filters' : 'The library is empty'}
          description={
            filtered
              ? 'Try clearing a filter, or widen the date range.'
              : 'Add a book by scanning its ISBN, or enter one by hand.'
          }
          action={
            filtered ? (
              <Button
                testID="empty-clear"
                onPress={() => onParamsChange(clearedFilters(params))}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="$primary"
                color="$onPrimary"
              >
                Clear filters
              </Button>
            ) : (
              <Button
                testID="empty-add"
                onPress={() => setIsbnOpen(true)}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="$primary"
                color="$onPrimary"
              >
                Add by ISBN
              </Button>
            )
          }
        />
      ) : null}

      {results.isSuccess && books.length > 0 ? (
        params.group ? (
          <YStack gap="$4">
            {groupByCategory(books, policy.categories).map((group) => (
              <BookGroup key={group.key} title={group.title} books={group.books} />
            ))}
          </YStack>
        ) : (
          <BookGrid books={books} />
        )
      ) : null}

      {results.hasNextPage ? (
        <XStack>
          <Button
            testID="load-more"
            onPress={() => results.fetchNextPage()}
            disabled={results.isFetchingNextPage}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            {results.isFetchingNextPage
              ? 'Loading…'
              : `Load more (${books.length} of ${total})`}
          </Button>
        </XStack>
      ) : null}

      <AddBookIsbnDialog
        open={isbnOpen}
        onOpenChange={setIsbnOpen}
        onBookCreated={onBookCreated}
      />
      <AddBookManuallyDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onBookCreated={onBookCreated}
      />
    </YStack>
  )
}
