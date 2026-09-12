import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookDetail, BookStock } from '@/api/book'
import { ApiError } from '@/api/http'
import { searchBooks } from '@/api/search'
import {
  bookQueryOptions,
  useCreateBookFromIsbn,
  useDeleteBookById,
  useDeleteBookStockById,
} from '@/queries/book'
import { isValidIsbn, normaliseIsbn } from '../search/isbn'
import {
  type MetadataLookupFailureKind,
  metadataLookupFailure,
  metadataLookupFailureMessage,
} from '../search/metadataLookupError'
import type { Decode } from './useBarcodeScanner'

/**
 * The add pipeline behind Scan mode: debounce, one serial queue, the library
 * check, the duplicate confirmation, and the undo record for each write.
 *
 * ## Why a decode is not a request
 *
 * The camera reports the same barcode many times a second and the lookup behind
 * each one goes out to Google Books, which is rate-limited and retried three
 * times server-side before it gives up. So a decode is debounced by code,
 * enqueued, and drained one at a time with the same courtesy pause the typed
 * ISBN dialog uses. The camera keeps decoding while the queue drains; scanning
 * is never blocked on the network.
 *
 * ## Why the library is checked before anything is written
 *
 * `POST /book/isbn/:isbn` is find-or-create on the *book* and then **always**
 * adds a stock. It therefore has no "you already have this" outcome to report:
 * it either records a first copy or silently records a second, and the id it
 * answers with does not say which. The `GET /book/search` in front of it is the
 * only place that difference is knowable *before* a row exists.
 *
 * That search matches with `ILIKE '%…%'` (`server/src/routes/BooksRoute.ts`),
 * so a non-empty result set is **not** proof of this exact book — the ISBNs
 * come back and are compared exactly here. Two further cases are treated as
 * "unknown" rather than "not present", because guessing wrong writes a copy
 * nobody asked for:
 *
 *  - the search itself failing, and
 *  - the result set being truncated at the server's page size with no exact
 *    match in it, which is the one way a match could exist and not be seen.
 *
 * ## Undo, and why it leans toward deleting less
 *
 * The create endpoint returns only an id, so "did that create the book or add a
 * copy to one that was already there?" has to be inferred. The inference used
 * here is the search that ran immediately before the write, against the same
 * `books.isbn` column the server keys its own find-or-create on — if that
 * search ran cleanly, saw the whole result set, and found no exact match, the
 * server had nothing to find either. The copy count after the write is a second
 * guard on top of it. Anything short of both means undo removes only the copy,
 * never the book. **Undo must never delete something the user did not add in
 * this session.**
 */

/**
 * How long a code stays "already dealt with".
 *
 * The window is measured from when the code was **last seen**, not from when it
 * was handled: the camera fires many times a second and the book stays in frame
 * after it is dealt with, so a fixed window just moves the re-ask five seconds
 * later. Sliding it means a book sitting in front of the lens is never
 * re-raised, while a deliberate re-scan — take it away, bring it back — still
 * records a genuine extra copy.
 */
export const COOLDOWN_MS = 5000

/**
 * Rate-limit courtesy toward Google Books / Open Library between queue items —
 * the same pause `features/search/AddBookIsbnDialog.tsx` applies to its own
 * sequential run, for the same reason.
 */
export const DELAY_BETWEEN_LOOKUPS_MS = 1500

/** A 502 is the lookup service, not the code. It gets exactly one retry. */
const MAX_RETRIES = 1

/** What undoing one session entry has to do to put the library back. */
export type ScanUndo =
  | { kind: 'book'; bookId: number }
  | { kind: 'stock'; bookId: number; stockId: number }

export type ScanEntryStatus =
  /** A copy was written. */
  | 'added'
  /** Already in the library, and the user chose not to add another copy. */
  | 'skipped'
  /** Was added, then undone. */
  | 'undone'
  /** The metadata lookup did not produce a book (structured or bare 404). */
  | 'notFound'
  /** The add failed and is not being retried. */
  | 'failed'
  /** An `ean_8` / `upc_a` symbol — a real decode, but not a book. */
  | 'notABook'
  /** The lookup service answered 502; this code is going round again. */
  | 'retrying'

export type ScanEntry = {
  id: string
  isbn: string
  status: ScanEntryStatus
  title: string | null
  imageUrl: string | null
  /** Copies the library holds of this book after the write, when known. */
  copies: number | null
  undo: ScanUndo | null
  /** A sentence for the toast, when the status alone does not say enough. */
  message: string | null
  /** Structured metadata failure kind, when the server supplied one. */
  metadataError?: MetadataLookupFailureKind
}

