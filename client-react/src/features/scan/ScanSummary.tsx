import { Button, Image, Text, XStack, YStack } from 'tamagui'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { addedTitle } from './ScanToast'
import type { ScanEntry, ScanEntryStatus } from './useScanQueue'

/**
 * What the session did, shown on the way out.
 *
 * A toast is gone in five seconds and the camera is pointed at the next book by
 * then. Landing back in the library with no record of what just happened is how
 * a mis-scan becomes a mystery next week — so Done reports the run, in order,
 * with every write still undoable until this closes.
 *
 * Two statuses are deliberately absent: a non-book barcode and the transient
 * retry notice. Neither wrote anything and neither is a thing to act on later;
 * they are toast-only. A *second* failed lookup does appear, because that code
 * was accepted, never added, and would otherwise be lost silently.
 */

const SUMMARY_STATUSES: ReadonlySet<ScanEntryStatus> = new Set([
  'added',
  'undone',
  'skipped',
  'notFound',
  'failed',
])

function statusLine(entry: ScanEntry): string {
  switch (entry.status) {
    case 'added':
      return addedTitle(entry.copies)
    case 'undone':
      return entry.message ?? 'Undone'
    case 'skipped':
      return 'Skipped — already in the library'
    case 'notFound':
      return entry.message ?? 'No metadata found for this ISBN'
    default:
      return entry.message ?? 'Not added'
  }
}

export function ScanSummary({
  open,
  entries,
  onUndo,
  onClose,
}: {
  open: boolean
  entries: ScanEntry[]
  onUndo: (entryId: string) => void
  onClose: () => void
}) {
  const shown = entries.filter((entry) => SUMMARY_STATUSES.has(entry.status))
  const added = entries.filter((entry) => entry.status === 'added').length

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Scan session"
      description={
        added === 0
          ? 'Nothing was added to the library.'
          : added === 1
            ? '1 copy added to the library.'
            : `${added} copies added to the library.`
      }
      actions={
        <Button
          testID="scan-summary-close"
          onPress={onClose}
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          backgroundColor="$primary"
          color="$onPrimary"
        >
          Done
        </Button>
      }
    >
      {shown.length === 0 ? (
        <Text fontSize={15} color="$colorMuted">
          No books were scanned.
        </Text>
      ) : (
        <YStack testID="scan-summary-list" gap="$1">
          {shown.map((entry) => (
            <XStack
              key={entry.id}
              gap="$3"
              alignItems="center"
              paddingVertical="$2"
              borderTopWidth={1}
              borderTopColor="$borderColor"
            >
              {entry.imageUrl ? (
                <Image
                  source={{ uri: entry.imageUrl }}
                  width={32}
                  height={46}
                  borderRadius={4}
                  objectFit="cover"
                  flexShrink={0}
                  alt=""
                />
              ) : null}

              <YStack flex={1} minWidth={0} gap="$0.5">
                <Text fontSize={15} color="$color" numberOfLines={2}>
                  {entry.title ?? entry.isbn}
                </Text>
                <Text fontSize={13} color="$colorMuted">
                  {statusLine(entry)}
                </Text>
              </YStack>

              {entry.undo ? (
                <Button
                  testID={`scan-summary-undo-${entry.id}`}
                  onPress={() => onUndo(entry.id)}
                  minHeight={44}
                  paddingHorizontal="$3"
                  fontSize={15}
                  borderRadius="$control"
                  backgroundColor="transparent"
                  borderColor="$borderColor"
                  color="$color"
                  flexShrink={0}
                >
                  Undo
                </Button>
              ) : null}
            </XStack>
          ))}
        </YStack>
      )}
    </ResponsiveDialog>
  )
}
