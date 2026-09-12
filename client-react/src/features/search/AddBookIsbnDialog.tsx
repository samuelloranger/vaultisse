import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { ApiError } from '@/api/http'
import { Field } from '@/components/Field'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { usePolicy } from '@/queries/app'
import { useCreateBookFromIsbn } from '@/queries/book'
import { isValidIsbn, normaliseIsbn } from './isbn'
import { FilterChip } from './SearchControls'

/**
 * "Add book(s) by ISBN".
 *
 * A queue, not a single field, because the physical act is scanning a stack of
 * books one after another — and because the lookup behind each one is a
 * rate-limited external API that the server retries three times before falling
 * back to Open Library. Entries are therefore submitted **sequentially with a
 * pause between them**, exactly as the old client did, rather than in parallel.
 *
 * ## What is carried over, and what is not
 *
 * Carried over: the per-row outcome is rendered as **text under the ISBN**, not
 * as a coloured icon with a tooltip. This is the one place in the flow where
 * someone learns an import failed, and a tooltip never opens on touch.
 *
 * Not carried over: the camera scanner. It is worth having back — as
 * `BarcodeDetector` with a `@zxing/browser` fallback, per the spec — but it can
 * never be the only way in, so the typed field lands first and the scanner
 * becomes an addition to it.
 */

type Outcome = 'queued' | 'working' | 'created' | 'notFound' | 'failed'

const OUTCOME_TEXT: Record<Outcome, string | null> = {
  queued: null,
  working: 'Looking it up…',
  created: 'Added to the library.',
  notFound: 'No metadata found for this ISBN. Add it manually instead.',
  failed: 'Could not be added. Try again.',
}

/** Rate-limit courtesy toward Google Books / Open Library, as the old client did. */
const DELAY_BETWEEN_LOOKUPS_MS = 1500

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function AddBookIsbnDialog({
  open,
  onOpenChange,
  onBookCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the new book's id when exactly one was added. */
  onBookCreated?: (id: number) => void
}) {
  const { data: policy } = usePolicy()
  const createFromIsbn = useCreateBookFromIsbn()

  const [isbn, setIsbn] = useState('')
  const [entryError, setEntryError] = useState<string | null>(null)
  const [queue, setQueue] = useState<{ isbn: string; outcome: Outcome }[]>([])
  const [locationId, setLocationId] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  function reset() {
    setIsbn('')
    setEntryError(null)
    setQueue([])
    setLocationId(null)
    setRunning(false)
    createFromIsbn.reset()
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  function enqueue() {
    const code = normaliseIsbn(isbn)
    if (!isValidIsbn(code)) {
      setEntryError('That is not a valid ISBN-10 or ISBN-13.')
      return
    }
    if (queue.some((entry) => entry.isbn === code)) {
      setEntryError('That ISBN is already in the list.')
      return
    }
    setQueue((current) => [...current, { isbn: code, outcome: 'queued' }])
    setIsbn('')
    setEntryError(null)
  }

  function mark(code: string, outcome: Outcome) {
    setQueue((current) =>
      current.map((entry) => (entry.isbn === code ? { ...entry, outcome } : entry))
    )
  }

  async function run() {
    if (queue.length === 0 || running) return
    setRunning(true)

    const codes = queue.map((entry) => entry.isbn)
    const created: number[] = []

    for (const code of codes) {
      mark(code, 'working')
      try {
        const id = await createFromIsbn.mutateAsync({ isbn: code, locationId })
        created.push(id)
        mark(code, 'created')
      } catch (error) {
        // 404 is the server's "no metadata match", which is a different thing
        // from the lookup itself failing — and a different thing to tell
        // someone, because only one of the two is worth retrying.
        mark(
          code,
          error instanceof ApiError && error.status === 404 ? 'notFound' : 'failed'
        )
      }
      if (code !== codes[codes.length - 1]) await delay(DELAY_BETWEEN_LOOKUPS_MS)
    }

    setRunning(false)

    if (created.length === codes.length) {
      if (created.length === 1 && onBookCreated) onBookCreated(created[0])
      close()
    }
  }

  const pending = queue.filter((entry) => entry.outcome !== 'created').length

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Add books by ISBN"
      description="Type or scan an ISBN and press Enter to queue it. Add as many as you like."
      actions={
        <>
          <Button
            testID="isbn-cancel"
            onPress={close}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            {queue.some((entry) => entry.outcome === 'created') ? 'Close' : 'Cancel'}
          </Button>
          <Button
            testID="isbn-submit"
            onPress={run}
            disabled={pending === 0 || running}
            opacity={pending === 0 ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {running ? 'Adding…' : `Add ${pending || ''}`.trim()}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <Field
          testID="isbn-input"
          label="ISBN"
          value={isbn}
          onChangeText={(next) => {
            setIsbn(next)
            setEntryError(null)
          }}
          onSubmit={enqueue}
          placeholder="e.g. 9780261102217"
          autoComplete="off"
          // The barcode under a book is digits: give the numeric keypad.
          inputMode="numeric"
          error={entryError}
          disabled={running}
        />

        <XStack>
          <Button
            testID="isbn-enqueue"
            onPress={enqueue}
            disabled={running}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            Add to list
          </Button>
        </XStack>

        {policy.locations.length > 1 ? (
          <YStack gap="$2">
            <Text fontSize={14} color="$colorMuted">
              Shelve the new copies at
            </Text>
            <XStack flexWrap="wrap" gap="$2">
              <FilterChip
                label="Decide later"
                selected={locationId === null}
                onPress={() => setLocationId(null)}
              />
              {policy.locations.map((location) => (
                <FilterChip
                  key={location.id}
                  label={location.name}
                  selected={locationId === location.id}
                  onPress={() => setLocationId(location.id)}
                />
              ))}
            </XStack>
          </YStack>
        ) : null}

        {queue.length > 0 ? (
          <YStack gap="$2" testID="isbn-queue">
            {queue.map((entry) => {
              const status = OUTCOME_TEXT[entry.outcome]
              return (
                <YStack
                  key={entry.isbn}
                  gap="$0.5"
                  paddingVertical="$2"
                  borderTopWidth={1}
                  borderTopColor="$borderColor"
                >
                  <Text fontFamily="$mono" fontSize={14} color="$color">
                    {entry.isbn}
                  </Text>
                  {status ? (
                    <Text
                      fontSize={13}
                      color={
                        entry.outcome === 'created'
                          ? '$colorMuted'
                          : entry.outcome === 'working'
                            ? '$colorMuted'
                            : '$red10'
                      }
                    >
                      {status}
                    </Text>
                  ) : null}
                </YStack>
              )
            })}
          </YStack>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