/** The state behind the "already in the library" confirmation. */
export type ScanDuplicatePrompt = {
  isbn: string
  /** Null when the library check failed and the match is merely suspected. */
  bookId: number | null
  title: string | null
  imageUrl: string | null
  /** Null when the count is genuinely unknown. Never guessed. */
  copies: number | null
  /** Shelf names the existing copies sit on, deduplicated. */
  shelves: string[]
}

export type ScanQueue = {
  /** Hand one reading off the camera to the pipeline. Safe to spam. */
  submit: (decode: Decode) => void
  /** Everything this session did, oldest first. */
  entries: ScanEntry[]
  /** Copies written this session and not undone. */
  addedCount: number
  /** Codes accepted but not yet resolved. Never counted as added. */
  pendingCount: number
  /** Non-null while the confirmation is up. Scanning must pause. */
  duplicate: ScanDuplicatePrompt | null
  /** "Add another copy". */
  confirmDuplicate: () => void
  /** "Skip". Writes nothing. */
  skipDuplicate: () => void
  undo: (entryId: string) => void
}

/** Is this a whole result set, or did the server cut it off at its page size? */
function isTruncated(total: number, returned: number): boolean {
  return total > returned
}

/** The copy most likely to be the one just written: the highest id. */
function newestStock(stocks: BookStock[]): BookStock | null {
  return stocks.reduce<BookStock | null>(
    (best, stock) => (best === null || stock.id > best.id ? stock : best),
    null
  )
}

