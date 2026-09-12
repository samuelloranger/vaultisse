import { FocusScope } from '@tamagui/focus-scope'
import { useEffect } from 'react'

/**
 * What makes an open `Sheet` actually modal.
 *
 * ## The bug
 *
 * Tamagui's `Sheet` has no focus management of any kind — `SheetProps` has no
 * focus option, and nothing in the package imports `@tamagui/focus-scope`. So
 * with a dialog open at 390px, Tab walked straight out of the sheet and into
 * the page behind it: the nav, the library rows, the fields of the screen the
 * dialog was covering. For a keyboard or screen-reader user the dialog was not
 * modal at all — it was a picture of a dialog with a live page underneath.
 *
 * Above `sm` the same modal renders as `Dialog`, which does not have this
 * problem, and the reason is exactly the thing being restored here: Tamagui's
 * own `Dialog.Content` wraps its contents in `FocusScope`. So this is not a new
 * mechanism or a hand-rolled trap — it is Tamagui's focus scope, configured the
 * way Tamagui's own `Dialog` configures it, applied to the branch that was
 * missing it. The phone half of the app gets the behaviour the desktop half
 * already had.
 *
 * ## Why `enabled` rather than mounting
 *
 * Keying the scope off `open` is what makes focus come *back*. `FocusScope`
 * captures `document.activeElement` when it becomes enabled and restores it
 * when it stops being enabled, so the trigger that opened the sheet is focused
 * again on close — the part of a focus trap that is most often skipped and the
 * part that matters most, because without it closing a dialog dumps the user at
 * the top of the document. Waiting for the sheet's children to unmount instead
 * (see `useMountedWhileOpen`) would delay that restore by the length of the
 * exit animation.
 *
 * ## Escape
 *
 * Bundled in here rather than left to the caller, because a trap without a
 * keyboard exit is worse than no trap: `Sheet` does not close on Escape the way
 * `Dialog` does, so a sheet that contains focus and ignores Escape is a room
 * with the door locked. Anything that traps focus closes on Escape, and the two
 * cannot be wired up separately by accident.
 */
export function SheetFocusScope({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  /** A single element — `FocusScope` clones a `ref` and `onKeyDown` onto it. */
  children: React.ReactElement
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <FocusScope loop enabled={open} trapped={open} forceUnmount={!open}>
      {children}
    </FocusScope>
  )
}
