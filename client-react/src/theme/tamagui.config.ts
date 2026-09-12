import { defaultConfig } from '@tamagui/config/v4'
import { createFont, createTamagui } from 'tamagui'
import {
  beige,
  fontStacks,
  library,
  type ReadingRoomPalette,
  radius,
  shadow,
} from './palette'

/**
 * The single Tamagui config for the client. Everything visual resolves through
 * here; no component hardcodes a colour, radius or font family.
 *
 * Built by extending `@tamagui/config/v4` rather than hand-rolling a config,
 * so Tamagui's own components (Button, Sheet, Dialog, Input, …) keep the
 * semantic theme keys they expect. What we change:
 *
 *  - `themes.light` / `themes.dark` get the ported "Reading Room" palette
 *    (see `./palette.ts`) layered on top of the defaults, plus the extra
 *    product-specific keys (`$navBg`, `$accentSoft`, …) the app shell needs.
 *  - Fonts get the product's own stacks: a literary serif for display, Inter
 *    for body, JetBrains Mono for the eyebrow/code style.
 *  - `onlyAllowShorthands` is turned **off**. The v4 preset enables it, which
 *    makes `backgroundColor` a type error and forces `bg`. Half of React's
 *    ecosystem muscle memory is the long form; making both legal removes a
 *    whole class of "why won't this compile" for every later screen.
 *
 * ### Mobile floors encoded here, not per-screen
 *
 * The v4 `size` scale already puts `$true` (the default control size) at 44px,
 * which is the touch-target floor from the spec — so a plain `<Button>` is
 * compliant without anyone remembering to size it. The 16px input floor is
 * enforced by `components/Field.tsx` plus the global stylesheet in
 * `theme/globals.ts`; it can't live in the font scale because body `$true` is
 * 14px by design above `sm`.
 */

const body = createFont({
  family: fontStacks.body,
  size: defaultConfig.fonts.body.size,
  lineHeight: defaultConfig.fonts.body.lineHeight,
  weight: defaultConfig.fonts.body.weight,
  letterSpacing: defaultConfig.fonts.body.letterSpacing,
})

const heading = createFont({
  family: fontStacks.display,
  size: defaultConfig.fonts.heading.size,
  lineHeight: defaultConfig.fonts.heading.lineHeight,
  weight: defaultConfig.fonts.heading.weight,
  letterSpacing: defaultConfig.fonts.heading.letterSpacing,
})

const mono = createFont({
  family: fontStacks.mono,
  size: defaultConfig.fonts.body.size,
  lineHeight: defaultConfig.fonts.body.lineHeight,
  weight: defaultConfig.fonts.body.weight,
  letterSpacing: { 1: 0.6, 2: 0.6, 3: 0.6, 4: 0.6, 5: 0.6, 6: 0.6 },
})

/**
 * Map one ported palette onto the semantic keys Tamagui's own components read,
 * and append the product-specific keys on top. Hover/press/focus variants are
 * derived rather than invented: the SCSS only ever had two edge colours and two
 * surfaces, and deriving keeps them in lockstep.
 */
function readingRoomTheme(p: ReadingRoomPalette, boxShadow: string) {
  return {
    // --- keys Tamagui components read -------------------------------------
    background: p.bg,
    backgroundHover: p.bgAlt,
    backgroundPress: p.bgAlt,
    backgroundFocus: p.bgAlt,
    backgroundStrong: p.surface,
    backgroundTransparent: 'rgba(0,0,0,0)',
    color: p.text,
    colorHover: p.text,
    colorPress: p.text,
    colorFocus: p.text,
    colorTransparent: 'rgba(0,0,0,0)',
    borderColor: p.border,
    borderColorHover: p.borderStrong,
    borderColorPress: p.borderStrong,
    borderColorFocus: p.accent,
    placeholderColor: p.textMuted,
    outlineColor: p.accent,
    shadowColor: p.borderStrong,

    // --- product keys ------------------------------------------------------
    /** Card / sheet surface sitting on top of `$background`. */
    surface: p.surface,
    /** A card's own recessed region. */
    surfaceAlt: p.surfaceAlt,
    /** Recessed page areas (shelf rows, table headers). */
    backgroundAlt: p.bgAlt,
    /** Secondary copy, counts, captions. */
    colorMuted: p.textMuted,
    borderColorStrong: p.borderStrong,
    primary: p.primary,
    onPrimary: p.onPrimary,
    secondary: p.secondary,
    accent: p.accent,
    accentSoft: p.accentSoft,
    navBg: p.navBg,
    navBgAlt: p.navBgAlt,
    navText: p.navText,
    navTextMuted: p.navTextMuted,
    navActiveBg: p.navActiveBg,
    navBorder: p.navBorder,
    navBorderStrong: p.navBorderStrong,
    navAccent: p.navAccent,
    /** The `--pb-shadow` value, as a raw CSS box-shadow string. */
    pbShadow: boxShadow,
  }
}

const light = {
  ...defaultConfig.themes.light,
  ...readingRoomTheme(beige, shadow.beige),
}
const dark = {
  ...defaultConfig.themes.dark,
  ...readingRoomTheme(library, shadow.library),
}

export const config = createTamagui({
  ...defaultConfig,
  // Listed explicitly rather than left to the spread: `createTamagui` infers the
  // `animation` prop's type from this key, and spreading a widened object loses
  // it — `<Sheet animation="medium">` then fails to typecheck.
  animations: defaultConfig.animations,
  media: defaultConfig.media,
  shorthands: defaultConfig.shorthands,
  fonts: { body, heading, mono },
  tokens: {
    ...defaultConfig.tokens,
    radius: {
      ...defaultConfig.tokens.radius,
      /** `--pb-radius-sm` — controls, chips, inputs. */
      control: radius.control,
      /** `--pb-radius` — cards, sheets, dialogs. */
      card: radius.card,
    },
  },
  themes: { ...defaultConfig.themes, light, dark },
  settings: {
    ...defaultConfig.settings,
    // See the header comment: both `bg` and `backgroundColor` stay legal.
    onlyAllowShorthands: false,
  },
})

export type AppTamaguiConfig = typeof config

/**
 * Register the config with the type system.
 *
 * The module is `@tamagui/web`, not `tamagui`, even though most examples online
 * say otherwise: `TamaguiCustomConfig` is *declared* in `@tamagui/web` and only
 * re-exported by `tamagui`, and TypeScript merges a declaration only into the
 * module that declares it. Augmenting `'tamagui'` silently creates a second,
 * unrelated interface — everything still compiles, and `animation="medium"`
 * and `$navBg` are quietly untyped.
 */
declare module '@tamagui/web' {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}

export default config
