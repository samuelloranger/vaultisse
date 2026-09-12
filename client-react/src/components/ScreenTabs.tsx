import { useEffect, useState } from 'react'
import { Tabs, Text } from 'tamagui'

/**
 * The tab bar both the admin panel and the profile screen render.
 *
 * ## What Tamagui gives us, and the one thing it does not
 *
 * `@tamagui/tabs` composes `@tamagui/roving-focus`, and most of the WAI-ARIA
 * tabs pattern does arrive for free: `role="tablist"` / `role="tab"` /
 * `role="tabpanel"`, `aria-selected`, and `aria-controls`/`aria-labelledby`
 * wired to generated ids in both directions; Arrow-Left/Right, Home and End
 * moving focus along the bar; Enter and Space activating.
 *
 * **The roving tabindex does not.** Despite the package's name,
 * `RovingFocusGroup.Item` renders `tabIndex={focusable ? 0 : -1}` — it computes
 * an `isCurrentTabStop` and then never uses it (Radix, which it is ported from,
 * spends that value on exactly this). So every enabled tab is its own tab stop,
 * and a keyboard user pressing Tab walks through all three instead of stepping
 * over the bar in one press. That is the whole point of the roving index: a tab
 * bar is one control, not N. `tabIndex` below is therefore set explicitly, and
 * the tests beside both screens assert it rather than trusting the library —
 * which is how this was found.
 *
 * The look is not free either: `Tabs.Tab` unstyled would be invisible and
 * styled would paint `$backgroundActive`, a stock token this app does not use.
 * So every tab is `unstyled` and dressed from this app's palette, the same way
 * `SettingsControls`' switch is.
 *
 * ## `activationMode="manual"`
 *
 * Arrow keys move focus; Enter or Space commits. The WAI-ARIA pattern allows
 * either, and automatic activation is normally the friendlier one — but here a
 * tab change rewrites the URL and mounts a panel that may start a request, so
 * arrowing from the first tab to the third would fire the second one's query
 * and a history entry on the way past. Manual makes "look at the options" and
 * "choose one" two different acts, which is what they are.
 *
 * ## Mobile: one scrolling row, not a wrapping block
 *
 * At 390px three tabs fit — but only just, and only in English. The row is a
 * horizontal scroller (`overflow-x: auto`, scrollbar hidden, momentum on iOS)
 * with `flexShrink: 0` on every tab, so a long label or a narrower phone makes
 * the row scroll instead of squeezing a tab under the 44px touch floor or
 * breaking it onto a second line.
 *
 * Wrapping was the alternative and is worse here: a tab bar whose height
 * changes with its labels moves the content under it, and a bar that is one row
 * in English and two in French would put the panel in a different place
 * depending on who is looking at it. A scroller keeps the geometry fixed. Its
 * real cost is discoverability — a tab past the edge is a tab nobody sees — and
 * the answer to that is short labels, which is why none of ours is longer than
 * two words.
 */

export type ScreenTabDef<T extends string> = {
  value: T
  label: string
}

/**
 * Resolve a raw search-param value to a real tab.
 *
 * Falls back to the first tab for anything unrecognised — including `undefined`
 * (no param at all) and `?tab=' OR 1=1`. A URL is user input: the screen has to
 * render *something*, and the something has to be the default rather than an
 * empty frame.
 */
export function parseTabParam<T extends string>(raw: unknown, tabs: readonly T[]): T {
  return tabs.includes(raw as T) ? (raw as T) : (tabs[0] as T)
}

export function ScreenTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  testID,
  children,
}: {
  tabs: readonly ScreenTabDef<T>[]
  value: T
  onChange: (next: T) => void
  /** Names the tablist for a screen reader — "Admin sections", "Profile sections". */
  label: string
  testID: string
  /** The `Tabs.Content` blocks. */
  children: React.ReactNode
}) {
  // In manual activation mode, focus is allowed to leave the selected tab
  // while a keyboard user looks across the choices. It, not selection, owns
  // the one roving tab stop until Enter or Space commits a choice.
  const [focusedValue, setFocusedValue] = useState(value)

  // Mouse/pointer activation and URL navigation select a tab without first
  // focusing it. They start the next Tab traversal on that selected tab.
  useEffect(() => {
    setFocusedValue(value)
  }, [value])

  return (
    <Tabs
      testID={testID}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      orientation="horizontal"
      activationMode="manual"
      flexDirection="column"
      width="100%"
      minWidth={0}
      gap="$4"
    >
      {/*
        A native scroller around the list rather than `overflow` on the list
        itself: the hairline rule has to span the full width even when the row
        is scrolled, so it belongs to the container, not to the flex row whose
        box ends at the last tab. `scrollbarWidth: none` because a visible
        scrollbar under a three-item tab bar reads as a broken layout.
      */}
      <div
        style={{
          width: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          borderBottom: '1px solid var(--borderColor)',
        }}
      >
        <Tabs.List unstyled aria-label={label} gap="$1" flexWrap="nowrap">
          {tabs.map((tab) => {
            const selected = tab.value === value
            return (
              <Tabs.Tab
                key={tab.value}
                unstyled
                value={tab.value}
                testID={`${testID}-tab-${tab.value}`}
                // The roving tabindex, by hand — see the note above. The
                // focused tab is the bar's single tab stop; selection can
                // remain elsewhere while manual keyboard activation is pending.
                tabIndex={tab.value === focusedValue ? 0 : -1}
                onFocus={() => setFocusedValue(tab.value)}
                // The finger needs 44; the label needs room either side of it.
                minHeight={44}
                paddingHorizontal="$3"
                flexShrink={0}
                alignItems="center"
                justifyContent="center"
                backgroundColor="transparent"
                cursor="pointer"
                // 2px of terracotta pulled down over the container's 1px rule,
                // so the selected tab sits *on* the line rather than above it.
                borderBottomWidth={2}
                borderBottomColor={selected ? '$primary' : 'transparent'}
                marginBottom={-1}
                hoverStyle={{ backgroundColor: '$surfaceAlt' }}
                focusVisibleStyle={{
                  outlineColor: '$outlineColor',
                  outlineStyle: 'solid',
                  outlineWidth: 2,
                }}
              >
                {/*
                  Weight as well as colour and underline. Selection carried by
                  a coloured rule alone would be a colour-only distinction, and
                  the rule is 2px of it.
                */}
                <Text
                  fontSize={15}
                  lineHeight={20}
                  fontWeight={selected ? '600' : '400'}
                  color={selected ? '$color' : '$colorMuted'}
                  whiteSpace="nowrap"
                >
                  {tab.label}
                </Text>
              </Tabs.Tab>
            )
          })}
        </Tabs.List>
      </div>

      {children}
    </Tabs>
  )
}
