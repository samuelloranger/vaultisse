/**
 * The "Reading Room" palette — one product, two lighting conditions.
 *
 * **light** is the warm off-white shelf: cream ground, white cards, terracotta
 * accent, a literary serif for display. It is ported from the old client's
 * `client/src/assets/styles/theme.scss` `[data-theme="beige"]` block, with the
 * contrast failures in it repaired (see "What moved", below).
 *
 * **dark** is the *same* room at night, not a second product. The old client
 * also shipped a `[data-theme="library"]` theme — navy ground, Material blue,
 * cyan — but those were two separately-chosen skins picked from a dropdown, not
 * a light/dark pair. Dropping them into Tamagui's `light` / `dark` slots meant
 * that flipping the theme swapped the product's identity: the warm literary
 * shelf became a generic blue dashboard, the terracotta disappeared, and the
 * nav ended up the *exact same colour* as the page behind it (1.00:1), so the
 * sidebar and the mobile app bar stopped reading as chrome at all. The navy
 * theme is gone. `dark` below is built from the light theme's own espresso
 * (`#2b2318`, the nav "shelf" colour) extended into a full ladder, and it keeps
 * the terracotta.
 *
 * ### The ladder
 *
 * Surfaces are spaced by CIE L\*, not by contrast ratio. Near black, WCAG's
 * +0.05 flare term flattens everything — `#0d1420` on `#0a0e17` computes as
 * 1.05:1 whether or not a human can see the edge — so the grounds are laid out
 * on an even lightness ramp instead and the *contrast* budget is spent where
 * WCAG actually applies: text and control outlines.
 *
 * | key            | light L\* | dark L\* |
 * |----------------|----------:|---------:|
 * | `navBgAlt`     |      11.6 |      3.7 |
 * | `navBg`        |      14.3 |      6.5 |
 * | `bgAlt`        |      92.6 |      9.5 |
 * | `bg`           |      95.7 |     12.6 |
 * | `bgHover`      |      91.6 |     15.6 |
 * | `surface`      |     100.0 |     18.5 |
 * | `surfaceAlt`   |      92.6 |     22.2 |
 * | `border`       |      88.0 |     27.5 |
 * | `borderStrong` |      81.6 |     35.0 |
 * | `borderControl`|      55.7 |     53.9 |
 *
 * Light lifts (`surface` is the brightest thing on the page); dark also lifts
 * (`surface` sits *above* `bg`) — which is why `surfaceAlt` is darker than
 * `surface` in light and lighter than it in dark. Both directions mean the same
 * thing: "a step away from the card's own plane". The nav is the heaviest
 * element in both themes, so it is darker than everything else in both.
 *
 * ### What moved, and why
 *
 * Every change below is a measured WCAG failure, not taste (ratios in
 * `docs`-free form: run the audit in the commit message to reproduce):
 *
 *  - `onPrimary` was `#ffffff` on `#c97b3d` — **3.29:1**, failing AA on every
 *    primary button in the app. The signature terracotta is kept exactly as it
 *    was — bar a 1.7% luminance trim so the fill itself clears 3:1 against the
 *    page (WCAG 1.4.11), which is below the perceptual threshold — and the
 *    *label* flipped to a deep espresso instead (5.08:1 light, 5.15:1 dark).
 *    The primary button is now pixel-identical in both themes,
 *    which is the strongest "same product" signal available.
 *  - `accent` doubles as link colour (`a { color: var(--accent) }` in
 *    `globals.ts`) and as the focus ring, so it has to survive as *text*.
 *    `#c97b3d` was 2.95:1 on the page ground. `accent` is now the deeper burnt
 *    sienna and `primary` keeps the bright terracotta; the two roles were
 *    already separate keys, they had just been given the same value.
 *  - `secondary` is the `Eyebrow` colour — 11px mono all-caps, the smallest
 *    type in the product — and was the same 2.95:1 terracotta. It is now a
 *    sepia in light and a sand in dark.
 *  - `textMuted` failed on the recessed grounds in light (3.86:1 on `bgAlt`).
 *  - `borderControl` is new. `border` is a *decorative* divider and is allowed
 *    to be quiet; an input's outline is the only thing that identifies the
 *    field, so WCAG 1.4.11 wants 3:1 for it. One token could not be both.
 *  - `controlTrack` is new, for the same reason one step further in: a switch's
 *    off track is a *fill*, not an outline, and the only mid-tone that existed
 *    to paint it with was `textMuted` — a type colour. Measured at 3.68:1 light
 *    / 3.52:1 dark against `surface`.
 *  - `bgHover` is new. Hover used to reuse `bgAlt`, which is *darker* than the
 *    ground — correct in light, but in dark it made the hovered row recede into
 *    the page instead of lifting.
 *  - `danger` / `onDanger` / `success` are new, and `tamagui.config.ts` aliases
 *    Tamagui's `$red10` / `$green10` onto them. Those defaults are Radix hues
 *    chosen against a neutral grey scale; on a cream or espresso ground they
 *    read as a different design system, and `$red10` as a *fill* with white on
 *    it was 3.7:1.
 *
 * Fonts do not change between themes. The old client gave `library` a geometric
 * sans display face; that never survived the port, and it should not — the
 * serif is the product's signature and a theme toggle is not the place to
 * change typeface.
 *
 * Every `--pb-*` custom property has exactly one entry below. Nothing else in
 * the client may hardcode a hex value; if a screen needs a colour that isn't
 * here, it gets added here first and used as a theme key.
 */

