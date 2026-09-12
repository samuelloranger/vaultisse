import { Text, YStack } from 'tamagui'
import { errorMessage, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { SettingsSection, ToggleRow } from '@/features/settings/SettingsControls'
import { useAdminSettings, useUpdateInstanceSettings } from '@/queries/admin'

/**
 * Admin → **Library**. The settings that describe the shared collection.
 *
 * ## Why this is not on the profile screen any more
 *
 * The lending toggle used to sit between "Appearance" and "Password" on
 * `/app/profile`, where it looked exactly like the two personal preferences on
 * either side of it. It is not one: the value is `app_settings.leasing_enabled`,
 * a single row for the whole instance, and flipping it adds or removes the
 * Loans and Customers nav entries **for every account**. It was also writable
 * by every account, which is the other half of the same bug — see
 * `server/src/routes/admin/AdminSettingsRoute.ts`.
 *
 * A setting whose blast radius is invisible is a setting people flip by
 * accident. Putting it behind the admin panel is the structural version of the
 * warning the card used to have to print.
 *
 * ## Why the controls are imported from `features/settings`
 *
 * `SettingsSection` and `ToggleRow` are a titled card with a 44px switch in it —
 * nothing about them is specific to *whose* settings they show, and this tab
 * needs to look like the profile screen it is a sibling of. A second copy under
 * `features/admin` would be the same component with a different switch-track
 * bug history.
 *
 * ## What is deliberately absent
 *
 * `app_settings.is_public_institution` is the other instance column, and there
 * is no control for it here. It gates a post-login security notice that this
 * client has no dialog for — it was never ported from the Vue client — so a
 * switch for it could only ever turn on a screen that does not render. There is
 * no endpoint to set it either; both arrive together when the dialog does.
 */
export function AdminLibraryTab() {
  const settings = useAdminSettings()
  const update = useUpdateInstanceSettings()

  if (settings.isPending) return <ScreenLoading label="Loading settings…" />

  if (settings.isError) {
    return (
      <ScreenError
        error={settings.error}
        onRetry={() => settings.refetch()}
        title="Settings did not load"
      />
    )
  }

  return (
    <YStack gap="$3" testID="admin-library">
      <SettingsSection
        testID="settings-lending"
        title="Lending"
        description="An instance-wide setting. Changing it changes the app for everyone who shares this library."
      >
        <ToggleRow
          testID="lending-toggle"
          label="Track loans and borrowers"
          description="Adds the Loans and Customers sections. Turning it off hides them; nothing that has already been recorded is deleted."
          checked={settings.data.leasingEnabled}
          disabled={update.isPending}
          onCheckedChange={(next) => update.mutate({ leasingEnabled: next })}
        />
        {update.isError ? (
          <Text testID="lending-error" fontSize={14} color="$red10">
            {errorMessage(update.error)}
          </Text>
        ) : null}
      </SettingsSection>
    </YStack>
  )
}
