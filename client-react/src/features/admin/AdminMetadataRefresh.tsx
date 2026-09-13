import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { BulkMetadataResult } from '@/api/bookMetadataRefresh'
import { Card, DisplayText } from '@/components/Card'
import { errorMessage } from '@/components/ScreenState'
import { metadataFieldNames } from '@/features/book/BookMetadataRefresh'
import { TextInputField } from '@/features/settings/SettingsControls'
import { useLocale } from '@/locale/LocaleProvider'
import { useRefreshBooksMetadata } from '@/queries/bookMetadataRefresh'
import { useSearchBooks } from '@/queries/search'

const RESULT_HELP: Record<BulkMetadataResult['results'][number]['status'], string> = {
  ok: 'No new metadata found.',
  no_isbn: 'Add a valid ISBN in the book details, then retry.',
  no_metadata: 'No metadata returned. Check the ISBN or try again later.',
  not_found: 'Book no longer exists. Remove it from your selection.',
  error: 'Refresh failed. Try this book again.',
  isbn_changed: 'The ISBN changed during the lookup. Try this book again.',
}

export function AdminMetadataRefresh() {
  const [choosing, setChoosing] = useState(false)
  const { t } = useLocale()
  return (
    <Card gap="$3" testID="admin-metadata-refresh">
      <DisplayText fontSize={19} lineHeight={26}>
        {t('REFRESH_BOOK_METADATA', 'Refresh book metadata')}
      </DisplayText>
      <Text fontSize={16} color="$color">
        {t(
          'REFRESH_BOOK_METADATA_DESC',
          'Choose up to 50 books to fill missing details from catalogues. Existing details and covers are kept. Some fields may remain missing.'
        )}
      </Text>
      {choosing ? (
        <BookSelection />
      ) : (
        <Button
          alignSelf="flex-start"
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          onPress={() => setChoosing(true)}
        >
          {t('CHOOSE_BOOKS', 'Choose books')}
        </Button>
      )}
    </Card>
  )
}

