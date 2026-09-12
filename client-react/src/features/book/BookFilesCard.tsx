import { useRef, useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { type BookFile, bookFileDownloadUrl } from '@/api/book'
import { Card, Eyebrow, MutedText } from '@/components/Card'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useDeleteBookFile, useUploadBookFile } from '@/queries/book'

/**
 * The book's backed-up ebook files — at most one each of epub, pdf and mobi.
 *
 * ## Affordances
 *
 * The old client showed a drop zone with "drag a file here" as the empty state.
 * A drag gesture does not exist on a touch device, so on a phone the empty
 * state described an action that could not be performed — the `@click` on the
 * same `div` worked, but nothing said so. Here the button is the affordance at
 * every width and dropping is an addition to it.
 *
 * ## Download is a link, not a fetch
 *
 * `GET /book/:id/file/:fileId/download` answers `Content-Disposition:
 * attachment`, so a plain href hands the transfer to the browser: a progress
 * indicator, a resumable download, and no copy of a 10MB file in JS memory.
 * The whole row is the link rather than a 21px icon beside it.
 *
 * In-browser preview (the old `BookFilePreviewDialog`, epub.js) is not ported
 * here: the spec keeps `epubjs` but defers it, and a reader is its own screen.
 */

const TYPE_LABEL: Record<BookFile['file_type'], string> = {
  epub: 'EPUB',
  pdf: 'PDF',
  mobi: 'Kindle',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function BookFilesCard({
  bookId,
  files,
  maxFileSizeMb,
}: {
  bookId: number
  files: BookFile[]
  maxFileSizeMb?: number
}) {
  const { formatDate } = useLocale()
  const upload = useUploadBookFile(bookId)
  const remove = useDeleteBookFile(bookId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<BookFile | null>(null)
  const [dragging, setDragging] = useState(false)

  function accept(file: File | null | undefined) {
    if (!file) return
    upload.mutate(file)
  }

  return (
    <Card gap="$2" testID="book-files">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$3"
        flexWrap="wrap"
      >
        <XStack alignItems="baseline" gap="$2">
          <Eyebrow>Ebook files</Eyebrow>
          <MutedText>{files.length}</MutedText>
        </XStack>
        <Button
          testID="add-file"
          onPress={() => fileInput.current?.click()}
          disabled={upload.isPending}
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          backgroundColor="$primary"
          color="$onPrimary"
        >
          {upload.isPending ? 'Uploading…' : 'Add a file'}
        </Button>
      </XStack>

      {upload.isError ? (
        <Text testID="file-error" fontSize={14} color="$red10">
          {errorMessage(upload.error)}
        </Text>
      ) : null}

      {files.length === 0 ? (
        // Dropping is a
        // pointer-only enhancement; "Add a file" above is the real control.
        <YStack
          gap="$1"
          paddingVertical="$4"
          alignItems="center"
          borderWidth={dragging ? 2 : 1}
          borderColor={dragging ? '$accent' : '$borderColor'}
          borderRadius="$control"
          backgroundColor="$surfaceAlt"
          onDragOver={(event: React.DragEvent) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event: React.DragEvent) => {
            event.preventDefault()
            setDragging(false)
            accept(event.dataTransfer?.files?.[0])
          }}
        >
          <MutedText textAlign="center">
            No backup file yet. EPUB, PDF or Kindle
            {maxFileSizeMb ? `, up to ${maxFileSizeMb}MB` : ''}.
          </MutedText>
        </YStack>
      ) : (
        <YStack>
          {files.map((file) => (
            <XStack
              key={file.id}
              testID="file-row"
              gap="$3"
              flexWrap="wrap"
              alignItems="center"
              paddingVertical="$2"
              borderTopWidth={1}
              borderTopColor="$borderColor"
            >
              <a
                href={bookFileDownloadUrl(bookId, file.id)}
                download={file.file_name}
                data-testid={`download-${file.id}`}
                style={{
                  flexGrow: 1,
                  flexBasis: 180,
                  minWidth: 0,
                  minHeight: 44,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  textDecoration: 'none',
                }}
              >
                <Text fontSize={15} color="$color" numberOfLines={1}>
                  {file.file_name}
                </Text>
                <MutedText>
                  {TYPE_LABEL[file.file_type]} · {formatSize(file.file_size)} ·{' '}
                  {formatDate(file.date_created)}
                </MutedText>
              </a>
              <Button
                testID={`remove-file-${file.id}`}
                onPress={() => setPendingDelete(file)}
                aria-label={`Remove ${file.file_name}`}
                minHeight={44}
                fontSize={15}
                borderRadius="$control"
                backgroundColor="transparent"
                borderColor="$borderColor"
                color="$color"
              >
                Remove
              </Button>
            </XStack>
          ))}
        </YStack>
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".epub,.pdf,.mobi,.azw3"
        style={{ display: 'none' }}
        onChange={(event) => accept(event.target.files?.[0])}
      />

      <ResponsiveDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
        title="Remove this file?"
        description={pendingDelete?.file_name}
        actions={
          <>
            <Button
              testID="file-delete-cancel"
              onPress={() => setPendingDelete(null)}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
            >
              Keep it
            </Button>
            <Button
              testID="file-delete-confirm"
              onPress={() => {
                if (!pendingDelete) return
                remove.mutate(pendingDelete.id, {
                  onSuccess: () => setPendingDelete(null),
                })
              }}
              disabled={remove.isPending}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="$red10"
              color="$onDanger"
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </>
        }
      >
        <Text fontSize={15} color="$color">
          The catalogue entry stays; only the backed-up file is deleted.
        </Text>
      </ResponsiveDialog>
    </Card>
  )
}
