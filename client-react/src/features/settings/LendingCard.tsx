import { Text } from 'tamagui'
import { errorMessage } from '@/components/ScreenState'
import { useSetLeasingEnabled } from '@/queries/user'
import { SettingsSection, ToggleRow } from './SettingsControls'

/**
 * The lending toggle — the one setting on this page that is not about you.
 *
 * It lives under `/user` and arrives inside the policy's `user` object, which
 * makes it look personal in every place it is handled. It is not: the value is
 * `app_settings.leasing_enabled`, a single row for the whole instance, and
 * flipping it adds or removes the Loans and Customers nav entries **for every
 * account**. That moved out of `users` with the shared-library change, for the
 * obvious reason — the loan data is shared, so a per-person switch would hide
 * the nav from one member while the rest kept lending.
 *
 * So the copy says so, plainly and next to the switch rather than in a footnote.
 * A setting whose blast radius is invisible is a setting people flip by
 * accident.
 */
export function LendingCard({ leasingEnabled }: { leasingEnabled: boolean }) {
  const setLeasing = useSetLeasingEnabled()

  return (
    <SettingsSection
      testID="settings-lending"
      title="Lending"
      description="An instance-wide setting. Changing it changes the app for everyone who shares this library."
    >
      <ToggleRow
        testID="lending-toggle"
        label="Track loans and borrowers"
        description="Adds the Loans and Customers sections. Turning it off hides them; nothing that has already been recorded is deleted."
        checked={leasingEnabled}
        disabled={setLeasing.isPending}
        onCheckedChange={(next) => setLeasing.mutate(next)}
      />
      {setLeasing.isError ? (
        <Text testID="lending-error" fontSize={14} color="$red10">
          {errorMessage(setLeasing.error)}
        </Text>
      ) : null}
    </SettingsSection>
  )
}
