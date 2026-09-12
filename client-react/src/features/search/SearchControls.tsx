import { useId } from 'react'
import { Button, Label, YStack } from 'tamagui'

/**
 * The two form controls this screen needs that `components/` does not offer
 * yet.
 *
 * **Both are candidates for promotion into `components/`** — a chip is wanted
 * by every list screen, and a date field is wanted anywhere a range is picked.
 * They sit here because the shared directory is owned elsewhere while these
 * screens land; see this task's report.
 */

/**
 * A toggleable filter chip.
 *
 * Three things are deliberate:
 *
 *  - **44px tall, always.** A chip is the control most likely to be written at
 *    `size="$2"` and the one most often tapped, so the floor is pinned rather
 *    than inherited from Tamagui's `$true`.
 *  - **`aria-pressed`, not a colour.** Selected state is carried by the
 *    accessibility tree as well as by the fill, so it survives a screen reader
 *    and a high-contrast mode.
 *  - **A real label, never a tooltip.** The old search view labelled its
 *    "group by category" control with a `v-tooltip` alone; a tooltip never
 *    opens on touch, so on a phone it was an unexplained glyph.
 */
export function FilterChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string
  selected: boolean
  onPress: () => void
  testID?: string
}) {
  return (
    <Button
      testID={testID}
      onPress={onPress}
      aria-pressed={selected}
      minHeight={44}
      paddingHorizontal="$3"
      borderRadius="$control"
      fontSize={15}
      fontWeight={selected ? '600' : '400'}
      backgroundColor={selected ? '$primary' : 'transparent'}
      color={selected ? '$onPrimary' : '$color'}
      borderWidth={1}
      borderColor={selected ? '$primary' : '$borderColor'}
    >
      {label}
    </Button>
  )
}

/**
 * A labelled `<input type="date">`.
 *
 * `components/Field` cannot express this — it renders a Tamagui `Input` and
 * exposes no `type` — and the alternative, a text field wanting `YYYY-MM-DD`
 * typed by hand, is strictly worse on a phone than the native picker.
 *
 * The two floors are pinned here for the same reason `Field` pins them:
 * `fontSize: 16` so iOS Safari does not zoom the viewport on focus, and
 * `minHeight: 44` for the touch target. The field fills whatever box it is put
 * in and never sets a width of its own: a hardcoded `width: 50%` is what put
 * the old book form's date field at ~150px on a phone, below the width the
 * native picker needs, and a control that sets its own `flexGrow` grows
 * *vertically* as soon as it is dropped into a column.
 */
export function DateField({
  label,
  value,
  onChange,
  testID,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  testID?: string
}) {
  const id = useId()

  return (
    <YStack gap="$0.75" width="100%" minWidth={0}>
      <Label htmlFor={id} fontSize={14} color="$colorMuted" lineHeight={20}>
        {label}
      </Label>
      <input
        id={id}
        data-testid={testID}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          fontFamily: 'inherit',
          fontSize: 16,
          minHeight: 44,
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          padding: '0 10px',
          borderRadius: 8,
          border: '1px solid var(--borderColor)',
          background: 'var(--surface)',
          color: 'var(--color)',
        }}
      />
    </YStack>
  )
}
