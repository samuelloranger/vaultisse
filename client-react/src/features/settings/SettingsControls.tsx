import { useId } from 'react'
import { Label, Switch, Text, XStack, YStack } from 'tamagui'
import { Card, DisplayText, MutedText } from '@/components/Card'

/**
 * The form controls this screen needs that `components/Field` cannot express,
 * plus the section frame every card on the screen shares.
 *
 * ## Why these are local, and why they are native elements
 *
 * `Field` renders a Tamagui `Input` and exposes neither `type` nor a `<select>`.
 * The settings screen needs three things it therefore cannot produce: a
 * **password** input (masking, and the `current-password` / `new-password`
 * autofill contract browsers and password managers actually read), an **email**
 * input (`type="email"` is what puts the `@` on the phone keyboard and enables
 * the browser's own validation), and two **selects**.
 *
 * `features/book/BookFields.tsx` and `features/search/SearchControls.tsx` hit
 * the same wall and answered it with local native wrappers pinning the same two
 * floors. This file follows that, deliberately, rather than inventing a third
 * approach — see this task's report, where `type` on `Field` is proposed as the
 * shared fix.
 *
 * Everything here pins `fontSize: 16` (below it, iOS Safari zooms the viewport
 * on focus and offers no way back) and `minHeight: 44` (the touch floor).
 */

const NATIVE_CONTROL_STYLE = {
  fontFamily: 'inherit' as const,
  fontSize: 16,
  minHeight: 44,
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box' as const,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--borderColor)',
  background: 'var(--surface)',
  color: 'var(--color)',
}

/** One titled block on the settings page. Every section is one of these. */
export function SettingsSection({
  title,
  description,
  children,
  testID,
  tone = 'default',
}: {
  title: string
  description?: string
  children: React.ReactNode
  testID: string
  /** `danger` tints the spine only — nothing in a resting row is red. */
  tone?: 'default' | 'danger'
}) {
  return (
    <Card
      testID={testID}
      spine="left"
      gap="$3"
      borderLeftColor={tone === 'danger' ? '$red10' : '$accent'}
    >
      <YStack gap="$1">
        <DisplayText fontSize={19} lineHeight={26}>
          {title}
        </DisplayText>
        {description ? <MutedText>{description}</MutedText> : null}
      </YStack>
      {children}
    </Card>
  )
}

/**
 * A labelled native text input, in the three types this screen needs.
 *
 * `autoComplete` is required rather than optional for the same reason `Field`
 * requires it: the old client had **zero** autocomplete attributes anywhere, so
 * every password field was one a manager could neither fill nor offer to save,
 * and every "new password" looked to the browser exactly like a login form.
 */
export function TextInputField({
  label,
  value,
  onChangeText,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
  error,
  disabled,
  hint,
  onSubmit,
  testID,
}: {
  label: string
  value: string
  onChangeText: (next: string) => void
  type?: 'text' | 'email' | 'password'
  /** `'email'`, `'current-password'`, `'new-password'`, `'off'`, … */
  autoComplete: string
  inputMode?: 'text' | 'email' | 'numeric'
  placeholder?: string
  error?: string | null
  disabled?: boolean
  /** Static help, rendered under the field and wired up as its description. */
  hint?: string
  onSubmit?: () => void
  testID?: string
}) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <YStack gap="$0.75" width="100%" minWidth={0}>
      <Label htmlFor={id} fontSize={14} color="$colorMuted" lineHeight={20}>
        {label}
      </Label>
      <input
        id={id}
        data-testid={testID}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChangeText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit()
        }}
        style={{
          ...NATIVE_CONTROL_STYLE,
          borderColor: error ? 'var(--red10)' : 'var(--borderColor)',
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {hint ? (
        <Text id={hintId} fontSize={13} color="$colorMuted">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text id={errorId} fontSize={14} color="$red10">
          {error}
        </Text>
      ) : null}
    </YStack>
  )
}

/**
 * A labelled `<select>`.
 *
 * Native on purpose: a phone renders it as the platform's own picker, which is
 * bigger, faster and more familiar than any listbox this app could draw, and it
 * arrives keyboard- and screen-reader-complete for free.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (next: string) => void
  testID?: string
}) {
  const id = useId()
  return (
    <YStack gap="$0.75" width="100%" minWidth={0}>
      <Label htmlFor={id} fontSize={14} color="$colorMuted" lineHeight={20}>
        {label}
      </Label>
      <select
        id={id}
        data-testid={testID}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={NATIVE_CONTROL_STYLE}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </YStack>
  )
}

/**
 * A labelled switch with its explanation beside it.
 *
 * The whole row is the label (`<label htmlFor>`), so the text is part of the
 * target rather than decoration next to a 20px thumb — and the switch itself is
 * given 44px of height regardless of the track's visual size.
 *
 * ## Why the track is drawn by hand
 *
 * It used to be a plain `<Switch height={44} minWidth={64}>` with a default
 * `Switch.Thumb`, and on a dark phone it rendered as a dark crescent rather
 * than a switch. Three things were wrong at once:
 *
 *  1. **Unchecked, the track was `$borderColor`** — `rgba(255,255,255,0.09)`
 *     in the dark theme, which on a `$surface` card is not a visible shape.
 *  2. **Checked, the colour prop never landed at all.** `createSwitch` spreads
 *     `backgroundColor: '$backgroundActive'` onto the frame *after* the
 *     caller's props whenever `checked` is true and no `activeStyle` was
 *     given, so `'$primary'` was silently dropped. Worse, a Tamagui component
 *     renders inside its own sub-theme, and this config keeps
 *     `@tamagui/config`'s stock `dark_Switch` untouched — so
 *     `$backgroundActive` was `#1a1a1a`, a neutral near-black on a navy card.
 *     Hence `activeStyle` below: it is the only way to stop that override.
 *  3. **The thumb was `$surface`**, i.e. *exactly* the card behind it, 29px
 *     tall inside a 44px pill. A card-coloured circle punched out of an
 *     almost-invisible pill is the crescent.
 *
 * So every colour here is stated explicitly, from this app's palette, on both
 * sides of `checked`. The geometry is stated too: a **32px track centred in a
 * 44px hit area**, because the finger needs 44 and the eye wants a switch. The
 * track is absolutely positioned so its box is independent of the thumb's
 * travel box — Tamagui computes that travel as `frameWidth - thumbWidth`, so
 * an inset has to come off the frame's padding, not off a track the thumb
 * would have to live inside.
 */

