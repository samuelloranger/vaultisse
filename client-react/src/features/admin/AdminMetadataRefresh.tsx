import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { BulkMetadataResult } from '@/api/bookMetadataRefresh'
import { Card, DisplayText } from '@/components/Card'
import { errorMessage } from '@/components/ScreenState'
import { metadataFieldNames } from '@/features/book/BookMetadataRefresh'
import { TextInputField } from '@/features/settings/SettingsControls'
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
  return (
    <Card gap="$3" testID="admin-metadata-refresh">
      <DisplayText fontSize={19} lineHeight={26}>
        Refresh book metadata
      </DisplayText>
      <Text fontSize={16} color="$color">
        Choose up to 50 books to fill missing details from catalogues. Existing details
        and covers are kept. Some fields may remain missing.
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
          Choose books
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
        label="Find books by title or ISBN"
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
        Search books
      </Button>
      {search.isPending ? <Text role="status">Loading books…</Text> : null}
      {search.isError ? (
        <YStack gap="$2">
          <Text role="alert" color="$red10">
            {errorMessage(search.error)}
          </Text>
          <Button minHeight={44} onPress={() => search.refetch()}>
            Retry search
          </Button>
        </YStack>
      ) : null}
      {search.isSuccess && books.length === 0 ? (
        <Text>No books match. Try another title or ISBN.</Text>
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
              {!book.isbn ? ' — no ISBN' : ''}
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
          {search.isFetchingNextPage ? 'Loading…' : 'Load more books'}
        </Button>
      ) : null}
      <Text fontSize={14} color="$colorMuted">
        {selected.size} of 50 selected. Selection is kept when you search.
      </Text>
      {selected.size ? (
        <Text fontSize={14} color="$colorMuted" style={{ overflowWrap: 'anywhere' }}>
          Selected: {[...selected.values()].join(', ')}
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
            ? `Refreshing ${selected.size} books…`
            : `Refresh ${selected.size} selected books`}
        </Button>
        <Button
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          disabled={!selected.size || refresh.isPending}
          onPress={() => setSelected(new Map())}
        >
          Clear selection
        </Button>
      </XStack>
      <YStack role="status" aria-live="polite" gap="$2">
        {refresh.isPending ? (
          <Text color="$colorMuted">
            Checking books one at a time. Large selections can take several minutes;
            keep this page open.
          </Text>
        ) : null}
        {refresh.isError ? (
          <Text color="$red10">
            {errorMessage(refresh.error)} Some books may already have refreshed. You can
            retry this selection; existing details are kept.
          </Text>
        ) : null}
        {refresh.isSuccess ? (
          <>
            <Text color="$color">
              {changed} changed · {unchanged} unchanged ·{' '}
              {results.length - changed - unchanged} skipped or failed
            </Text>
            {results.map((result) => (
              <YStack key={result.bookId} gap="$1">
                <Text fontSize={16} color="$color" style={{ overflowWrap: 'anywhere' }}>
                  {result.name ?? `Book ${result.bookId}`}:{' '}
                  {result.changed.length
                    ? `Updated ${metadataFieldNames(result.changed)}.`
                    : RESULT_HELP[result.status]}
                </Text>
                {result.stillMissing.length ? (
                  <Text fontSize={14} color="$colorMuted">
                    Still missing: {metadataFieldNames(result.stillMissing)}. Add these
                    in the book details.
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
