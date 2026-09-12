import { useId } from 'react'
import { Label, TextArea, YStack } from 'tamagui'

/**
 * The three form controls the book form needs that `components/Field` cannot
 * express: a select, a date, and a multi-line text area. `Field` renders a
 * Tamagui `Input` and exposes neither `type` nor `multiline`.
 *
 * **All three are candidates for promotion into `components/`** — see this
 * task's report. They sit here because the shared directory is owned elsewhere
 * while these screens land.
 *
 * Every one of them pins the same two floors `Field` pins, for the same
 * reasons: `fontSize: 16` (below it, iOS Safari zooms the viewport on focus and
 * offers no way out) and `minHeight: 44` (the touch target).
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
  border: '1px solid var(--borderControl)',
  background: 'var(--surface)',
  color: 'var(--color)',
}

/**
 * A labelled `<select>`.
 *
 * Native on purpose. A phone renders it as the platform's own wheel or list,
 * which is bigger, faster and more familiar than any listbox this app could
 * draw — and it costs nothing in bundle size, needs no portal, and is already
 * keyboard- and screen-reader-complete. The old client's `v-select` had to be
 * shrunk to 32px tall and 13px to fit a toolbar, which is under both floors.
 */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  emptyLabel = '—',
  testID,
}: {
  label: string
  /** `null` renders {@link emptyLabel} as the selected option. */
  value: T | null
  options: { value: T; label: string }[]
  onChange: (next: T | null) => void
  emptyLabel?: string
  testID?: string
}) {
  const id = useId()
  const numeric = options.length > 0 && typeof options[0].value === 'number'

  return (
    <YStack gap="$0.75" width="100%" minWidth={0}>
      <Label htmlFor={id} fontSize={14} color="$colorMuted" lineHeight={20}>
        {label}
      </Label>
      <select
        id={id}
        data-testid={testID}
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const next = event.target.value
          if (next === '') onChange(null)
          else onChange((numeric ? Number(next) : next) as T)
        }}
        style={NATIVE_CONTROL_STYLE}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </YStack>
  )
}

/**
 * A labelled `<input type="date">`.
 *
 * Full width of whatever box it is put in, and never a percentage width of its
 * own. The audit measured the old book form's `style="width: 50%"` date field
 * at ~150px on a phone, narrower than the native picker's own controls need.
 * Two-up layouts are the caller's job — see `BookMetaCard` — because a control
 * that sets `flexGrow` on itself grows *vertically* the moment it is dropped
 * into a column, which is how a three-field sheet ends up 1,900px tall.
 */
export function DateField({
  label,
  value,
  onChange,
  testID,
}: {
  label: string
  /** `YYYY-MM-DD`, or the empty string for unset. */
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
        style={NATIVE_CONTROL_STYLE}
      />
    </YStack>
  )
}

/** A labelled multi-line text area. */
export function TextAreaField({
  label,
  value,
  onChangeText,
  testID,
}: {
  label: string
  value: string
  onChangeText: (next: string) => void
  testID?: string
}) {
  const id = useId()

  return (
    <YStack gap="$0.75" width="100%">
      <Label htmlFor={id} fontSize={14} color="$colorMuted" lineHeight={20}>
        {label}
      </Label>
      <TextArea
        id={id}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        fontSize={16}
        minHeight={96}
        borderRadius="$control"
        backgroundColor="$surface"
        // The control outline, not the divider — same rule as the `<select>`
        // and `<input>` above, which already use `--borderControl`.
        borderColor="$borderControl"
      />
    </YStack>
  )
}
