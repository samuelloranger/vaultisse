import { useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import { MutedText } from '@/components/Card'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useDeleteAccount } from '@/queries/user'
import { SettingsSection, TextInputField } from './SettingsControls'

/**
 * Deleting your own account.
 *
 * ## What it actually does, said before it is done
 *
 * It removes the `users` row — sessions, backup codes and acknowledgements
 * cascade with it — and **leaves every book, copy, author, location and loan
 * where it is.** Those foreign keys are `created_by ... ON DELETE SET NULL`,
 * because this is one shared library: taking a member's contributions with them
 * would empty the household's shelves. That is the single most important
 * sentence in this dialog, and it belongs here rather than in the docs, because
 * this is the moment someone is deciding.
 *
 * ## Two gates, both real
 *
 * The account password, which the server checks (rate limited to 5 attempts per
 * 5 minutes, so a stolen session cookie cannot be used to brute-force it), and
 * typing the word `delete`, which nothing checks but a person. The first stops
 * a borrowed session; the second stops a misfire.
 *
 * On success the browser is already on its way to `/login` — the server answers
 * a redirect, and `api/user.ts` documents why that arrives looking like a
 * failure and is treated as the success it is.
 */
const CONFIRMATION_WORD = 'delete'

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const remove = useDeleteAccount()

  const ready =
    password !== '' && confirmation.trim().toLowerCase() === CONFIRMATION_WORD

  function close() {
    setPassword('')
    setConfirmation('')
    remove.reset()
    setOpen(false)
  }

  function submit() {
    if (!ready || remove.isPending) return
    remove.mutate(password)
  }

  return (
    <SettingsSection
      testID="settings-danger"
      tone="danger"
      title="Delete account"
      description="Permanent. Your books stay in the shared library; only your account goes."
    >
      <YStack>
        <Button
          testID="delete-account-open"
          onPress={() => setOpen(true)}
          minHeight={44}
          fontSize={16}
          alignSelf="flex-start"
          borderRadius="$control"
          backgroundColor="transparent"
          borderColor="$borderColor"
          // Not red at rest. The warning belongs at the moment of choosing.
          color="$color"
        >
          Delete my account
        </Button>
      </YStack>

      {open ? (
        <ResponsiveDialog
          open
          onOpenChange={(next) => (next ? undefined : close())}
          title="Delete your account?"
          description="This cannot be undone."
          actions={
            <>
              <Button
                testID="delete-account-cancel"
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
                testID="delete-account-confirm"
                onPress={submit}
                disabled={!ready || remove.isPending}
                opacity={ready ? 1 : 0.5}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="$red10"
                color="$onPrimary"
              >
                {remove.isPending ? 'Deleting…' : 'Delete account'}
              </Button>
            </>
          }
        >
          <YStack gap="$3">
            <MutedText fontSize={14}>
              Everything you added to the library — books, copies, authors, locations,
              loan history — stays exactly where it is. It simply stops saying it was
              added by you.
            </MutedText>
            <TextInputField
              testID="delete-account-password"
              label="Account password"
              value={password}
              onChangeText={setPassword}
              type="password"
              autoComplete="current-password"
            />
            <TextInputField
              testID="delete-account-word"
              label={`Type "${CONFIRMATION_WORD}" to confirm`}
              value={confirmation}
              onChangeText={setConfirmation}
              autoComplete="off"
              inputMode="text"
              onSubmit={submit}
            />
            {remove.isError ? (
              <Text testID="delete-account-error" fontSize={14} color="$red10">
                {errorMessage(remove.error)}
              </Text>
            ) : null}
          </YStack>
        </ResponsiveDialog>
      ) : null}
    </SettingsSection>
  )
}
