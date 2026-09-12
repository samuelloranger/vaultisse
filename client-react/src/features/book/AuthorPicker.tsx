import { useId } from 'react'
import { Button, Label, Text, XStack, YStack } from 'tamagui'
import { MutedText } from '@/components/Card'
import { useAuthors } from '@/queries/author'

/**
 * The book's author list, in edit mode.
 *
 * A native `<select>` of the authors not yet on the book, plus one removable
 * chip per author already on it. Not a free-text autocomplete: the server takes
 * author **ids**, so anything typed that does not resolve to a row is a value
 * the form cannot submit, and the old client's `v-autocomplete` handled that by
 * silently dropping it.
 *
 * Each chip is a single button that removes its author, named for assistive
 * tech ("Remove Ursula K. Le Guin") rather than relying on a bare ✕. One
 * control per chip, at the 44px floor, is the same rule the stock rows follow.
 *
 * ## Scaling note
 *
 * This reads the whole `GET /author` list. That is right for a household
 * library and wrong for a few thousand authors; the endpoint built for the
 * latter is `POST /author/search`, which nothing wraps yet. Swapping this
 * component's source is the whole change when that lands.
 */
export function AuthorPicker({
  selected,
  onChange,
}: {
  selected: { id: number; name: string }[]
  onChange: (next: { id: number; name: string }[]) => void
}) {
  const id = useId()
  const authors = useAuthors()

  const selectedIds = new Set(selected.map((author) => author.id))
  const available = (authors.data ?? []).filter((author) => !selectedIds.has(author.id))

  return (
    <YStack gap="$2" width="100%">
      <Label htmlFor={id} fontSize={14} color="$colorMuted" lineHeight={20}>
        Authors
      </Label>

      {selected.length > 0 ? (
        <XStack flexWrap="wrap" gap="$2">
          {selected.map((author) => (
            <Button
              key={author.id}
              testID={`remove-author-${author.id}`}
              aria-label={`Remove ${author.name}`}
              onPress={() => onChange(selected.filter((a) => a.id !== author.id))}
              minHeight={44}
              paddingHorizontal="$3"
              borderRadius="$control"
              fontSize={15}
              backgroundColor="$surfaceAlt"
              borderWidth={1}
              borderColor="$borderColor"
              color="$color"
            >
              {`${author.name}  ✕`}
            </Button>
          ))}
        </XStack>
      ) : null}

      {authors.isError ? (
        <Text fontSize={13} color="$red10">
          The author list did not load, so authors cannot be changed right now.
        </Text>
      ) : (
        <select
          id={id}
          data-testid="add-author"
          // A select whose value is never kept: picking an option is an
          // "add this one" action, and resetting to the placeholder is what
          // lets the same option be picked again after a removal.
          value=""
          disabled={authors.isPending || available.length === 0}
          onChange={(event) => {
            const picked = Number(event.target.value)
            const author = available.find((a) => a.id === picked)
            if (author) onChange([...selected, { id: author.id, name: author.name }])
          }}
          style={{
            fontFamily: 'inherit',
            fontSize: 16,
            minHeight: 44,
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            padding: '0 10px',
            borderRadius: 8,
            border: '1px solid var(--borderControl)',
            background: 'var(--surface)',
            color: 'var(--color)',
          }}
        >
          <option value="">
            {authors.isPending
              ? 'Loading authors…'
              : available.length === 0
                ? 'Every author is already on this book'
                : 'Add an author…'}
          </option>
          {available.map((author) => (
            <option key={author.id} value={author.id}>
              {author.name}
            </option>
          ))}
        </select>
      )}

      <MutedText>
        New authors are created on the authors screen, or automatically by an ISBN
        lookup.
      </MutedText>
    </YStack>
  )
}
