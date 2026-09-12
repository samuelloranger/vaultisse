import { Text, YStack } from 'tamagui'
import type { InstanceSettingsPatch } from '@/api/admin'
import { MutedText } from '@/components/Card'
import { errorMessage, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { REGIONS, UI_LANGUAGES } from '@/features/settings/accountOptions'
import {
  ChoiceRow,
  SelectField,
  SettingsSection,
  ToggleRow,
} from '@/features/settings/SettingsControls'
import { useAdminSettings, useUpdateInstanceSettings } from '@/queries/admin'

/**
 * Admin → **New accounts**. What the next person to register starts out as.
 *
 * ## These change nothing anybody can see, and the copy has to say so
 *
 * Everything on this tab is read exactly once, by `POST /register`, for one
 * account, at the moment it is created. Setting the default language to Spanish
 * does not move a single existing member off English — and an admin who
 * believes otherwise has just failed to do the thing they came here to do. So
 * the tab says it at the top rather than burying it per-field.
 *
 * That is also the whole argument for this being a separate tab from Library
 * rather than one longer list: the two groups differ in exactly the way an
 * admin needs to know about, which is whether flipping the switch changes the
 * app for the six people already here or only for the seventh.
 *
 * ## Approval used to be an environment variable
 *
 * `REGISTRATION_REQUIRES_APPROVAL` in `.env`, so turning it on meant editing a
 * file and restarting the container, and there was no UI for it at all. It is
 * now a column — but a nullable one, because an instance that has never been
 * touched from here is still being decided by that env var. The hint under the
 * switch says which of the two is currently in charge, because "on" that
 * survives a restart and "on" that a redeploy could silently undo are different
 * promises. Writing it once settles it for good.
 *
 * ## What is not configurable, on purpose
 *
 * **The role.** The first account on an instance is always an admin and always
 * enabled; every account after it is a plain member. That is the bootstrap
 * path — approval means "an admin has to enable you", and on a fresh install
 * there is nobody to do it, so a configurable first role is an instance that
 * can lock itself out with no way back in. Promotion is a decision somebody
 * makes on the Accounts tab afterwards, one account at a time.
 */

const THEMES = [
  { value: 'beige' as const, label: 'Light' },
  { value: 'library' as const, label: 'Dark' },
]

export function AdminRegistrationTab() {
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

  const current = settings.data
  const save = (patch: InstanceSettingsPatch) => update.mutate(patch)

  return (
    <YStack gap="$3" testID="admin-registration">
      <MutedText>
        These apply to the next account that registers. Changing one never alters an
        account that already exists.
      </MutedText>

      <SettingsSection
        testID="settings-approval"
        title="Approval"
        description="Whether a new account can sign in straight away, or waits for an administrator."
      >
        <ToggleRow
          testID="approval-toggle"
          label="Review new accounts before they can sign in"
          description="A new registration is created disabled and appears on the Accounts tab, where enabling it is how you approve it."
          checked={current.registrationRequiresApproval}
          disabled={update.isPending}
          onCheckedChange={(next) => save({ registrationRequiresApproval: next })}
        />
        {current.registrationApprovalFromEnv ? (
          <MutedText testID="approval-from-env" fontSize={13} lineHeight={18}>
            Currently set by the REGISTRATION_REQUIRES_APPROVAL environment variable.
            Changing it here takes over permanently.
          </MutedText>
        ) : null}
        {/*
          The first account is exempt whichever way this is set, and somebody
          standing up a new instance needs to know that before they wonder why
          they were let straight in.
        */}
        <MutedText fontSize={13} lineHeight={18}>
          The very first account on an instance is always an enabled administrator —
          there would be nobody to approve it otherwise.
        </MutedText>
      </SettingsSection>

      <SettingsSection
        testID="settings-defaults"
        title="Starting preferences"
        description="What a new account's language, region and theme are set to. They can change all three from their own profile afterwards."
      >
        <SelectField
          testID="default-language"
          label="Language"
          value={current.defaultLanguage}
          options={UI_LANGUAGES}
          disabled={update.isPending}
          onChange={(next) => save({ defaultLanguage: next })}
        />
        <SelectField
          testID="default-region"
          label="Region"
          value={current.defaultRegion}
          options={REGIONS}
          disabled={update.isPending}
          onChange={(next) => save({ defaultRegion: next })}
        />
        <ChoiceRow
          testID="default-theme"
          label="Theme"
          value={current.defaultTheme}
          options={THEMES}
          disabled={update.isPending}
          onChange={(next) => save({ defaultTheme: next })}
        />
      </SettingsSection>

      {update.isError ? (
        <Text testID="admin-settings-error" role="alert" fontSize={14} color="$red10">
          {errorMessage(update.error)}
        </Text>
      ) : null}
    </YStack>
  )
}
