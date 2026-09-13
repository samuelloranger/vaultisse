import { Button, Image, Text, XStack, YStack } from 'tamagui'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { useLocale } from '@/locale/LocaleProvider'
import type { ScanDuplicatePrompt } from './useScanQueue'

/**
 * "This one is already in the library — add another copy?"
 *
 * ## Why this interrupts a mode built around not interrupting
 *
 * `POST /book/isbn/:isbn` always adds a copy and never says whether the book
 * was already there, so an unattended scan of a shelf that overlaps the library
 * silently doubles it. Quietly recording a copy nobody meant to add is the one
 * failure this feature is most likely to produce, and it is invisible until
 * someone counts their shelves. So it asks, once per book, and **nothing is
 * written until it is answered** — the write happens after this resolves, not
 * before.
 *
 * ## Skip is the weighted action
 *
 * The premise of Scan mode is fast unattended adding; the thing it must not do
 * unattended is duplicate. So Skip carries the primary fill and sits last
 * (right / bottom-most), which is also where dismissing the sheet lands you:
 * tapping the overlay or pressing Escape is a Skip, never an add.
 */
export function ScanDuplicateDialog({
  prompt,
  onAddCopy,
  onSkip,
}: {
  /** Null when nothing is being asked. */
  prompt: ScanDuplicatePrompt | null
  onAddCopy: () => void
  onSkip: () => void
}) {
  const copies = prompt?.copies ?? null
  const { t, tPlural } = useLocale()

  const countLine =
    copies === null
      ? t(
          'DUPLICATE_CHECK_UNAVAILABLE',
          'The library could not be checked just now, so this book may or may not already be recorded.'
        )
      : copies === 1
        ? t('ONE_COPY_RECORDED', 'One copy is already recorded.')
        : tPlural(
            'COPIES_RECORDED',
            copies,
            '1 copy is already recorded.',
            '{count} copies are already recorded.'
          )

  return (
    <ResponsiveDialog
      open={prompt !== null}
      // Dismissing without choosing is a Skip. See this file's header.
      onOpenChange={(next) => {
        if (!next) onSkip()
      }}
      title={t('ALREADY_IN_LIBRARY', 'Already in the library')}
      description={t(
        'SCANNING_PAUSED_DUPLICATE',
        'Scanning is paused until you answer. Nothing has been added yet.'
      )}
      actions={
        <>
          <Button
            testID="scan-duplicate-add"
            onPress={onAddCopy}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            {t('ADD_ANOTHER_COPY', 'Add another copy')}
          </Button>
          <Button
            testID="scan-duplicate-skip"
            onPress={onSkip}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {t('SKIP', 'Skip')}
          </Button>
        </>
      }
    >
      <XStack gap="$3" alignItems="flex-start">
        {prompt?.imageUrl ? (
          <Image
            source={{ uri: prompt.imageUrl }}
            width={64}
            height={94}
            borderRadius={6}
            objectFit="cover"
            flexShrink={0}
            alt=""
          />
        ) : null}

        <YStack flex={1} minWidth={0} gap="$2">
          <Text fontFamily="$heading" fontSize={18} color="$color">
            {prompt?.title ?? t('THIS_ISBN', 'This ISBN')}
          </Text>
          <Text
            testID="scan-duplicate-isbn"
            fontFamily="$mono"
            fontSize={14}
            color="$colorMuted"
          >
            {prompt?.isbn ?? ''}
          </Text>
          <Text testID="scan-duplicate-copies" fontSize={15} color="$color">
            {countLine}
          </Text>
          {prompt?.shelves.length ? (
            <Text fontSize={14} color="$colorMuted">
              {t('SHELVED_AT', `Shelved at ${prompt.shelves.join(', ')}.`, {
                shelves: prompt.shelves.join(', '),
              })}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </ResponsiveDialog>
  )
}
