import { defaultConfig } from '@tamagui/config/v4'
import { createFont, createTamagui } from 'tamagui'
import {
  beige,
  fontStacks,
  nocturne,
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
 *  - `themes.light` / `themes.dark` get the "Reading Room" palette (see
 *    `./palette.ts`) layered on top of the defaults, plus the extra
 *    product-specific keys (`$navBg`, `$accentSoft`, …) the app shell needs.
 *    Two of the defaults are *overwritten* rather than extended — `$red10` and
 *    `$green10`. They are Radix hues tuned against a neutral grey scale, they
 *    are already spelled that way at ~30 call sites, and on a cream or espresso
 *    ground they read as a different design system. Pointing them at the
 *    palette's `danger` / `success` fixes every one of those call sites without
 *    a rename, and `$danger` / `$success` exist for new code.
 *  - Fonts get the product's own stacks: a literary serif for display, Inter
 *    for body, JetBrains Mono for the eyebrow/code style.
 *  - `onlyAllowShorthands` is turned **off**. The v4 preset enables it, which
 *    makes `backgroundColor` a type error and forces `bg`. Half of React's
 *    ecosystem muscle memory is the long form; making both legal removes a
 *    whole class of "why won't this compile" for every later screen.
 *  - **The preset's 292 sub-themes are dropped**; `themes` is `light` and
 *    `dark` and nothing else. See below.
 *
 * ### Why there are no sub-themes
 *
 * `@tamagui/config/v4` ships 294 themes: `light`, `dark`, and 292 generated
 * variants — `dark_Button`, `light_Input`, `dark_Switch`, `light_Card`, the
 * same again under six colour scales, and so on. A Tamagui component renders
 * inside the one matching its `componentName`, so with the preset spread in,
 * every `<Button>` in this app resolved its colours from a **neutral grey
 * ramp** picked for a different design, on top of the Reading Room ground.
 *
 * That is not theoretical. It is why the lending switch rendered as a dark
 * crescent (`fe7ab48`): `createSwitch` spreads `backgroundColor:
 * '$backgroundActive'` onto the frame *after* the caller's props when
 * `checked` is true, and inside `dark_Switch` that resolved to `#1a1a1a`
 * instead of the terracotta the call site asked for. The switch was redrawn by
 * hand there; this is the cause it was working around.
 *
 * Dropping them is safe, and it was checked rather than assumed:
 *
 *  1. **Nothing goes undefined.** Every key in every preset sub-theme is also a
 *     key of its parent `light` / `dark`. There is no `$x` that only a
 *     sub-theme defines, so nothing can fail to resolve.
 *  2. **A missing sub-theme is a no-op, not an error.** `getNewThemeName` in
 *     `@tamagui/web` looks up `parent_ComponentName` and, when it is not in
 *     `themes`, simply leaves the component in its parent theme.
 *  3. **The reachable set is small and all of it is better off.** The preset's
 *     sub-theme suffixes are Button, Card, Checkbox, Input, ListItem, Progress,
 *     ProgressIndicator, RadioGroupItem, SelectItem, SelectTrigger, Slider*,
 *     Switch, SwitchThumb, TextArea and Tooltip*. This app renders exactly five
 *     of them — `Button`, `Input`, `TextArea`, `Switch`/`SwitchThumb`, and
 *     `components/Card.tsx`, whose `styled(View, { name: 'Card' })` collides
 *     with the preset's `Card` sub-theme and was quietly taking its
 *     `$borderColor` from a grey ramp. The rest are unreachable, as are the
 *     colour-scale variants (`light_blue`, `dark_red`, `*_accent`, …): they are
 *     only entered through `<Theme name>` / a `theme` prop, and this client
 *     uses neither.
 *  4. **Nothing depended on the preset's defaults.** All 96 `<Button>` call
 *     sites set `backgroundColor` explicitly, so no button's fill moves.
 *
 * Verified end to end by diffing the computed `background-color` / `color` /
 * `border-*-color` of every element on every screen, at 1280px and 390px, in
 * both themes, before and after. The only differences were the ones intended.
 *
 * If a component ever does want its own surface, add that one sub-theme here,
 * written against the palette — `light_Foo` / `dark_Foo` next to `light` /
 * `dark` below. What must not come back is 292 themes of somebody else's grey.
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
    // `bgHover`, not `bgAlt`: a hovered row and a recessed row are different
    // states, and in the dark theme they move in opposite directions.
    backgroundHover: p.bgHover,
    backgroundPress: p.bgHover,
    backgroundFocus: p.bgHover,
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
    // Overwritten, not extended — see this file's header.
    red10: p.danger,
    green10: p.success,

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
    /** The outline that identifies a control. 3:1 against `$surface`. */
    borderControl: p.borderControl,
    /** The *fill* of a control's track — a switch's off state, a slider rail. */
    controlTrack: p.controlTrack,
    primary: p.primary,
    /**
     * Label ink for text **on** `$primary` — a near-black espresso in both
     * themes, despite the name. Not a light colour, and not a surface: a knob
     * or chip that sits on anything else wants `$surface`. See `./palette.ts`.
     */
    onPrimary: p.onPrimary,
    secondary: p.secondary,
    accent: p.accent,
    accentSoft: p.accentSoft,
    danger: p.danger,
    onDanger: p.onDanger,
    success: p.success,
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
  ...readingRoomTheme(nocturne, shadow.nocturne),
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
  // Two themes, no sub-themes. See this file's header for the whole argument
  // and for what was measured before the preset's 292 were taken out.
  themes: { light, dark },
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
