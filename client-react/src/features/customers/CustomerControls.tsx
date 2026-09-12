import { useId } from 'react'
import { Button, Label, Text, XStack, YStack } from 'tamagui'
import { Check } from '@/components/icons'

/**
 * The three controls the lending screens need that `components/` does not offer
 * yet: a native select, a two-way tab switch, and a selectable list row.
 *
 * **All three are candidates for promotion into `components/`** — see this
 * task's report. They sit here because the shared directory is owned elsewhere
 * while these screens land, and because `features/book/BookFields.tsx` and
 * `features/search/SearchControls.tsx` already set the precedent of a local
 * native-element wrapper rather than a hand-drawn one.
 *
 * Every one of them pins the two floors `components/Field` pins, for the same
 * reasons: `fontSize: 16` (below it, iOS Safari zooms the viewport on focus and
 * offers no way out) and `minHeight: 44` (the touch target).
 */

/**
 * The shared look for a native form control. Deliberately identical to the one
 * in `features/book/BookFields.tsx` — a third *style* would be worse than a
 * duplicated constant, and the constant disappears when these are promoted.
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
 * Native on purpose: a phone renders it as the platform's own wheel or list,
 * which is bigger, faster and more familiar than any listbox this app could
 * draw, and it is already keyboard- and screen-reader-complete at no bundle
 * cost. The old client's `v-select` had to be shrunk to `density="compact"` to
 * fit a toolbar, which put it under both floors.
 */
export function NativeSelect<T extends string | number>({
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
 * Fills whatever box it is put in and never sets a width of its own. The audit
 * measured the old loan report dialog's two date fields at ~126px each, side by
 * side in a 264px dialog body — narrower than the native picker's own controls
 * need. Two-up layouts are the caller's job, and on a phone the answer is not
 * to have one.
 */
export function NativeDateField({
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

/**
 * A two-way switch between two lists on one screen.
 *
 * Real buttons carrying `aria-pressed`, not a styled `role="tablist"`: there is
 * no tab *panel* relationship here — picking one replaces the screen's list
 * wholesale — and claiming the tab pattern without its keyboard contract is
 * worse than not claiming it.
 */
export function TabSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
  testID,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  /** Names the group for screen readers. */
  label: string
  testID?: string
}) {
  return (
    <XStack gap="$2" role="group" aria-label={label} testID={testID} flexWrap="wrap">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Button
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            onPress={() => onChange(option.value)}
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
            {option.label}
          </Button>
        )
      })}
    </XStack>
  )
}

/**
 * One row of a multi-select list.
 *
 * ## This is the replacement for the drag-and-drop that never worked
 *
 * The old customer-group assignment was HTML5 drag-and-drop. `dragstart` /
 * `dragover` / `drop` fire for a mouse and **not at all** for a finger, so on a
 * phone the primary way to move a borrower between groups did nothing
 * whatsoever — the view even shipped a hint telling the user to drag. The
 * checkbox-and-move path was the fallback; here it is the only path.
 *
 * The whole row is the target rather than a 20px checkbox beside it. A native
 * `<input type="checkbox">` is ~16px on a phone, which is a third of the touch
 * floor, and padding one out to 44px produces a control whose hit area and
 * whose appearance disagree. A row-sized `<button aria-pressed>` has one
 * unambiguous target, states its selection in the accessibility tree rather
 * than through a tick alone, and is the full width of the list it belongs to.
 */
export function SelectableRow({
  label,
  meta,
  selected,
  onToggle,
  testID,
}: {
  label: string
  meta?: string
  selected: boolean
  onToggle: () => void
  testID?: string
}) {
  return (
    <Button
      testID={testID}
      unstyled
      onPress={onToggle}
      aria-pressed={selected}
      flexDirection="row"
      alignItems="center"
      gap="$3"
      minHeight={44}
      paddingHorizontal="$3"
      paddingVertical="$2"
      borderRadius="$control"
      borderWidth={1}
      borderColor={selected ? '$primary' : '$borderColor'}
      backgroundColor={selected ? '$backgroundAlt' : 'transparent'}
      cursor="pointer"
    >
      {/*
        A fixed box whether or not it is ticked, so selecting a row never
        reflows the text beside it.
      */}
      <YStack
        width={22}
        height={22}
        borderRadius={6}
        borderWidth={1}
        borderColor={selected ? '$primary' : '$borderColor'}
        backgroundColor={selected ? '$primary' : 'transparent'}
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        {selected ? <Check size={14} color="$onPrimary" /> : null}
      </YStack>
      <YStack flex={1} minWidth={0} gap="$0.5">
        <Text fontSize={15} color="$color">
          {label}
        </Text>
        {meta ? (
          <Text fontSize={13} color="$colorMuted">
            {meta}
          </Text>
        ) : null}
      </YStack>
    </Button>
  )
}
