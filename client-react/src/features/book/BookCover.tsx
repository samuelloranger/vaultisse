import { useRef, useState } from 'react'
import { Button, Image, Spinner, Text, YStack } from 'tamagui'
import { BookOpen } from '@/components/icons'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useUploadBookCover } from '@/queries/book'

/**
 * The book's cover, and the control that replaces it.
 *
 * ## The defect this is written against
 *
 * The old `BookImage.vue` put the entire upload affordance inside
 * `v-if="isHovering"`. There is no hover on touch, so on a phone the cover was
 * a plain image: the click handler still worked, but nothing anywhere said so.
 * A later pass added a persistent badge below `md` — and the badge had
 * `pointer-events: none`, so it advertised an action it could not itself
 * perform, on top of an `@click` on a `v-card` that is a `div`.
 *
 * Here the affordance is a **real button, always visible, at every width**,
 * with a real accessible name. Drag-and-drop still works on a pointer device,
 * as an addition to the button rather than a replacement for it — the spec
 * forbids a drag-only path to anything.
 */
export function BookCover({
  bookId,
  imageUrl,
  title,
}: {
  bookId: number
  imageUrl: string | null
  title: string
}) {
  const upload = useUploadBookCover(bookId)
  const { t } = useLocale()
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function accept(file: File | null | undefined) {
    if (!file) return
    upload.mutate(file)
  }

  return (
    <YStack gap="$2" width="100%" maxWidth={260} testID="book-cover">
      {/* Drag-and-drop is a
          pointer-only enhancement; the button below is the real, focusable
          control and is never hidden. */}
      <YStack
        width="100%"
        aspectRatio={2 / 3}
        borderRadius="$card"
        overflow="hidden"
        backgroundColor="$surfaceAlt"
        borderWidth={dragging ? 2 : 1}
        borderColor={dragging ? '$accent' : '$borderColor'}
        alignItems="center"
        justifyContent="center"
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
        {upload.isPending ? (
          <Spinner size="large" color="$accent" />
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={t('BOOK_COVER_ALT', `Cover of ${title}`, { title })}
            width="100%"
            height="100%"
            objectFit="cover"
          />
        ) : (
          <BookOpen size={32} color="$colorMuted" />
        )}
      </YStack>

      <Button
        testID="change-cover"
        onPress={() => fileInput.current?.click()}
        disabled={upload.isPending}
        minHeight={44}
        fontSize={16}
        borderRadius="$control"
        backgroundColor="transparent"
        borderColor="$borderColor"
        color="$color"
      >
        {imageUrl ? t('REPLACE_COVER', 'Replace cover') : t('ADD_COVER', 'Add a cover')}
      </Button>

      {upload.isError ? (
        <Text fontSize={13} color="$red10">
          {errorMessage(upload.error)}
        </Text>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: 'none' }}
        onChange={(event) => accept(event.target.files?.[0])}
      />
    </YStack>
  )
}