function BookSelection() {
  const [query, setQuery] = useState('')
  const [criteria, setCriteria] = useState('')
  const [selected, setSelected] = useState<Map<number, string>>(new Map())
  const search = useSearchBooks({ query: criteria })
  const refresh = useRefreshBooksMetadata()
  const { t, tPlural } = useLocale()
  const books = search.data?.pages.flatMap((page) => page.books) ?? []
  const results = refresh.data?.results ?? []
  const changed = results.filter(
    (result) => result.status === 'ok' && result.changed.length > 0
  ).length
  const unchanged = results.filter(
    (result) => result.status === 'ok' && result.changed.length === 0
  ).length
  const toggle = (id: number, name: string) =>
    setSelected((previous) => {
      const next = new Map(previous)
      if (next.has(id)) next.delete(id)
      else if (next.size < 50) next.set(id, name)
      return next
    })
  return (
    <YStack gap="$3" minWidth={0}>
      <TextInputField
        label={t('FIND_BOOKS_TITLE_ISBN', 'Find books by title or ISBN')}
        value={query}
        onChangeText={setQuery}
        autoComplete="off"
        disabled={refresh.isPending}
        onSubmit={() => setCriteria(query)}
      />
      <Button
        alignSelf="flex-start"
        minHeight={44}
        fontSize={16}
        borderRadius="$control"
        disabled={refresh.isPending}
        onPress={() => setCriteria(query)}
      >
        {t('SEARCH_BOOKS', 'Search books')}
      </Button>
      {search.isPending ? (
        <Text role="status">{t('LOADING_BOOKS', 'Loading books…')}</Text>
      ) : null}
      {search.isError ? (
        <YStack gap="$2">
          <Text role="alert" color="$red10">
            {errorMessage(search.error)}
          </Text>
          <Button minHeight={44} onPress={() => search.refetch()}>
            {t('RETRY_SEARCH', 'Retry search')}
          </Button>
        </YStack>
      ) : null}
      {search.isSuccess && books.length === 0 ? (
        <Text>{t('NO_BOOKS_MATCH', 'No books match. Try another title or ISBN.')}</Text>
      ) : null}
      <YStack>
        {books.map((book) => (
          <label
            key={book.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 44,
              paddingBlock: 8,
              color: 'var(--color)',
              fontSize: 16,
              overflowWrap: 'anywhere',
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(book.id)}
              disabled={
                refresh.isPending || (!selected.has(book.id) && selected.size >= 50)
              }
              onChange={() => toggle(book.id, book.name)}
              style={{
                appearance: 'auto',
                width: 20,
                height: 20,
                flexShrink: 0,
                accentColor: 'var(--accent)',
              }}
            />
            <span>
              {book.name}
              {!book.isbn ? ` — ${t('NO_ISBN', 'no ISBN')}` : ''}
            </span>
          </label>
        ))}
      </YStack>
      {search.hasNextPage ? (
        <Button
          minHeight={44}
          fontSize={16}
          disabled={refresh.isPending || search.isFetchingNextPage}
          onPress={() => search.fetchNextPage()}
        >
          {search.isFetchingNextPage
            ? t('LOADING', 'Loading…')
            : t('LOAD_MORE_BOOKS', 'Load more books')}
        </Button>
      ) : null}
      <Text fontSize={14} color="$colorMuted">
        {t(
          'BOOKS_SELECTED',
          `${selected.size} of 50 selected. Selection is kept when you search.`,
          {
            size: selected.size,
          }
        )}
      </Text>
      {selected.size ? (
        <Text fontSize={14} color="$colorMuted" style={{ overflowWrap: 'anywhere' }}>
          {t('SELECTED_BOOKS', `Selected: ${[...selected.values()].join(', ')}`, {
            books: [...selected.values()].join(', '),
          })}
        </Text>
      ) : null}
      <XStack gap="$2" flexWrap="wrap">
        <Button
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          disabled={!selected.size || refresh.isPending}
          onPress={() => {
            if (selected.size && !refresh.isPending)
              refresh.mutate([...selected.keys()])
          }}
        >
          {refresh.isPending
            ? tPlural(
                'REFRESHING_BOOKS',
                selected.size,
                'Refreshing {count} book…',
                'Refreshing {count} books…'
              )
            : tPlural(
                'REFRESH_SELECTED_BOOKS',
                selected.size,
                'Refresh {count} selected book',
                'Refresh {count} selected books'
              )}
        </Button>
        <Button
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          disabled={!selected.size || refresh.isPending}
          onPress={() => setSelected(new Map())}
        >
          {t('CLEAR_SELECTION', 'Clear selection')}
        </Button>
      </XStack>
      <YStack role="status" aria-live="polite" gap="$2">
        {refresh.isPending ? (
          <Text color="$colorMuted">
            {t(
              'CHECKING_BOOKS',
              'Checking books one at a time. Large selections can take several minutes; keep this page open.'
            )}
          </Text>
        ) : null}
        {refresh.isError ? (
          <Text color="$red10">
            {errorMessage(refresh.error)}{' '}
            {t(
              'REFRESH_PARTIAL_ERROR',
              'Some books may already have refreshed. You can retry this selection; existing details are kept.'
            )}
          </Text>
        ) : null}
        {refresh.isSuccess ? (
          <>
            <Text color="$color">
              {t(
                'REFRESH_RESULT_SUMMARY',
                `${changed} changed · ${unchanged} unchanged · ${results.length - changed - unchanged} skipped or failed`,
                {
                  changed,
                  unchanged,
                  skipped: results.length - changed - unchanged,
                }
              )}
            </Text>
            {results.map((result) => (
              <YStack key={result.bookId} gap="$1">
                <Text fontSize={16} color="$color" style={{ overflowWrap: 'anywhere' }}>
                  {result.name ??
                    t('BOOK_ID', `Book ${result.bookId}`, { id: result.bookId })}
                  :{' '}
                  {result.changed.length
                    ? t(
                        'METADATA_UPDATED',
                        `Updated ${metadataFieldNames(result.changed, t)}.`,
                        {
                          fields: metadataFieldNames(result.changed, t),
                        }
                      )
                    : t(
                        `ADMIN_METADATA_${result.status.toUpperCase()}`,
                        RESULT_HELP[result.status]
                      )}
                </Text>
                {result.stillMissing.length ? (
                  <Text fontSize={14} color="$colorMuted">
                    {t(
                      'ADMIN_METADATA_STILL_MISSING',
                      `Still missing: ${metadataFieldNames(result.stillMissing, t)}. Add these in the book details.`,
                      { fields: metadataFieldNames(result.stillMissing, t) }
                    )}
                  </Text>
                ) : null}
              </YStack>
            ))}
          </>
        ) : null}
      </YStack>
    </YStack>
  )
}