/** The switch's hit area. The visual track is {@link TRACK_HEIGHT} inside it. */
const SWITCH_WIDTH = 56
const SWITCH_HEIGHT = 44
const TRACK_HEIGHT = 32
const THUMB_SIZE = 28
/** Gap between the thumb and the track's edge, on all four sides. */
const THUMB_INSET = 2

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  testID,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  testID: string
}) {
  const id = useId()
  return (
    <XStack alignItems="center" gap="$3" minHeight={44} flexWrap="nowrap">
      <YStack flex={1} minWidth={0} gap="$1">
        <Label htmlFor={id} fontSize={16} color="$color" lineHeight={22}>
          {label}
        </Label>
        {description ? (
          <MutedText fontSize={13} lineHeight={18}>
            {description}
          </MutedText>
        ) : null}
      </YStack>
      <Switch
        id={id}
        testID={testID}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange(Boolean(next))}
        // The pressable box is 44 tall; the track drawn inside it is 32. The
        // target is what the finger has to hit, not what the eye sees.
        width={SWITCH_WIDTH}
        height={SWITCH_HEIGHT}
        flexShrink={0}
        // The thumb travels `frameWidth - thumbWidth`, and `frameWidth` is the
        // frame's *content* box — so this padding is what holds the thumb off
        // the ends of the track.
        paddingHorizontal={THUMB_INSET}
        backgroundColor="transparent"
        // Not decoration: without an `activeStyle`, `createSwitch` paints the
        // frame `$backgroundActive` whenever `checked`. See the note above.
        activeStyle={{ backgroundColor: 'transparent' }}
        borderWidth={0}
        borderRadius={1000}
        opacity={disabled ? 0.6 : 1}
        cursor={disabled ? 'default' : 'pointer'}
        focusVisibleStyle={{
          outlineColor: '$outlineColor',
          outlineStyle: 'solid',
          outlineWidth: 2,
        }}
      >
        {/* The visible track. `$colorMuted` for "off" rather than a border
            token: it is the only mid grey in the palette that clears both
            surfaces, and an off switch has to be legible, not tasteful. A
            dedicated track token belongs in the theme — see this task's
            report. */}
        <YStack
          position="absolute"
          top={(SWITCH_HEIGHT - TRACK_HEIGHT) / 2}
          bottom={(SWITCH_HEIGHT - TRACK_HEIGHT) / 2}
          left={-THUMB_INSET}
          right={-THUMB_INSET}
          zIndex={0}
          borderRadius={1000}
          backgroundColor={checked ? '$primary' : '$colorMuted'}
          transition="quick"
        />
        <Switch.Thumb
          width={THUMB_SIZE}
          height={THUMB_SIZE}
          marginVertical={(SWITCH_HEIGHT - THUMB_SIZE) / 2}
          zIndex={1}
          borderRadius={1000}
          backgroundColor="$onPrimary"
          transition="quick"
        />
      </Switch>
    </XStack>
  )
}

/**
 * A row of mutually exclusive choices — the appearance picker.
 *
 * Buttons with `aria-pressed` rather than a `<select>`: there are three short
 * options, all of them are worth seeing at once, and the choice takes effect
 * instantly, so a picker that has to be opened and dismissed would be two extra
 * taps for a preference people flip back and forth.
 */
export function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  testID: string
}) {
  return (
    <YStack gap="$2" role="group" aria-label={label}>
      <Text fontSize={14} color="$colorMuted" lineHeight={20}>
        {label}
      </Text>
      <XStack gap="$2" flexWrap="wrap">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              data-testid={`${testID}-${option.value}`}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              style={{
                fontFamily: 'inherit',
                fontSize: 15,
                minHeight: 44,
                padding: '0 16px',
                borderRadius: 8,
                cursor: 'pointer',
                border: `1px solid ${selected ? 'var(--primary)' : 'var(--borderColor)'}`,
                background: selected ? 'var(--primary)' : 'transparent',
                color: selected ? 'var(--onPrimary)' : 'var(--color)',
                fontWeight: selected ? 600 : 400,
              }}
            >
              {option.label}
            </button>
          )
        })}
      </XStack>
    </YStack>
  )
}
