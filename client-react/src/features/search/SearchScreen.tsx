import { useEffect, useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { SearchBook } from '@/api/search'
import { Card, DisplayText, Eyebrow, MutedText } from '@/components/Card'
import { Field } from '@/components/Field'
import { EmptyState, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { useDocumentTitle } from '@/lib/documentTitle'
import { useLocale } from '@/locale/LocaleProvider'
import { usePolicy } from '@/queries/app'
import { useSearchBooks } from '@/queries/search'
import { ScanScreen } from '../scan/ScanScreen'
import { cameraIsPlausible } from '../scan/useBarcodeScanner'
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

/** Split loaded results into one section per category, uncategorised last. */
function groupByCategory(
  books: SearchBook[],
  categories: { id: number; name: string }[],
  translate?: (code: string, fallback: string) => string
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
      title:
        categories.find((c) => c.id === id)?.name ??
        (translate
          ? translate('UNKNOWN_CATEGORY', 'Unknown category')
          : 'Unknown category'),
      books: group,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const loose = buckets.get(null)
  if (loose)
    named.push({
      key: 'uncategorised',
      title: translate ? translate('UNCATEGORISED', 'Uncategorised') : 'Uncategorised',
      books: loose,
    })

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
  const { t, tPlural } = useLocale()
  useDocumentTitle(t('LIBRARY', 'Library'))
  const results = useSearchBooks(toSearchCriteria(params))

  const sortOptions = [
    { value: 'NAME_ASC' as const, label: t('SORT_TITLE_ASC', 'Title A–Z') },
    { value: 'NAME_DESC' as const, label: t('SORT_TITLE_DESC', 'Title Z–A') },
    { value: 'DATE_NEWEST' as const, label: t('SORT_NEWEST', 'Newest') },
    { value: 'DATE_OLDEST' as const, label: t('SORT_OLDEST', 'Oldest') },
  ] as const
  const stockOptions = [
    { value: 'HAS_STOCK' as const, label: t('HAS_COPIES', 'Has copies') },
    { value: 'NO_STOCK' as const, label: t('NO_COPIES', 'No copies') },
    { value: 'ON_LOAN' as const, label: t('ON_LOAN', 'On loan') },
  ] as const

  const [isbnOpen, setIsbnOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualIsbn, setManualIsbn] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  // Asked once, at mount. The answer cannot change without a navigation, and
  // calling it per render would run a capability probe on every keystroke in
  // the search box.
  const [hasCamera] = useState(cameraIsPlausible)
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
    ? tPlural('SEARCH_MATCHES', total, '1 book matches', '{count} books match')
    : t('SEARCHING_LIBRARY', 'Searching the library…')

  return (
    <YStack gap="$4" testID="search-screen">
      <YStack gap="$1">
        <Eyebrow>{t('LIBRARY', 'Library')}</Eyebrow>
        <XStack alignItems="baseline" gap="$2" flexWrap="wrap">
          <DisplayText fontSize={26} lineHeight={32}>
            {t('SEARCH', 'Search')}
          </DisplayText>
          {results.isSuccess ? (
            <MutedText testID="search-total">
              {tPlural('SEARCH_TOTAL', total, '1 book', '{count} books')}
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
          {t('ADD_BY_ISBN', 'Add by ISBN')}
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
          {t('ADD_MANUALLY', 'Add manually')}
        </Button>
        {/* Rendered only where a camera could exist. Not disabled-with-a-
            tooltip: a tooltip never opens on touch, and a control that can
            never work is noise. The typed path above stays the way in. */}
        {hasCamera ? (
          <Button
            testID="open-scan"
            onPress={() => setScanOpen(true)}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            {t('SCAN', 'Scan')}
          </Button>
        ) : null}
      </XStack>

      <Card gap="$3" testID="search-filters">
        <Field
          testID="search-query"
          label={t('TITLE_OR_ISBN', 'Title or ISBN')}
          value={text}
          onChangeText={setText}
          onSubmit={() => update({ q: text.trim() || undefined })}
          placeholder={t('SEARCH_LIBRARY_PLACEHOLDER', 'Search the library')}
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
            {t('SEARCH', 'Search')}
          </Button>
          <Button
            testID="open-filters"
            onPress={() => setFiltersOpen(true)}
            aria-label={
              activeCount === 1
                ? t('FILTERS_ACTIVE_ONE', 'Filters, 1 active')
                : t('FILTERS_ACTIVE', `Filters, ${activeCount} active`, {
                    count: activeCount,
                  })
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
                {t('FILTERS', 'Filters')}
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
              {t('CLEAR_FILTERS', 'Clear filters')}
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
        sortOptions={sortOptions}
        stockOptions={stockOptions}
      />

      {results.isPending ? (
        <ScreenLoading label={t('SEARCHING_LIBRARY', 'Searching the library…')} />
      ) : null}

      {results.isError ? (
        <ScreenError
          error={results.error}
          onRetry={() => results.refetch()}
          title={t('SEARCH_NOT_LOADED', 'The search did not load')}
        />
      ) : null}

      {results.isSuccess && books.length === 0 ? (
        <EmptyState
          title={
            filtered
              ? t('NOTHING_MATCHES_FILTERS', 'Nothing matches those filters')
              : t('LIBRARY_EMPTY', 'The library is empty')
          }
          description={
            filtered
              ? t(
                  'FILTERS_EMPTY_DESC',
                  'Try clearing a filter, or widen the date range.'
                )
              : t(
                  'LIBRARY_EMPTY_DESC',
                  'Add a book by scanning its ISBN, or enter one by hand.'
                )
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
                {t('CLEAR_FILTERS', 'Clear filters')}
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
                {t('ADD_BY_ISBN', 'Add by ISBN')}
              </Button>
            )
          }
        />
      ) : null}

      {results.isSuccess && books.length > 0 ? (
        params.group ? (
          <YStack gap="$4">
            {groupByCategory(books, policy.categories, t).map((group) => (
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
              ? t('LOADING', 'Loading…')
              : t('LOAD_MORE', `Load more (${books.length} of ${total})`, {
                  loaded: books.length,
                  total,
                })}
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
        initialIsbn={manualIsbn}
      />

      <ScanScreen
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onAddManually={(isbn) => {
          setManualIsbn(isbn)
          setManualOpen(true)
        }}
      />
    </YStack>
  )
}
