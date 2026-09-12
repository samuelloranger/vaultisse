import { Button, Text, useMedia, XStack, YStack } from 'tamagui'
import { Card, MutedText } from '@/components/Card'
import { RowActions } from './RowActions'
import type { EntityRowAction } from './types'

/**
 * One row in a catalogue list.
 *
 * ## The layout is the design judgment from the spec, not a style choice
 *
 * "List rows go title-first and full-width with metadata on a second line."
 * The name owns the first line and is allowed to wrap; the count and the
 * description — everything that used to compete with it horizontally — drop to
 * a muted second line. At 390px the old arrangement gave a three-line location
 * name roughly 180px to share with a count chip and three buttons.
 *
 * ## There is at most one tap target besides the actions control
 *
 * When the row expands, the *whole title block* is the toggle — a full-width,
 * 44px-tall target — and the actions control sits outside it rather than nested
 * inside. Nesting one pressable in another means relying on event propagation
 * order to decide what a tap meant, which is precisely the kind of thing that
 * behaves differently under a finger than under a mouse.
 *
 * There is deliberately no chevron. A chevron is a second control that looks
 * separately tappable, carries no label, and on touch cannot explain itself; the
 * expand state is stated in words instead ("6 copies · Show"), which is legible
 * and costs no extra target.
 */
export function EntityRow({
  name,
  meta,
  actions,
  expandable,
  expanded,
  onToggleExpand,
  expandHint,
  children,
  testID,
}: {
  name: string
  meta?: React.ReactNode
  actions: EntityRowAction[]
  expandable: boolean
  expanded: boolean
  onToggleExpand: () => void
  /** Trailing text on the meta line, below `sm`: "Show books" / "Hide books". */
  expandHint?: string
  /** The expanded body. Rendered only while open, so its query starts then. */
  children?: React.ReactNode
  testID: string
}) {
  // Above `sm` the actions render as an inline strip, and one of them already
  // says "Show books" in full. Repeating it in the meta line there would put
  // the same words on screen twice, a foot apart. Below `sm` the strip is a
  // closed menu, so the hint is the only thing that names the gesture.
  const media = useMedia()
  const showExpandHint = Boolean(expandHint) && !media.sm

  const titleBlock = (
    <YStack flex={1} minWidth={0} gap="$1" paddingVertical="$2">
      <Text
        fontSize={16}
        fontWeight="600"
        color="$color"
        // No `numberOfLines`: the name is the row, and it wraps rather than
        // truncating. Truncating is what forced it to compete for width before.
      >
        {name}
      </Text>
      {meta || showExpandHint ? (
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          {meta}
          {showExpandHint ? (
            <MutedText fontSize={13} color="$accent">
              {expandHint}
            </MutedText>
          ) : null}
        </XStack>
      ) : null}
    </YStack>
  )

  return (
    <Card testID={testID} spine="left" padding={0} gap={0}>
      <XStack alignItems="center" gap="$2" paddingHorizontal="$3" minHeight={56}>
        {expandable ? (
          <Button
            testID={`${testID}-toggle`}
            // A real `<button>`, not a div with `role="button"`: Enter and
            // Space then activate it for free. `unstyled` drops the default
            // fixed height so a wrapped two-line name still fits.
            unstyled
            flex={1}
            minWidth={0}
            minHeight={44}
            flexDirection="row"
            alignItems="center"
            justifyContent="flex-start"
            backgroundColor="transparent"
            borderWidth={0}
            cursor="pointer"
            aria-expanded={expanded}
            onPress={onToggleExpand}
          >
            {titleBlock}
          </Button>
        ) : (
          titleBlock
        )}

        <RowActions actions={actions} entityName={name} testID={`${testID}-actions`} />
      </XStack>

      {expanded && children ? (
        <YStack borderTopWidth={1} borderTopColor="$borderColor">
          {children}
        </YStack>
      ) : null}
    </Card>
  )
}
