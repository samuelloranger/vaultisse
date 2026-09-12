import type { ToastItem } from '@/components/Toast'
import { metadataLookupFailureTitle } from '../search/metadataLookupError'
import type { ScanEntry } from './useScanQueue'

/**
 * The per-add toast: what one {@link ScanEntry} says when it flies past.
 *
 * This is a mapping rather than a component because the pixels already exist —
 * `components/Toast.tsx` owns the surface, and every screen that grows a toast
 * later should get the same one. What is scan-specific is the *wording*, and
 * that is the part worth keeping in one place and reading in a test.
 *
 * ## Why the copy number is in the text
 *
 * "Added" and "Second copy added" are different events and only one of them is
 * ever a mistake. Recording a copy the user did not mean to add is the failure
 * this feature is most likely to produce; the confirmation stops it happening
 * unnoticed, and this wording is what makes it visible on the occasions it
 * happens anyway — including the case where the library check could not prove
 * the book was absent and the server turned out to already have it.
 */

const ORDINALS = [
  '',
  '',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
] as const

/** "Added", "Second copy added", …, "Copy 14 added". */
export function addedTitle(copies: number | null): string {
  if (copies === null || copies <= 1) return 'Added'
  const ordinal = ORDINALS[copies]
  return ordinal ? `${ordinal} copy added` : `Copy ${copies} added`
}

/**
 * Turn a session entry into a toast.
 *
 * @param onUndo Offered only where there is something to undo.
 * @param onAddManually Offered on a metadata 404 — either a catalogue gap or
 *   a source configuration problem — so the user has a manual recovery path.
 */
export function scanEntryToast(
  entry: ScanEntry,
  {
    onUndo,
    onAddManually,
  }: {
    onUndo: (entryId: string) => void
    onAddManually: (isbn: string) => void
  }
): Omit<ToastItem, 'id'> | null {
  switch (entry.status) {
    case 'added':
      return {
        title: addedTitle(entry.copies),
        description: entry.title ?? entry.isbn,
        imageUrl: entry.imageUrl,
        tone: 'success',
        action: entry.undo ? { label: 'Undo', onPress: () => onUndo(entry.id) } : null,
      }

    case 'skipped':
      return {
        title: 'Skipped',
        description: entry.title ?? entry.isbn,
        imageUrl: entry.imageUrl,
        tone: 'neutral',
      }

    case 'undone':
      return {
        title: 'Undone',
        description: entry.message ?? entry.title ?? entry.isbn,
        tone: 'neutral',
      }

    case 'notFound':
      return {
        title: metadataLookupFailureTitle(entry.metadataError),
        description: entry.message ?? entry.isbn,
        tone: 'neutral',
        action: {
          label: 'Add manually',
          onPress: () => onAddManually(entry.isbn),
        },
      }

    case 'notABook':
      return {
        title: 'Not a book barcode',
        description: entry.message,
        tone: 'neutral',
      }

    case 'retrying':
      return {
        title: 'Lookup service unavailable',
        description: entry.message,
        tone: 'danger',
      }

    case 'failed':
      return {
        title: 'Not added',
        description: entry.message ?? entry.isbn,
        tone: 'danger',
      }

    default:
      return null
  }
}
