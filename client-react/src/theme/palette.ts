/**
 * The "Reading Room" palette, ported verbatim from the old client's
 * `client/src/assets/styles/theme.scss` custom properties.
 *
 * The old client shipped two named themes selected by a `data-theme`
 * attribute: **beige** (warm off-white, terracotta accent, literary serif
 * display face) and **library** (dark navy, blue accent, geometric sans
 * display face). They map onto Tamagui's `light` / `dark` schemes one-for-one,
 * which is why `dark` here is blue rather than a warm dark — it is the product's
 * existing dark theme, not a new invention.
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
  /** `--pb-surface` — cards and sheets sitting on the ground. */
  surface: string
  /** `--pb-surface-alt` — a card's own recessed regions. */
  surfaceAlt: string
  /** `--pb-border` — ordinary dividers. */
  border: string
  /** `--pb-border-strong` — hover/active edges and hard boundaries. */
  borderStrong: string
  /** `--pb-text` — body copy. */
  text: string
  /** `--pb-text-muted` — secondary copy, counts, captions. */
  textMuted: string
  /** `--pb-primary` — primary action fill. */
  primary: string
  /** `--pb-secondary` — eyebrows and secondary emphasis. */
  secondary: string
  /** `--pb-accent` — the decorative "spine" accent. */
  accent: string
  /** `--pb-accent-soft` — accent used as a background wash. */
  accentSoft: string
  /** `--pb-nav-bg` — the nav "shelf" frame; dark in *both* themes. */
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
  /** Foreground that reads on top of `primary`. Not in the SCSS; Vuetify
   *  derived it, and Tamagui needs it named. */
  onPrimary: string
}

/** `[data-theme="beige"]` — the default warm "Reading Room" light theme. */
export const beige: ReadingRoomPalette = {
  bg: '#f7f2ea',
  bgAlt: '#f1e9da',
  surface: '#ffffff',
  surfaceAlt: '#f1e9da',
  border: '#e7ddcb',
  borderStrong: '#d9c9ac',
  text: '#2f2a22',
  textMuted: '#7d7364',
  primary: '#c97b3d',
  secondary: '#c97b3d',
  accent: '#c97b3d',
  accentSoft: '#f5e3d0',
  navBg: '#2b2318',
  navBgAlt: '#241c13',
  navText: '#f3ede1',
  navTextMuted: '#b9ab90',
  navActiveBg: 'rgba(201, 123, 61, 0.22)',
  navBorder: 'rgba(255, 255, 255, 0.08)',
  navBorderStrong: 'rgba(255, 255, 255, 0.14)',
  navAccent: '#c97b3d',
  onPrimary: '#ffffff',
}

/** `[data-theme="library"]` — the existing dark theme. */
export const library: ReadingRoomPalette = {
  bg: '#0a0e17',
  bgAlt: '#0b111c',
  surface: '#0d1420',
  surfaceAlt: '#111a2b',
  border: 'rgba(255, 255, 255, 0.09)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  text: '#e8ecf3',
  textMuted: '#8b94a7',
  primary: '#1c7ff1',
  secondary: '#78dcf6',
  accent: '#1c7ff1',
  accentSoft: 'rgba(120, 220, 246, 0.14)',
  navBg: '#0a0e17',
  navBgAlt: '#070a11',
  navText: '#e8ecf3',
  navTextMuted: '#8b94a7',
  navActiveBg: 'rgba(120, 220, 246, 0.14)',
  navBorder: 'rgba(255, 255, 255, 0.08)',
  navBorderStrong: 'rgba(255, 255, 255, 0.18)',
  navAccent: '#78dcf6',
  onPrimary: '#ffffff',
}

/**
 * `--pb-shadow`, per theme. Kept out of {@link ReadingRoomPalette} because it
 * is a box-shadow string rather than a colour and only the web target can use
 * it directly.
 */
export const shadow = {
  beige: '0 1px 2px rgba(47, 42, 34, 0.06), 0 8px 24px -12px rgba(47, 42, 34, 0.18)',
  library: '0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -12px rgba(0, 0, 0, 0.6)',
} as const

/** `--pb-radius` / `--pb-radius-sm`, in px. */
export const radius = { card: 14, control: 10 } as const

/** The three type families from the SCSS, as full CSS font stacks. */
export const fontStacks = {
  /** `--pb-font-body` */
  body: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  /** `--pb-font-display` (beige). The serif is the product's signature. */
  display: 'Fraunces, Georgia, serif',
  /** `--pb-font-mono` */
  mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
} as const
