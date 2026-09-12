import { defaultConfig } from '@tamagui/config/v4'
import { describe, expect, it } from 'vitest'
import { beige, nocturne, type ReadingRoomPalette } from './palette'
import config from './tamagui.config'

/**
 * The two invariants the theme layer is only one careless spread away from
 * losing.
 *
 * Neither is a unit test of behaviour; both are guards. They exist because the
 * failure they catch is *invisible* — a stray `...defaultConfig.themes` puts
 * every `<Button>`, `<Input>` and `Card` back on somebody else's grey ramp
 * without breaking a type, a render or a single other test, and the symptom
 * shows up weeks later as "the dark theme looks a bit off" (see the lending
 * switch in `fe7ab48`).
 */

describe('the app config ships two themes and no sub-themes', () => {
  it('has exactly light and dark', () => {
    // `@tamagui/config/v4` ships 294: light, dark, and 292 generated variants
    // (dark_Button, light_Input, light_Card, …). A component renders inside
    // the one matching its name, so any of those that came along would quietly
    // outrank the Reading Room palette for that component.
    expect(Object.keys(config.themes).sort()).toEqual(['dark', 'light'])
  })

  it('is not merely a subset of the preset that happens to be small today', () => {
    // Guards the guard: if the preset ever ships only light/dark, the
    // assertion above would pass for the wrong reason.
    expect(Object.keys(defaultConfig.themes).length).toBeGreaterThan(2)
  })
})

describe('every palette key reaches the themes', () => {
  const themeKeys = (name: 'light' | 'dark') =>
    new Set(Object.keys(config.themes[name] as Record<string, unknown>))

  it.each([
    ['light', beige],
    ['dark', nocturne],
  ] as const)('%s', (name, palette: ReadingRoomPalette) => {
    const keys = themeKeys(name)
    // Not every palette key keeps its own name — `text` lands on `$color`,
    // `border` on `$borderColor` — so the ones that are renamed are listed
    // here rather than derived, and the rest have to be present verbatim.
    const renamed = new Set([
      'bg',
      'bgAlt',
      'bgHover',
      'text',
      'textMuted',
      'border',
      'borderStrong',
    ])
    for (const key of Object.keys(palette)) {
      if (renamed.has(key)) continue
      expect(keys, `$${key} is missing from the ${name} theme`).toContain(key)
    }
    // The renamed ones, at their new spelling.
    for (const key of [
      'background',
      'backgroundAlt',
      'backgroundHover',
      'color',
      'colorMuted',
      'borderColor',
      'borderColorStrong',
    ]) {
      expect(keys, `$${key} is missing from the ${name} theme`).toContain(key)
    }
  })

  it('gives both themes the same keys', () => {
    // A key that exists in one theme only is a screen that goes blank on a
    // toggle, and nothing else in the build would catch it.
    expect(Object.keys(config.themes.light as Record<string, unknown>).sort()).toEqual(
      Object.keys(config.themes.dark as Record<string, unknown>).sort()
    )
  })
})
