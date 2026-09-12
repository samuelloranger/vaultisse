import { useEffect, useState } from 'react'

/**
 * Long enough to cover the `"medium"` transition every sheet and dialog in this
 * client closes with. Too short and the close animation plays on an empty
 * frame; too long only delays a garbage collection nobody can see.
 */
const EXIT_MS = 400

/**
 * `true` while something is open, and for as long as it takes to animate shut.
 *
 * ## The problem
 *
 * Tamagui's `Sheet` keeps its children mounted when it is closed. They are
 * parked below the viewport rather than removed, and they are still in the
 * document — which means they are still in the **tab order**. Measured on the
 * library screen at 390px with every dialog closed: 39 tab stops, 24 of them
 * below the fold, including `isbn-input` and `manual-name` at y≈1008 and the
 * whole of the navigation drawer. A keyboard or screen-reader user tabbing
 * through that screen walks into the fields of two dialogs that are not open
 * and a nav that is not showing.
 *
 * It is not a phone-only bug either: the mobile nav `Sheet` is in the tree at
 * every width (it is merely `open={false}` above `sm`), so a **desktop**
 * keyboard user was tabbing through ten rows of a drawer they can never see.
 *
 * The centred `Dialog` branch never had this — `Dialog.Portal` unmounts its
 * contents — so what this restores is not a new rule, it is the behaviour the
 * desktop half of the app already had.
 *
 * ## Why a delay rather than `open` alone
 *
 * `open` alone would tear the body out on the first frame of the close, so the
 * sheet would animate an empty rectangle down the screen. The linger covers the
 * exit; `open || lingering` also means the body is present on the *first* render
 * of an open, which matters for `snapPointsMode="fit"` — the sheet measures its
 * content to decide how tall to be, and there is nothing to measure in an empty
 * frame.
 *
 * ## What it costs
 *
 * The body's own state does not survive a close. That is the accepted price and
 * it is already the desktop behaviour, so nothing can have been relying on it
 * on both platforms. State that has to outlive a close belongs in the component
 * that *renders* the dialog, which is where every caller in this client already
 * keeps it — `AddBookIsbnDialog`'s queue, for one.
 */
export function useMountedWhileOpen(open: boolean, exitMs: number = EXIT_MS): boolean {
  const [lingering, setLingering] = useState(open)

  useEffect(() => {
    if (open) {
      setLingering(true)
      return
    }
    const timer = setTimeout(() => setLingering(false), exitMs)
    return () => clearTimeout(timer)
  }, [open, exitMs])

  return open || lingering
}
