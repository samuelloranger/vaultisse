import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import { TamaguiProvider } from 'tamagui'
import config from './tamagui.config'

/**
 * Light/dark handling for the whole app.
 *
 * Three states, deliberately: `'light'`, `'dark'`, and `'system'` (the default).
 * "System" is not the same as "whatever light was when the page loaded" — it
 * has to keep tracking `prefers-color-scheme` for the life of the session, which
 * is why there is a listener here rather than a one-shot read.
 *
 * The explicit choice persists in `localStorage`. That is the right storage for
 * it: it is a per-device display preference, not library data, and it must
 * survive a reload without a round trip that would flash the wrong theme.
 * (`/app/policy` also carries a `user.theme` value from the old client's
 * two-named-themes model; wiring that in is a settings-screen concern, and the
 * local choice should win when both exist.)
 */

export type ColorSchemePreference = 'light' | 'dark' | 'system'
export type ResolvedColorScheme = 'light' | 'dark'

const STORAGE_KEY = 'vaultisse.colorScheme'

type ThemeContextValue = {
  /** What the user asked for. */
  preference: ColorSchemePreference
  /** What is actually on screen right now. */
  scheme: ResolvedColorScheme
  setPreference: (next: ColorSchemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredPreference(): ColorSchemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Private windows and blocked site data throw on access, not on read.
  }
  return 'system'
}

function systemScheme(): ResolvedColorScheme {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ColorSchemePreference>(readStoredPreference)
  const [systemValue, setSystemValue] = useState<ResolvedColorScheme>(systemScheme)

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mql) return
    const onChange = (event: MediaQueryListEvent) => {
      setSystemValue(event.matches ? 'dark' : 'light')
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const setPreference = useCallback((next: ColorSchemePreference) => {
    setPreferenceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A preference we cannot persist is still a preference for this session.
    }
  }, [])

  const scheme: ResolvedColorScheme = preference === 'system' ? systemValue : preference

  // Tamagui writes its theme class onto <html>; mirror it as a data attribute so
  // plain CSS (theme/globals.ts) and any future third-party widget can see it.
  useEffect(() => {
    document.documentElement.dataset.scheme = scheme
    document.documentElement.style.colorScheme = scheme
  }, [scheme])

  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference]
  )

  return (
    <ThemeContext value={value}>
      <TamaguiProvider config={config} defaultTheme={scheme}>
        {children}
      </TamaguiProvider>
    </ThemeContext>
  )
}

/** The current colour scheme and a setter for it. */
export function useColorScheme(): ThemeContextValue {
  const value = use(ThemeContext)
  if (!value) {
    throw new Error('useColorScheme must be used inside <AppThemeProvider>')
  }
  return value
}