/** One theme's worth of ported `--pb-*` values. */
export type ReadingRoomPalette = {
  /** `--pb-bg` — the page ground. */
  bg: string
  /** `--pb-bg-alt` — recessed areas (shelf rows, table headers). */
  bgAlt: string
  /**
   * Hover/press/focus wash for anything sitting directly on `bg`.
   *
   * Not the same as {@link ReadingRoomPalette.bgAlt}: "recessed" and "pointer
   * is on it" are different states, and they move in *opposite* directions in
   * a dark theme, where a hovered thing lifts toward the light.
   */
  bgHover: string
  /** `--pb-surface` — cards and sheets sitting on the ground. */
  surface: string
  /** `--pb-surface-alt` — a card's own recessed regions. */
  surfaceAlt: string
  /** `--pb-border` — ordinary dividers. Decorative; not held to 3:1. */
  border: string
  /**
   * The outline of a control (input, select, textarea).
   *
   * Separate from {@link ReadingRoomPalette.border} because it is the only
   * thing that says "this is a field you can type in" — WCAG 1.4.11 non-text
   * contrast, 3:1 against the control's own fill (`surface`).
   */
  borderControl: string
  /** `--pb-border-strong` — hover/active edges and hard boundaries. */
  borderStrong: string
  /**
   * The *fill* of a control's track — a switch in its off position today, a
   * slider rail or a progress trough tomorrow.
   *
   * Held to the same 3:1 against `surface` as
   * {@link ReadingRoomPalette.borderControl}, and for the same reason: a track
   * is the whole shape of the control, so if it does not clear 1.4.11 the
   * control is not there. It starts life at the same value as `borderControl`
   * because it answers the same question; it is a separate key so that
   * redrawing a switch never has to move every input outline with it.
   *
   * Before this existed, `ToggleRow` painted its off track with `colorMuted` —
   * a *text* colour, borrowed because nothing better was named. That reads far
   * too heavy for a resting control (6.07:1 in light), and it meant a palette
   * change aimed at captions would silently restyle every switch.
   */
  controlTrack: string
  /** `--pb-text` — body copy. */
  text: string
  /** `--pb-text-muted` — secondary copy, counts, captions. AA on every ground. */
  textMuted: string
  /** `--pb-primary` — primary action fill. The signature terracotta. */
  primary: string
  /** `--pb-secondary` — eyebrows and secondary emphasis. Read as small text. */
  secondary: string
  /**
   * `--pb-accent` — interactive ink: links, focus rings, the decorative
   * "spine" rule. Deeper than `primary`, because unlike `primary` it is used
   * as text on the page ground rather than as a fill behind a label.
   */
  accent: string
  /** `--pb-accent-soft` — accent used as a background wash. */
  accentSoft: string
  /** Destructive text and fills. Aliased onto Tamagui's `$red10`. */
  danger: string
  /** Foreground that reads on top of `danger`. */
  onDanger: string
  /** Positive trend / confirmation. Aliased onto Tamagui's `$green10`. */
  success: string
  /** `--pb-nav-bg` — the nav "shelf" frame; the heaviest element in *both* themes. */
  navBg: string
  /** `--pb-nav-bg-alt` */
  navBgAlt: string
  /** `--pb-nav-text` */
  navText: string
  /** `--pb-nav-text-muted` */
  navTextMuted: string
  /** `--pb-nav-active-bg` — selected nav item wash. */
  navActiveBg: string
  /** `--pb-nav-border` */
  navBorder: string
  /** `--pb-nav-border-strong` */
  navBorderStrong: string
  /** `--pb-nav-accent` — selected-item highlight, independent of `accent`. */
  navAccent: string
  /**
   * The label colour for text sitting **on** the `primary` fill. Not in the
   * SCSS; Vuetify derived it, and Tamagui needs it named.
   *
   * **It is a near-black espresso in both themes, not white.** The name reads
   * like "the light one" and that is exactly the trap: it was `#ffffff` until
   * the terracotta fill stayed put and the *label* flipped instead, because
   * white on `#c67838` measures 3.29:1 and fails AA on every primary button in
   * the app. It is now 5.08:1 light / 5.15:1 dark, and — since `primary` is the
   * same terracotta in both — the same espresso in both.
   *
   * So it is the **only** thing it says it is: ink, for a label, over the
   * primary fill. It is not "the colour that contrasts with the theme", and it
   * is not a surface. A knob, chip or tick that has to read against something
   * other than `primary` wants `surface` (a switch thumb reads as the card
   * showing through the track — see `e49c341`, which is this mistake), and
   * anything over `danger` wants `onDanger`.
   */
  onPrimary: string
}

