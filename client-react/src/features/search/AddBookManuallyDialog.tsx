import { useRef, useState } from 'react'
import { Button, Text, TextArea, XStack, YStack } from 'tamagui'
import { Field } from '@/components/Field'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useCreateBook } from '@/queries/book'
import { isValidIsbn, normaliseIsbn } from './isbn'

/**
 * "Add a book manually" — the fallback when an ISBN lookup finds nothing, and
 * the only way in for anything without a barcode.
 *
 * The cover picker is a **labelled button plus a hidden file input**, not a
 * drop zone. Drag-and-drop is a pointer-only gesture and the spec forbids it as
 * the sole path to an action; the old dialog's `v-file-upload` drop zone was
 * clickable too, but its affordance read as "drag here" on a device with
 * nothing to drag from.
 */
export function AddBookManuallyDialog({
  open,
  onOpenChange,
  onBookCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBookCreated?: (id: number) => void
}) {
  const createBook = useCreateBook()
  const fileInput = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isbn, setIsbn] = useState('')
  const [image, setImage] = useState<File | null>(null)

  const isbnError =
    isbn.trim() !== '' && !isValidIsbn(isbn)
      ? 'That is not a valid ISBN-10 or ISBN-13.'
      : null

  function close() {
    setName('')
    setDescription('')
    setIsbn('')
    setImage(null)
    createBook.reset()
    onOpenChange(false)
  }

  function submit() {
    if (name.trim() === '' || isbnError) return
    createBook.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        isbn: isbn.trim() ? normaliseIsbn(isbn) : undefined,
        image,
      },
      {
        onSuccess: (id) => {
          onBookCreated?.(id)
          close()
        },
      }
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Add a book"
      description="Only the title is required. Everything else can be filled in later."
      actions={
        <>
          <Button
            testID="manual-cancel"
            onPress={close}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            Cancel
          </Button>
          <Button
            testID="manual-submit"
            onPress={submit}
            disabled={name.trim() === '' || Boolean(isbnError) || createBook.isPending}
            opacity={name.trim() === '' ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {createBook.isPending ? 'Adding…' : 'Add book'}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <Field
          testID="manual-name"
          label="Title"
          value={name}
          onChangeText={setName}
          autoComplete="off"
          inputMode="text"
          error={createBook.isError ? errorMessage(createBook.error) : null}
        />

        <YStack gap="$0.75">
          <Text fontSize={14} color="$colorMuted">
            Description
          </Text>
          <TextArea
            testID="manual-description"
            value={description}
            onChangeText={setDescription}
            // 16px so iOS Safari does not zoom on focus; see components/Field.
            fontSize={16}
            minHeight={88}
            borderRadius="$control"
            backgroundColor="$surface"
            borderColor="$borderColor"
          />
        </YStack>

        <Field
          testID="manual-isbn"
          label="ISBN"
          value={isbn}
          onChangeText={setIsbn}
          autoComplete="off"
          inputMode="numeric"
          error={isbnError}
        />

        <YStack gap="$2">
          <Text fontSize={14} color="$colorMuted">
            Cover
          </Text>
          <XStack alignItems="center" gap="$3" flexWrap="wrap">
            <Button
              testID="manual-pick-cover"
              onPress={() => fileInput.current?.click()}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
            >
              Choose an image
            </Button>
            <Text fontSize={14} color="$colorMuted" flexShrink={1}>
              {image ? image.name : 'PNG or JPEG, up to 4MB.'}
            </Text>
          </XStack>
          {/* `display: none`, not a 1x1 transparent box: the visible button
              above is the labelled, focusable control, and a zero-area input
              left in the tree measures as a sub-44px target without being one.
              `.click()` opens the picker either way. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={(event) => setImage(event.target.files?.[0] ?? null)}
          />
        </YStack>
      </YStack>
    </ResponsiveDialog>
  )
}
