import { useState } from 'react'
import { Button, XStack, YStack } from 'tamagui'
import { DisplayText, Eyebrow, MutedText } from '@/components/Card'
import { usePolicy } from '@/queries/app'
import { ActivityCard } from './ActivityCard'
import { AppearanceCard } from './AppearanceCard'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { DeleteAccountCard } from './DeleteAccountDialog'
import { LendingCard } from './LendingCard'
import { ProfileCard } from './ProfileCard'
import { SessionsCard } from './SessionsCard'
import { SettingsSection } from './SettingsControls'
import { TwoFactorCard } from './TwoFactorCard'

/**
 * `/app/profile` — the account screen, reached from the nav's "Profile" row.
 *
 * ## Order is the design
 *
 * Everyday things first (profile, appearance), then the instance-wide lending
 * toggle, then security, then deletion. Security is three separate cards rather
 * than one, because "change your password", "turn on 2FA", "who is signed in"
 * and "what happened to my account" are four different questions and a single
 * "Security" accordion makes all four harder to find on a phone.
 *
 * ## Everything on screen comes from the policy or its own query
 *
 * `usePolicy()` resolves from cache — the `_app` loader awaited it — so the
 * user block renders on the first frame with no spinner. Sessions and activity
 * have their own queries and their own loading states, because they are the two
 * things on this page that change without the user doing anything.
 *
 * There is no local copy of any of it. The old settings view read a singleton,
 * wrote back into the same singleton, and left the rest of the app looking at a
 * value nothing had refetched.
 */
export function SettingsScreen() {
  const { data: policy } = usePolicy()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const user = policy.user

  return (
    <YStack gap="$4" testID="settings-screen">
      <YStack gap="$1">
        <Eyebrow>Profile</Eyebrow>
        <DisplayText fontSize={26} lineHeight={32}>
          Your account
        </DisplayText>
        <MutedText>
          Signed in as {user.code}
          {user.isAdmin ? ' · administrator' : ''}
        </MutedText>
      </YStack>

      <ProfileCard user={user} />

      <AppearanceCard />

      <LendingCard leasingEnabled={user.leasingEnabled} />

      <SettingsSection
        testID="settings-password"
        title="Password"
        description="Changing it signs out every other device. This one stays signed in."
      >
        <XStack>
          <Button
            testID="password-open"
            onPress={() => setPasswordOpen(true)}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            Change password
          </Button>
        </XStack>
      </SettingsSection>

      <TwoFactorCard enabled={user.totpEnabled} />

      <SessionsCard />

      <ActivityCard />

      <DeleteAccountCard />

      {/* Mounted per opening, so each one starts from an empty form. */}
      {passwordOpen ? (
        <ChangePasswordDialog open onOpenChange={setPasswordOpen} />
      ) : null}
    </YStack>
  )
}