/** The warm off-white "Reading Room" — the daylight theme. */
export const beige: ReadingRoomPalette = {
  bg: '#f7f2ea',
  bgAlt: '#f1e9da',
  bgHover: '#ece2cf',
  surface: '#ffffff',
  surfaceAlt: '#f1e9da',
  border: '#e3d7c2',
  borderControl: '#94836a',
  borderStrong: '#cdb896',
  controlTrack: '#94836a',
  text: '#2f2a22',
  textMuted: '#6b6153',
  primary: '#c67838',
  secondary: '#7d6647',
  accent: '#9c5a22',
  accentSoft: '#f5e3d0',
  danger: '#b3261e',
  onDanger: '#ffffff',
  success: '#2f6b46',
  navBg: '#2b2318',
  navBgAlt: '#241c13',
  navText: '#f3ede1',
  navTextMuted: '#b9ab90',
  navActiveBg: 'rgba(198, 120, 56, 0.22)',
  navBorder: 'rgba(255, 255, 255, 0.08)',
  navBorderStrong: 'rgba(255, 255, 255, 0.14)',
  navAccent: '#c67838',
  onPrimary: '#26170a',
}

/**
 * The same room by lamplight.
 *
 * Grown out of `beige.navBg` (`#2b2318`) rather than invented: the dark theme's
 * ground *is* the light theme's shelf. Terracotta, serif and nav wash are
 * carried across unchanged; only the lightness ladder is inverted.
 */
export const nocturne: ReadingRoomPalette = {
  bg: '#252019',
  bgAlt: '#1e1a14',
  bgHover: '#2c261e',
  surface: '#332c23',
  surfaceAlt: '#3c3429',
  border: '#484032',
  borderControl: '#8d7f68',
  borderStrong: '#5b5140',
  controlTrack: '#8d7f68',
  text: '#f3ede1',
  textMuted: '#ab9d87',
  primary: '#c67838',
  secondary: '#c9a97a',
  accent: '#dd9052',
  accentSoft: 'rgba(198, 120, 56, 0.16)',
  danger: '#f19b90',
  onDanger: '#2a0a07',
  success: '#7fd4a3',
  navBg: '#17140f',
  navBgAlt: '#0f0d0a',
  navText: '#f3ede1',
  navTextMuted: '#ab9d87',
  navActiveBg: 'rgba(198, 120, 56, 0.22)',
  navBorder: 'rgba(243, 237, 225, 0.08)',
  navBorderStrong: 'rgba(243, 237, 225, 0.16)',
  navAccent: '#dd9052',
  onPrimary: '#241608',
}

/**
 * `--pb-shadow`, per theme. Kept out of {@link ReadingRoomPalette} because it
 * is a box-shadow string rather than a colour and only the web target can use
 * it directly.
 */
export const shadow = {
  beige: '0 1px 2px rgba(47, 42, 34, 0.06), 0 8px 24px -12px rgba(47, 42, 34, 0.18)',
  nocturne: '0 1px 2px rgba(0, 0, 0, 0.45), 0 8px 24px -12px rgba(0, 0, 0, 0.75)',
} as const

/** `--pb-radius` / `--pb-radius-sm`, in px. */
export const radius = { card: 14, control: 10 } as const

/** The three type families from the SCSS, as full CSS font stacks. */
export const fontStacks = {
  /** `--pb-font-body` */
  body: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  /** `--pb-font-display` — the serif is the product's signature, in both themes. */
  display: 'Fraunces, Georgia, serif',
  /** `--pb-font-mono` */
  mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
} as const
