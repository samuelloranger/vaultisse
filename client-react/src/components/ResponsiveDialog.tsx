import { Dialog, Sheet, useMedia, XStack, YStack } from 'tamagui'
import { SheetFocusScope } from './SheetFocusScope'
import { useMountedWhileOpen } from './useMountedWhileOpen'

/**
 * A modal that is a bottom `Sheet` on phones and a centred `Dialog` from `sm`
 * (640px) up.
 *
 * ## Why this is a component and not a prop on each dialog
 *
 * The old client wrote `:fullscreen="smAndDown"` on every `v-dialog` and then
 * needed a block of global CSS to make the *card inside* the dialog stretch
 * too — otherwise a body taller than the screen pushed the action row off the
 * bottom edge, which is the exact failure the fullscreen switch was meant to
 * remove. Every new dialog was one forgotten prop away from reintroducing it.
 *
 * Here the layout rules are structural and there is nothing to remember:
 *
 *  - **No fixed pixel heights, ever.** The sheet sizes to its content and caps
 *    at the dynamic viewport; the dialog caps at `85dvh`.
 *  - **The action row is pinned**, outside the scrolling region, above the home
 *    indicator (`env(safe-area-inset-bottom)`). It cannot go off-screen because
 *    it is not in the part that scrolls.
 *  - **Only the body scrolls.** Title and actions are fixed rows of a column.
 *  - **A closed dialog is not in the tab order.** Tamagui's `Sheet` keeps its
 *    children mounted and parked below the viewport, still focusable; the body
 *    and the action row are therefore mounted only while the dialog is open
 *    (plus its exit animation). See `useMountedWhileOpen`.
 *  - **An open dialog contains the tab order.** The `Dialog` branch gets that
 *    from Tamagui; the `Sheet` branch has no focus handling at all and gets it
 *    from `SheetFocusScope`, which also owns the Escape key.
 *
 * Every modal in this client goes through this component. If one needs
 * something this does not offer, extend this rather than hand-rolling a
 * `Dialog` beside it.
 */

export type ResponsiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  /** The pinned action row. Put the primary action last (right). */
  actions?: React.ReactNode
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <YStack
      flex={1}
      minHeight={0}
      overflow="scroll"
      gap="$3"
      paddingHorizontal="$4"
      paddingVertical="$3"
    >
      {children}
    </YStack>
  )
}

function Actions({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <XStack
      flexShrink={0}
      gap="$3"
      justifyContent="flex-end"
      flexWrap="wrap"
      paddingHorizontal="$4"
      paddingTop="$3"
      // Clear of the home-indicator strip on a notched phone. A literal 12px
      // rather than `$3` inside the calc(): Tamagui substitutes a token only
      // when it *is* the whole value, never inside a CSS function string.
      paddingBottom="$3"
      $maxSm={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      borderTopWidth={1}
      borderTopColor="$borderColor"
    >
      {children}
    </XStack>
  )
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
}: ResponsiveDialogProps) {
  const media = useMedia()
  const isSheet = !media.sm
  // The whole reason a closed dialog is not a screenful of phantom controls.
  // Applied to both branches rather than just the sheet: `Dialog.Portal`
  // already unmounts, so this changes nothing there, and one rule beats two.
  const mounted = useMountedWhileOpen(open)

  if (isSheet) {
    return (
      <Sheet
        modal
        open={open}
        onOpenChange={onOpenChange}
        // Content-sized with a ceiling, not a fixed height: `fit` measures the
        // body, and the sheet frame's own maxHeight caps it at the viewport.
        snapPointsMode="fit"
        dismissOnSnapToBottom
        transition="medium"
      >
        <Sheet.Overlay
          transition="quick"
          backgroundColor="$shadow6"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Handle />
        <Sheet.Frame
          backgroundColor="$surface"
          borderTopLeftRadius="$card"
          borderTopRightRadius="$card"
          maxHeight="92dvh"
          paddingTop="$3"
        >
          <SheetFocusScope open={open} onClose={() => onOpenChange(false)}>
            <YStack testID="dialog-focus-scope" flex={1} minHeight={0}>
              <YStack paddingHorizontal="$4" paddingBottom="$2" gap="$1">
                <Dialog.Title fontFamily="$heading" fontSize={20} color="$color">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description fontSize={14} color="$colorMuted">
                    {description}
                  </Dialog.Description>
                ) : null}
              </YStack>
              <Body>{mounted ? children : null}</Body>
              <Actions>{mounted ? actions : null}</Actions>
            </YStack>
          </SheetFocusScope>
        </Sheet.Frame>
      </Sheet>
    )
  }

  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          transition="quick"
          backgroundColor="$shadow6"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Dialog.Content
          key="content"
          transition="medium"
          enterStyle={{ opacity: 0, scale: 0.97 }}
          exitStyle={{ opacity: 0, scale: 0.97 }}
          backgroundColor="$surface"
          borderColor="$borderColor"
          borderWidth={1}
          borderRadius="$card"
          padding={0}
          width={560}
          // Never wider than the window minus a gutter. `%` rather than `vw`:
          // `100vw` includes the scrollbar and overflows by its width.
          maxWidth="calc(100% - 32px)"
          maxHeight="85dvh"
        >
          <YStack flex={1} minHeight={0}>
            <YStack paddingHorizontal="$4" paddingTop="$4" paddingBottom="$2" gap="$1">
              <Dialog.Title fontFamily="$heading" fontSize={20} color="$color">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description fontSize={14} color="$colorMuted">
                  {description}
                </Dialog.Description>
              ) : null}
            </YStack>
            <Body>{mounted ? children : null}</Body>
            <Actions>{mounted ? actions : null}</Actions>
          </YStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  )
}
