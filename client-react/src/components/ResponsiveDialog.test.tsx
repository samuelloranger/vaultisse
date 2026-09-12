import { screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Button, Input } from 'tamagui'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ResponsiveDialog } from './ResponsiveDialog'

/**
 * A closed dialog must not be in the page.
 *
 * Tamagui's `Sheet` — the branch this client takes below `sm`, which is also
 * the branch jsdom takes, since `matchMedia` reports no match — keeps its
 * children mounted when closed and parks them below the viewport. They stay
 * focusable, so a keyboard or screen-reader user tabbing through the library
 * screen walked into the fields of two dialogs that were not open. Measured
 * before the fix at 390px: 39 tab stops, 24 of them below the fold.
 *
 * jsdom has no layout, so "below the viewport" cannot be asserted here — but
 * "in the document at all" is the thing that actually matters, and it is
 * exactly what decides whether Tab reaches it.
 */

function Harness({ startOpen = false }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  return (
    <>
      <Button testID="open" onPress={() => setOpen(true)}>
        Open
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="A dialog"
        actions={
          <Button testID="dialog-action" onPress={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <Input testID="dialog-field" />
      </ResponsiveDialog>
    </>
  )
}

describe('ResponsiveDialog', () => {
  it('keeps a closed dialog out of the document', () => {
    renderWithProviders(<Harness />)

    expect(screen.queryByTestId('dialog-field')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dialog-action')).not.toBeInTheDocument()
  })

  it('renders the body and the actions while open', async () => {
    renderWithProviders(<Harness startOpen />)

    expect(await screen.findByTestId('dialog-field')).toBeInTheDocument()
    expect(screen.getByTestId('dialog-action')).toBeInTheDocument()
  })

  it('keeps the title while closed, so the dialog is still announced', () => {
    // Only the *body* is gated. Title and description are structural rows of
    // the frame and Tamagui wires them to the dialog's accessible name.
    renderWithProviders(<Harness />)

    expect(screen.getByText('A dialog')).toBeInTheDocument()
  })

  it('lets go of the body again after it closes', async () => {
    renderWithProviders(<Harness startOpen />)

    await screen.findByTestId('dialog-field')
    // Closing through the action button, i.e. the way a caller closes.
    screen.getByTestId('dialog-action').click()

    // Not immediately: the body has to outlive the exit animation, or the
    // sheet slides an empty rectangle down the screen.
    expect(screen.getByTestId('dialog-field')).toBeInTheDocument()

    await waitFor(
      () => {
        expect(screen.queryByTestId('dialog-field')).not.toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  })
})
