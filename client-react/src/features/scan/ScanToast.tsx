import type { ToastItem } from '@/components/Toast'
import type { InterpolationValues } from '@/locale/LocaleProvider'
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
type Translate = (
  code: string,
  fallback: string,
  values?: InterpolationValues
) => string

export function addedTitle(copies: number | null, translate?: Translate): string {
  if (copies === null || copies <= 1)
    return translate ? translate('SCAN_ADDED', 'Added') : 'Added'
  const ordinal = ORDINALS[copies]
  return translate
    ? translate(
        ordinal ? `SCAN_${copies}_COPY_ADDED` : 'SCAN_COPY_ADDED',
        ordinal ? `${ordinal} copy added` : `Copy ${copies} added`,
        { count: copies, ordinal: ordinal ?? '' }
      )
    : ordinal
      ? `${ordinal} copy added`
      : `Copy ${copies} added`
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
    translate,
  }: {
    onUndo: (entryId: string) => void
    onAddManually: (isbn: string) => void
    translate?: Translate
  }
): Omit<ToastItem, 'id'> | null {
  switch (entry.status) {
    case 'added':
      return {
        title: addedTitle(entry.copies, translate),
        description: entry.title ?? entry.isbn,
        imageUrl: entry.imageUrl,
        tone: 'success',
        action: entry.undo
          ? {
              label: translate ? translate('UNDO', 'Undo') : 'Undo',
              onPress: () => onUndo(entry.id),
            }
          : null,
      }

    case 'skipped':
      return {
        title: translate ? translate('SKIPPED', 'Skipped') : 'Skipped',
        description: entry.title ?? entry.isbn,
        imageUrl: entry.imageUrl,
        tone: 'neutral',
      }

    case 'undone':
      return {
        title: translate ? translate('UNDONE', 'Undone') : 'Undone',
        description: entry.message ?? entry.title ?? entry.isbn,
        tone: 'neutral',
      }

    case 'notFound':
      return {
        title: metadataLookupFailureTitle(entry.metadataError, translate),
        description: entry.message ?? entry.isbn,
        tone: 'neutral',
        action: {
          label: translate ? translate('ADD_MANUALLY', 'Add manually') : 'Add manually',
          onPress: () => onAddManually(entry.isbn),
        },
      }

    case 'notABook':
      return {
        title: translate
          ? translate('NOT_A_BOOK_BARCODE', 'Not a book barcode')
          : 'Not a book barcode',
        description: entry.message,
        tone: 'neutral',
      }

    case 'retrying':
      return {
        title: translate
          ? translate('LOOKUP_SERVICE_UNAVAILABLE', 'Lookup service unavailable')
          : 'Lookup service unavailable',
        description: entry.message,
        tone: 'danger',
      }

    case 'failed':
      return {
        title: translate ? translate('NOT_ADDED', 'Not added') : 'Not added',
        description: entry.message ?? entry.isbn,
        tone: 'danger',
      }

    default:
      return null
  }
}
