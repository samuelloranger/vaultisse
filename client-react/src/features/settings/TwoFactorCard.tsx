import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import { MutedText } from '@/components/Card'
import { Shield } from '@/components/icons'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useDisableTwoFactor } from '@/queries/user'
import { SettingsSection, TextInputField } from './SettingsControls'
import { TwoFactorSetupDialog } from './TwoFactorSetupDialog'

/**
 * Two-factor authentication: its current state, and the way in or out.
 *
 * Turning it **off** asks for the account password rather than a TOTP code.
 * That asymmetry is deliberate and documented server-side: removing a security
 * layer should be harder to do by accident than adding one, and an unlocked
 * phone holding the authenticator is not evidence of anything.
 */
function TwoFactorDisableDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [password, setPassword] = useState('')
  const disable = useDisableTwoFactor()

  function close() {
    setPassword('')
    disable.reset()
    onOpenChange(false)
  }

  function submit() {
    if (password === '' || disable.isPending) return
    disable.mutate(password, { onSuccess: close })
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Turn off two-factor authentication"
      description="Your backup codes are destroyed as well. Setting it up again issues a new set."
      actions={
        <>
          <Button
            testID="twofactor-disable-cancel"
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
            testID="twofactor-disable-submit"
            onPress={submit}
            disabled={password === '' || disable.isPending}
            opacity={password === '' ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$red10"
            color="$onPrimary"
          >
            {disable.isPending ? 'Turning off…' : 'Turn off'}
          </Button>
        </>
      }
    >
      <TextInputField
        testID="twofactor-disable-password"
        label="Account password"
        value={password}
        onChangeText={setPassword}
        type="password"
        autoComplete="current-password"
        onSubmit={submit}
        error={disable.isError ? errorMessage(disable.error) : null}
      />
    </ResponsiveDialog>
  )
}

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const [setupOpen, setSetupOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  return (
    <SettingsSection
      testID="settings-twofactor"
      title="Two-factor authentication"
      description="A six-digit code from an authenticator app, on top of your password."
    >
      <XStack alignItems="center" gap="$2">
        <Shield size={18} color={enabled ? '$accent' : '$colorMuted'} />
        <Text testID="twofactor-state" fontSize={16} color="$color">
          {enabled ? 'On' : 'Off'}
        </Text>
      </XStack>

      <YStack gap="$2">
        <MutedText fontSize={13}>
          {enabled
            ? 'You are asked for a code after your password at every sign-in.'
            : 'Anyone with your password can sign in as you. Any authenticator app works.'}
        </MutedText>
        <XStack>
          {enabled ? (
            <Button
              testID="twofactor-disable-open"
              onPress={() => setDisableOpen(true)}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
            >
              Turn off
            </Button>
          ) : (
            <Button
              testID="twofactor-setup-open"
              onPress={() => setSetupOpen(true)}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="$primary"
              color="$onPrimary"
            >
              Turn on
            </Button>
          )}
        </XStack>
      </YStack>

      {/* Mounted per opening: the setup call writes a fresh secret each time. */}
      {setupOpen ? <TwoFactorSetupDialog open onOpenChange={setSetupOpen} /> : null}
      {disableOpen ? (
        <TwoFactorDisableDialog open onOpenChange={setDisableOpen} />
      ) : null}
    </SettingsSection>
  )
}
