import { useId } from 'react'
import { Input, Label, styled, Text, YStack } from 'tamagui'

/**
 * A labelled text input.
 *
 * This component exists so that the two mobile floors from the spec are
 * impossible to forget rather than merely documented:
 *
 *  - **`fontSize: 16`, always.** Below 16px, iOS Safari zooms the entire
 *    viewport in on focus and offers no way back out. This is not a phone-only
 *    rule here: a 390px window on a desktop is still a 390px layout, and no
 *    visual budget is saved by a 14px field.
 *  - **`minHeight: 44`.** The touch-target floor. Tamagui's `$true` size is
 *    already 44, but a `size="$3"` written later would quietly drop under it,
 *    so the floor is pinned rather than inherited.
 *
 * The label is a real `<label htmlFor>`, never a placeholder and never a
 * tooltip — a placeholder disappears on focus and a tooltip never opens on
 * touch at all. `autoComplete` / `inputMode` are required props for the same
 * reason: they are the difference between a usable and an unusable mobile form,
 * and a required prop is the only reliable way to make someone think about it.
 */

const FieldError = styled(Text, {
  name: 'FieldError',
  color: '$red10',
  fontSize: 14,
  marginTop: '$0.75',
})

export type FieldProps = {
  label: string
  value: string
  onChangeText: (next: string) => void
  /** Passed straight through to the input. Required — pick `'off'` if none fits. */
  autoComplete: React.ComponentProps<typeof Input>['autoComplete']
  /** Required: it picks the on-screen keyboard. `'text'` is a real answer. */
  inputMode: React.ComponentProps<typeof Input>['inputMode']
  placeholder?: string
  /** Rendered under the field and wired up as its accessible description. */
  error?: string | null
  disabled?: boolean
  onSubmit?: () => void
  testID?: string
}

export function Field({
  label,
  value,
  onChangeText,
  autoComplete,
  inputMode,
  placeholder,
  error,
  disabled,
  onSubmit,
  testID,
}: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <YStack gap="$0.75" width="100%">
      <Label htmlFor={id} fontSize={14} color="$colorMuted" lineHeight={20}>
        {label}
      </Label>
      <Input
        id={id}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        onSubmitEditing={onSubmit}
        // The two floors. See this file's header.
        fontSize={16}
        minHeight={44}
        borderRadius="$control"
        backgroundColor="$surface"
        borderColor={error ? '$red10' : '$borderColor'}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </YStack>
  )
}
