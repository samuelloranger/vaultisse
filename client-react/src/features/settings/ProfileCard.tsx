import { useRef, useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { PolicyUser } from '@/api/types'
import { MutedText } from '@/components/Card'
import { Field } from '@/components/Field'
import { errorMessage } from '@/components/ScreenState'
import {
  useDeleteProfileImage,
  useUpdateProfile,
  useUploadProfileImage,
} from '@/queries/user'
import { SelectField, SettingsSection, TextInputField } from './SettingsControls'

/**
 * Name, email, avatar, and the two locale fields.
 *
 * `PUT /user` writes all four columns at once, so the form is a single save
 * rather than four inline edits — and the button is disabled while nothing has
 * changed, which is also what stops a stray tap from rewriting the row with
 * identical values and bumping nothing but the audit trail.
 *
 * The avatar is a separate endpoint (multipart, 2MB, PNG/JPEG) and saves
 * immediately on pick, because a file chooser that then needs a second
 * confirmation is a step nobody expects.
 */

/**
 * The UI languages this client has labels for.
 *
 * The policy's `languages` list is the *book* language reference list (22
 * entries, from `system_languages`); it is not this. Ported from the old
 * client's `supportedLanguages`, which carried the same distinction and the same
 * four values.
 */
const UI_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'ca', label: 'Català' },
  { value: 'it', label: 'Italiano' },
]

/** Ported verbatim from the old settings view. */
const REGIONS = [
  { value: 'AU', label: 'Australia' },
  { value: 'BR', label: 'Brazil' },
  { value: 'CA', label: 'Canada' },
  { value: 'CN', label: 'China' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'IT', label: 'Italy' },
  { value: 'JP', label: 'Japan' },
  { value: 'MX', label: 'Mexico' },
  { value: 'PT', label: 'Portugal' },
  { value: 'RU', label: 'Russia' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'ES', label: 'Spain' },
  { value: 'TW', label: 'Taiwan' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function Avatar({ user }: { user: PolicyUser }) {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt=""
        width={64}
        height={64}
        style={{ width: 64, height: 64, borderRadius: 32, objectFit: 'cover' }}
      />
    )
  }
  return (
    <YStack
      width={64}
      height={64}
      borderRadius={32}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$accentSoft"
    >
      <Text fontSize={22} fontWeight="600" color="$secondary">
        {initials(user.name)}
      </Text>
    </YStack>
  )
}

export function ProfileCard({ user }: { user: PolicyUser }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [language, setLanguage] = useState(user.language || 'en')
  const [region, setRegion] = useState(user.region || 'US')
  const [saved, setSaved] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const save = useUpdateProfile()
  const upload = useUploadProfileImage()
  const removeImage = useDeleteProfileImage()

  const trimmedName = name.trim()
  const trimmedEmail = email.trim()
  const unchanged =
    trimmedName === user.name &&
    trimmedEmail === user.email &&
    language === user.language &&
    region === user.region
  const incomplete = trimmedName === '' || trimmedEmail === ''

  function submit() {
    if (unchanged || incomplete) return
    setSaved(false)
    save.mutate(
      { name: trimmedName, email: trimmedEmail, language, region },
      { onSuccess: () => setSaved(true) }
    )
  }

  const imageError = upload.isError
    ? errorMessage(upload.error)
    : removeImage.isError
      ? errorMessage(removeImage.error)
      : null

  return (
    <SettingsSection
      testID="settings-profile"
      title="Profile"
      description="How you appear to everyone else sharing this library."
    >
      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Avatar user={user} />
        <YStack gap="$2" flex={1} minWidth={180}>
          <XStack gap="$2" flexWrap="wrap">
            <Button
              testID="avatar-pick"
              onPress={() => fileInput.current?.click()}
              disabled={upload.isPending}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="transparent"
              borderColor="$borderColor"
              color="$color"
            >
              {upload.isPending ? 'Uploading…' : 'Change picture'}
            </Button>
            {user.image ? (
              <Button
                testID="avatar-remove"
                onPress={() => removeImage.mutate()}
                disabled={removeImage.isPending}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="transparent"
                borderColor="$borderColor"
                color="$color"
              >
                Remove
              </Button>
            ) : null}
          </XStack>
          <MutedText fontSize={13}>PNG or JPEG, up to 2MB.</MutedText>
          {imageError ? (
            <Text testID="avatar-error" fontSize={14} color="$red10">
              {imageError}
            </Text>
          ) : null}
        </YStack>
        {/*
          Hidden, driven by the button above. A bare file input cannot be given
          a 44px target or a readable label without fighting the browser's own
          rendering of it, and the button is also the only thing that can say
          "Uploading…".

          `display: none` as well as the `hidden` attribute: the global reset
          gives every element a `display`, which beats the UA stylesheet's
          `[hidden]` rule — measured at 337x26 on a phone before this, i.e. a
          real, invisible, sub-44px control in the page.
        */}
        <input
          ref={fileInput}
          data-testid="avatar-input"
          style={{ display: 'none' }}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Reset first: picking the same file twice in a row fires no change
            // event otherwise, so a failed upload could not be retried.
            event.target.value = ''
            if (file) upload.mutate(file)
          }}
        />
      </XStack>

      <Field
        testID="profile-name"
        label="Name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        inputMode="text"
        onSubmit={submit}
      />

      <TextInputField
        testID="profile-email"
        label="Email"
        value={email}
        onChangeText={setEmail}
        type="email"
        autoComplete="email"
        inputMode="email"
        onSubmit={submit}
      />

      <SelectField
        testID="profile-language"
        label="Language"
        value={language}
        options={UI_LANGUAGES}
        onChange={setLanguage}
      />

      <SelectField
        testID="profile-region"
        label="Region"
        value={region}
        options={REGIONS}
        onChange={setRegion}
      />

      {save.isError ? (
        <Text testID="profile-error" fontSize={14} color="$red10">
          {errorMessage(save.error)}
        </Text>
      ) : null}

      <XStack gap="$3" alignItems="center" flexWrap="wrap">
        <Button
          testID="profile-save"
          onPress={submit}
          disabled={unchanged || incomplete || save.isPending}
          opacity={unchanged || incomplete ? 0.5 : 1}
          minHeight={44}
          fontSize={16}
          borderRadius="$control"
          backgroundColor="$primary"
          color="$onPrimary"
        >
          {save.isPending ? 'Saving…' : 'Save profile'}
        </Button>
        {saved && unchanged ? (
          <Text testID="profile-saved" fontSize={14} color="$colorMuted" role="status">
            Saved. The interface language changes on your next sign-in.
          </Text>
        ) : null}
      </XStack>
    </SettingsSection>
  )
}
