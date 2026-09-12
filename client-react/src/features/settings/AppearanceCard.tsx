import type { ThemeName } from '@/api/user'
import { useSetTheme } from '@/queries/user'
import { type ColorSchemePreference, useColorScheme } from '@/theme/ThemeProvider'
import { ChoiceRow, SettingsSection } from './SettingsControls'

/**
 * Light, dark, or follow the system.
 *
 * ## Two stores, on purpose
 *
 * The choice takes effect immediately from `localStorage` via
 * `theme/ThemeProvider` — a display preference must survive a reload without a
 * round trip, or the page flashes the wrong theme on every load — and is *also*
 * persisted to `PATCH /user/theme` so a new device starts out right instead of
 * starting out default. The local value wins when they disagree, which is the
 * rule `ThemeProvider` already documents.
 *
 * ## The column's names are legacy, and stay legacy
 *
 * `users.theme` is a `CHECK`-constrained `'beige' | 'library'` — the old
 * client's two *separately-chosen* named skins, picked from a dropdown rather
 * than a light/dark pair. This client has one identity in two lighting
 * conditions (see `theme/palette.ts`), so the column now carries a light/dark
 * flag under two historical spellings: `'beige'` means light, `'library'`
 * means dark. The navy "library" design those names came from is gone.
 *
 * The spellings are not renamed here because the constraint lives in the
 * database; widening it is a server migration, and the client gains nothing
 * from it beyond tidier strings.
 *
 * `'system'` has no server-side equivalent and deliberately does not invent
 * one: it persists whichever of the two is currently resolved, so another device
 * inherits what this one looks like right now rather than a value the column
 * cannot express.
 */

const THEME_FOR_SCHEME: Record<'light' | 'dark', ThemeName> = {
  light: 'beige',
  dark: 'library',
}

const OPTIONS: { value: ColorSchemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function AppearanceCard() {
  const { preference, scheme, setPreference } = useColorScheme()
  const persist = useSetTheme()

  function choose(next: ColorSchemePreference) {
    setPreference(next)
    const resolved = next === 'system' ? scheme : next
    // Fire-and-forget: the theme is already on screen, and a failure here costs
    // nothing this session. See `queries/user.ts#useSetTheme`.
    persist.mutate(THEME_FOR_SCHEME[resolved])
  }

  return (
    <SettingsSection
      testID="settings-appearance"
      title="Appearance"
      description="Applies to this browser right away, and to your next sign-in anywhere else."
    >
      <ChoiceRow
        testID="appearance-choice"
        label="Theme"
        value={preference}
        options={OPTIONS}
        onChange={choose}
      />
    </SettingsSection>
  )
}
