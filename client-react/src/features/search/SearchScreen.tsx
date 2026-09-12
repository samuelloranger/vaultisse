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
import { DateField, FilterChip } from './SearchControls'
import {
  clearedFilters,
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
 * - **The filter controls are on the screen.** The old client moved them into a
 *   menu docked in the global app bar's search box, reachable only through a
 *   module-level `activeSearchController` ref that the app bar wrote into on
 *   mount. The library screen was left rendering removable chips for filters it
 *   had no control to set.
 * - **"Group by category" is a labelled control.** It was an icon button whose
 *   only label was a `v-tooltip`, and tooltips never open on touch.
 * - **Paging is a button.** See `queries/search.ts` for why the scroll sentinel
 *   is gone.
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
        <XStack>
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
        </XStack>

        <YStack gap="$2">
          <Text fontSize={14} color="$colorMuted">
            Category
          </Text>
          <XStack flexWrap="wrap" gap="$2">
            <FilterChip
              testID="category-all"
              label="All"
              selected={params.categoryId === undefined}
              onPress={() => update({ categoryId: undefined })}
            />
            {policy.categories.map((category) => (
              <FilterChip
                key={category.id}
                testID={`category-${category.id}`}
                label={category.name}
                selected={params.categoryId === category.id}
                onPress={() =>
                  update({
                    categoryId:
                      params.categoryId === category.id ? undefined : category.id,
                  })
                }
              />
            ))}
          </XStack>
        </YStack>

        <YStack gap="$2">
          <Text fontSize={14} color="$colorMuted">
            Copies
          </Text>
          <XStack flexWrap="wrap" gap="$2">
            <FilterChip
              testID="stock-any"
              label="Any"
              selected={params.stock === undefined}
              onPress={() => update({ stock: undefined })}
            />
            {STOCK_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                testID={`stock-${option.value}`}
                label={option.label}
                selected={params.stock === option.value}
                onPress={() =>
                  update({
                    stock: params.stock === option.value ? undefined : option.value,
                  })
                }
              />
            ))}
            <FilterChip
              testID="filter-recent"
              label="Added recently"
              selected={params.recent === true}
              onPress={() => update({ recent: params.recent ? undefined : true })}
            />
          </XStack>
        </YStack>

        <YStack gap="$2">
          <Text fontSize={14} color="$colorMuted">
            Added between
          </Text>
          <XStack flexWrap="wrap" gap="$3">
            <YStack flexGrow={1} flexBasis={150} minWidth={0}>
              <DateField
                testID="date-from"
                label="From"
                value={params.from ?? ''}
                onChange={(next) => update({ from: next || undefined })}
              />
            </YStack>
            <YStack flexGrow={1} flexBasis={150} minWidth={0}>
              <DateField
                testID="date-to"
                label="To"
                value={params.to ?? ''}
                onChange={(next) => update({ to: next || undefined })}
              />
            </YStack>
          </XStack>
        </YStack>

        <YStack gap="$2">
          <Text fontSize={14} color="$colorMuted">
            Sort
          </Text>
          <XStack flexWrap="wrap" gap="$2">
            {SORT_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                testID={`sort-${option.value}`}
                label={option.label}
                selected={(params.sort ?? 'NAME_ASC') === option.value}
                onPress={() => update({ sort: option.value })}
              />
            ))}
          </XStack>
        </YStack>

        <XStack flexWrap="wrap" gap="$2">
          {/* A named control, not an icon with a tooltip. */}
          <FilterChip
            testID="toggle-group"
            label="Group by category"
            selected={params.group === true}
            onPress={() => update({ group: params.group ? undefined : true })}
          />
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