export function useScanQueue({
  locationId,
  onEntry,
}: {
  /** Where copies are shelved. Null lets the server's auto-assign rule decide. */
  locationId: number | null
  /** Called whenever an entry appears or changes — the toast hook. */
  onEntry?: (entry: ScanEntry) => void
}): ScanQueue {
  const queryClient = useQueryClient()
  const createFromIsbn = useCreateBookFromIsbn()
  const deleteBookById = useDeleteBookById()
  const deleteStockById = useDeleteBookStockById()

  const [entries, setEntries] = useState<ScanEntry[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [duplicate, setDuplicate] = useState<ScanDuplicatePrompt | null>(null)

  // The pipeline is one long-lived async loop, so everything it reads lives in
  // a ref. A state value captured in that loop would be whatever it was when
  // the loop started, which for `locationId` is "before the user changed it".
  const queueRef = useRef<string[]>([])
  const inFlightRef = useRef<string | null>(null)
  const drainingRef = useRef(false)
  const handledRef = useRef(new Map<string, number>())
  const retriesRef = useRef(new Map<string, number>())
  const answerRef = useRef<((answer: 'add' | 'skip') => void) | null>(null)
  const disposedRef = useRef(false)
  const nextIdRef = useRef(0)

  const locationRef = useRef(locationId)
  locationRef.current = locationId
  const onEntryRef = useRef(onEntry)
  onEntryRef.current = onEntry

  // Held as refs so the loop can call them without being re-created; the
  // mutation objects themselves are new on every render.
  const createRef = useRef(createFromIsbn)
  createRef.current = createFromIsbn
  const deleteBookRef = useRef(deleteBookById)
  deleteBookRef.current = deleteBookById
  const deleteStockRef = useRef(deleteStockById)
  deleteStockRef.current = deleteStockById

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      // A confirmation still open when the view closes would otherwise leave
      // the drain loop awaiting an answer that can never come.
      answerRef.current?.('skip')
      answerRef.current = null
    }
  }, [])

  const record = useCallback((entry: Omit<ScanEntry, 'id'>): ScanEntry => {
    nextIdRef.current += 1
    const full: ScanEntry = { ...entry, id: `scan-${nextIdRef.current}` }
    setEntries((current) => [...current, full])
    onEntryRef.current?.(full)
    return full
  }, [])

  /**
   * Read one book fresh, and leave it in the cache for the book screen.
   *
   * `staleTime: 0` rather than the query's own 30 seconds: this is read
   * immediately after a write whose whole purpose was to change the stock list,
   * so a cached answer would report the count from before the copy existed.
   */
  const fetchBook = useCallback(
    async (id: number): Promise<BookDetail | null> => {
      try {
        return await queryClient.fetchQuery({ ...bookQueryOptions(id), staleTime: 0 })
      } catch {
        return null
      }
    },
    [queryClient]
  )

  const ask = useCallback((prompt: ScanDuplicatePrompt): Promise<'add' | 'skip'> => {
    setDuplicate(prompt)
    return new Promise((resolve) => {
      answerRef.current = resolve
    })
  }, [])

  const answer = useCallback((choice: 'add' | 'skip') => {
    const resolve = answerRef.current
    answerRef.current = null
    setDuplicate(null)
    resolve?.(choice)
  }, [])

  /**
   * Write one copy and record how to take it back.
   *
   * @param certainlyNew Whether the library check proved, cleanly and in full,
   *   that this ISBN was absent. Only then may undo delete the book itself.
   */
  const write = useCallback(
    async (code: string, certainlyNew: boolean) => {
      const bookId = await createRef.current.mutateAsync({
        isbn: code,
        locationId: locationRef.current,
      })
      const detail = await fetchBook(bookId)
      const stocks = detail?.stocks ?? []
      const copies = detail ? stocks.length : null
      const newest = newestStock(stocks)

      // Both guards, not either: the search proves the server had nothing to
      // find, and a copy count above one proves it did. Disagreement means
      // undo the copy and leave the book alone.
      const created = certainlyNew && (detail === null || stocks.length <= 1)

      const undo: ScanUndo | null = created
        ? { kind: 'book', bookId }
        : newest
          ? { kind: 'stock', bookId, stockId: newest.id }
          : null

      record({
        isbn: code,
        status: 'added',
        title: detail?.name ?? null,
        imageUrl: detail?.image_url ?? null,
        copies,
        undo,
        message: null,
      })
    },
    [fetchBook, record]
  )

  /**
   * One code, start to finish.
   *
   * @returns Whether the code is finished with. `false` means it has been put
   *   back on the queue for its one retry and must not enter the cooldown.
   */
  const process = useCallback(
    async (code: string): Promise<boolean> => {
      let existing: { id: number; name: string; image_url: string | null } | null = null
      let certainlyNew = false

      try {
        const found = await searchBooks({ query: code })
        existing =
          found.books.find((book) => normaliseIsbn(book.isbn ?? '') === code) ?? null
        certainlyNew =
          existing === null && !isTruncated(found.total, found.books.length)
      } catch {
        // "Unknown", not "not present". Falls through to the confirmation below
        // with nothing asserted about the count.
        existing = null
        certainlyNew = false
      }

      if (existing !== null || !certainlyNew) {
        const detail = existing ? await fetchBook(existing.id) : null
        const shelves = [
          ...new Set(
            (detail?.stocks ?? [])
              .map((stock) => stock.location_name)
              .filter((name): name is string => Boolean(name))
          ),
        ]

        const choice = await ask({
          isbn: code,
          bookId: existing?.id ?? null,
          title: detail?.name ?? existing?.name ?? null,
          imageUrl: detail?.image_url ?? existing?.image_url ?? null,
          copies: detail ? detail.stocks.length : null,
          shelves,
        })

        if (disposedRef.current) return true

        if (choice === 'skip') {
          record({
            isbn: code,
            status: 'skipped',
            title: detail?.name ?? existing?.name ?? null,
            imageUrl: detail?.image_url ?? existing?.image_url ?? null,
            copies: detail ? detail.stocks.length : null,
            undo: null,
            message: 'Already in the library — nothing added.',
          })
          return true
        }
      }

      try {
        await write(code, certainlyNew)
        return true
      } catch (cause) {
        const status = cause instanceof ApiError ? cause.status : 0

        if (status === 404) {
          const failure = metadataLookupFailure(cause)
          const isMetadataFailure =
            failure?.kind === 'source_not_configured' || failure?.kind === 'no_metadata'
          record({
            isbn: code,
            status: 'notFound',
            title: null,
            imageUrl: null,
            copies: null,
            undo: null,
            message: isMetadataFailure
              ? metadataLookupFailureMessage(failure)
              : 'No metadata found for this ISBN.',
            ...(isMetadataFailure ? { metadataError: failure.kind } : {}),
          })
          return true
        }

        if (status === 502) {
          const attempts = (retriesRef.current.get(code) ?? 0) + 1
          retriesRef.current.set(code, attempts)
          if (attempts <= MAX_RETRIES) {
            queueRef.current.push(code)
            record({
              isbn: code,
              status: 'retrying',
              title: null,
              imageUrl: null,
              copies: null,
              undo: null,
              message: 'Lookup service unavailable. Trying once more.',
            })
            return false
          }
          record({
            isbn: code,
            status: 'failed',
            title: null,
            imageUrl: null,
            copies: null,
            undo: null,
            message: 'The lookup service is unavailable. Not added.',
          })
          return true
        }

        record({
          isbn: code,
          status: 'failed',
          title: null,
          imageUrl: null,
          copies: null,
          undo: null,
          message: 'Could not be added. Try scanning it again.',
        })
        return true
      }
    },
    [ask, fetchBook, record, write]
  )

  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true

    try {
      for (;;) {
        const code = queueRef.current.shift()
        if (code === undefined) break

        inFlightRef.current = code
        const finished = await process(code)
        inFlightRef.current = null

        if (finished) {
          handledRef.current.set(code, Date.now())
          retriesRef.current.delete(code)
        }
        setPendingCount(queueRef.current.length)

        if (disposedRef.current) break
        if (queueRef.current.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_LOOKUPS_MS))
        }
      }
    } finally {
      inFlightRef.current = null
      drainingRef.current = false
      setPendingCount(queueRef.current.length)
    }
  }, [process])

  const submit = useCallback(
    (decode: Decode) => {
      if (disposedRef.current) return

      // A real symbol that is not a book. Said out loud rather than dropped:
      // silence here reads as a camera that cannot see, and the fix (find the
      // other barcode on the back cover) is something only the user can do.
      if (decode.format === 'ean_8' || decode.format === 'upc_a') {
        const raw = normaliseIsbn(decode.value)
        const key = `not-a-book:${raw}`
        const told = handledRef.current.get(key) ?? 0
        handledRef.current.set(key, Date.now())
        if (Date.now() - told < COOLDOWN_MS) return
        record({
          isbn: raw,
          status: 'notABook',
          title: null,
          imageUrl: null,
          copies: null,
          undo: null,
          message: 'That is not a book barcode. Look for the ISBN one.',
        })
        return
      }

      const code = normaliseIsbn(decode.value)
      // Camera noise is constant; a checksum failure is the normal way a
      // half-seen barcode arrives. Surfacing it would make the screen unusable.
      if (!isValidIsbn(code)) return

      const seen = handledRef.current.get(code)
      if (seen !== undefined && Date.now() - seen < COOLDOWN_MS) {
        // The window slides: it is "five seconds since this code was last
        // seen", not "five seconds since it was dealt with". A book left in
        // frame after being added would otherwise be re-raised as a duplicate
        // at second five, and a book just undone would be re-added — both
        // observed end-to-end before this line. A deliberate re-scan still
        // works: take the book out of frame and bring it back.
        handledRef.current.set(code, Date.now())
        return
      }
      if (inFlightRef.current === code || queueRef.current.includes(code)) return

      queueRef.current.push(code)
      setPendingCount(queueRef.current.length + (inFlightRef.current ? 1 : 0))
      void drain()
    },
    [drain, record]
  )

  const undo = useCallback(
    (entryId: string) => {
      const entry = entries.find((candidate) => candidate.id === entryId)
      if (!entry?.undo) return
      const target = entry.undo

      const run =
        target.kind === 'book'
          ? deleteBookRef.current.mutateAsync(target.bookId)
          : deleteStockRef.current.mutateAsync({
              bookId: target.bookId,
              stockId: target.stockId,
            })

      void run
        .then(() => {
          // Restart the cooldown rather than clearing it. The book is still
          // in frame when Undo is tapped, so clearing it re-adds the copy
          // within the same second — observed end-to-end, and worse than the
          // five-second wait before a deliberate re-scan.
          handledRef.current.set(entry.isbn, Date.now())
          const undone: ScanEntry = {
            ...entry,
            status: 'undone',
            undo: null,
            message:
              target.kind === 'book'
                ? 'Removed from the library.'
                : 'That copy was removed.',
          }
          setEntries((current) =>
            current.map((candidate) => (candidate.id === entryId ? undone : candidate))
          )
          onEntryRef.current?.(undone)
        })
        .catch(() => {
          setEntries((current) =>
            current.map((candidate) =>
              candidate.id === entryId
                ? { ...candidate, message: 'Could not be undone.' }
                : candidate
            )
          )
        })
    },
    [entries]
  )

  return {
    submit,
    entries,
    addedCount: entries.filter((entry) => entry.status === 'added').length,
    pendingCount,
    duplicate,
    confirmDuplicate: useCallback(() => answer('add'), [answer]),
    skipDuplicate: useCallback(() => answer('skip'), [answer]),
    undo,
  }
}
