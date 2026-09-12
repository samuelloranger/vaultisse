import { useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import { weakPasswordRules } from '@/api/user'
import { MutedText } from '@/components/Card'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useChangePassword } from '@/queries/user'
import { TextInputField } from './SettingsControls'

/**
 * Change the account password.
 *
 * ## This tab must not be logged out
 *
 * Changing the password bumps `users.token_version`, which kills every token
 * issued for this account — including the one this browser is holding. The
 * server prevents that from mattering by reissuing a cookie for *this* session
 * (same `sid`) in the same response, so the correct client behaviour is to do
 * nothing: no redirect, no reload, no "please sign in again". Every other
 * device is signed out, and the dialog says so before the fact rather than
 * leaving it to be discovered.
 *
 * ## Three password rules, none of them invented here
 *
 *  - `autoComplete="current-password"` and `"new-password"` are what let a
 *    password manager fill the first and offer to save the second. The old
 *    client had neither, which is why it could do neither.
 *  - The requirements are listed up front, not revealed by a rejection. The
 *    server answers a `400` carrying the exact rules that failed; those are
 *    rendered as they arrive.
 *  - The confirmation field is checked locally, because it is the one error the
 *    server has no way to see.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const changePassword = useChangePassword()

  const mismatch = confirmation !== '' && confirmation !== newPassword
  const ready =
    currentPassword !== '' && newPassword !== '' && confirmation === newPassword

  function close() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmation('')
    changePassword.reset()
    onOpenChange(false)
  }

  function submit() {
    if (!ready || changePassword.isPending) return
    changePassword.mutate({ currentPassword, newPassword }, { onSuccess: close })
  }

  const unmetRules = changePassword.isError
    ? weakPasswordRules(changePassword.error)
    : null

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Change password"
      description="Your other devices are signed out. This one stays signed in."
      actions={
        <>
          <Button
            testID="password-cancel"
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
            testID="password-submit"
            onPress={submit}
            disabled={!ready || changePassword.isPending}
            opacity={ready ? 1 : 0.5}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {changePassword.isPending ? 'Saving…' : 'Change password'}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <TextInputField
          testID="password-current"
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          type="password"
          autoComplete="current-password"
        />
        <TextInputField
          testID="password-new"
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with an uppercase letter, a number and a special character."
        />
        <TextInputField
          testID="password-confirm"
          label="Repeat new password"
          value={confirmation}
          onChangeText={setConfirmation}
          type="password"
          autoComplete="new-password"
          error={mismatch ? 'The two passwords do not match.' : null}
          onSubmit={submit}
        />

        {unmetRules ? (
          <YStack gap="$1" testID="password-rules">
            <Text fontSize={14} color="$red10">
              That password is missing:
            </Text>
            {unmetRules.map((rule) => (
              <MutedText key={rule} fontSize={14}>
                • {rule}
              </MutedText>
            ))}
          </YStack>
        ) : changePassword.isError ? (
          <Text testID="password-error" fontSize={14} color="$red10">
            {errorMessage(changePassword.error)}
          </Text>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
