import { fontStacks } from './palette'

/**
 * The handful of rules that have to exist as real CSS rather than as Tamagui
 * props, injected once from `main.tsx`.
 *
 * Everything here is a *floor* — a safety net under markup no screen owns
 * (browser-native controls, Tamagui internals, anything a later screen renders
 * as a raw element). Screens still set these properties themselves; this
 * catches what slips through.
 */
const GLOBAL_CSS = `
  html, body, #root {
    margin: 0;
    padding: 0;
    /*
     * 100dvh, never 100vh. On mobile Safari and Chrome, 100vh is the viewport
     * with the URL bar *hidden*, so a 100vh app shell is taller than the
     * screen the moment the bar is showing and the bottom of every page is
     * unreachable. dvh tracks the bar.
     */
    min-height: 100dvh;
  }

  body {
    font-family: ${fontStacks.body};
    /* Belt and braces with Tamagui's own theme background: the element behind
       the app must never flash white in the dark theme. */
    background: var(--background);
    color: var(--color);
    -webkit-font-smoothing: antialiased;
    /* Nothing may scroll the page sideways. Wide content (tables, shelves)
       gets its own overflow-x container instead. */
    overflow-x: hidden;
  }

  /*
   * iOS Safari zooms the whole viewport in when a form control smaller than
   * 16px takes focus, and offers no way back out. The floor is applied at every
   * width, not just on phones: a 390px browser window on a desktop is still a
   * 390px layout, and there is no visual budget saved by 14px fields.
   */
  input, select, textarea, button {
    font-family: inherit;
    font-size: 16px;
  }

  /*
   * The 44px touch-target floor, for controls the app does not render itself.
   * Tamagui's own $true size is already 44, so this only catches raw elements.
   */
  button, [role="button"], select {
    min-height: 44px;
  }

  /* Links inline in a sentence are exempt from 44px (WCAG 2.5.8) but still
     deserve a real line box. */
  a { color: var(--accent); }

  /* Respect the notch / home indicator without reserving space on devices
     that have neither. */
  :root {
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`

/** Inject {@link GLOBAL_CSS} once. Idempotent — safe under React StrictMode. */
export function installGlobalStyles(doc: Document = document): void {
  const id = 'vaultisse-globals'
  if (doc.getElementById(id)) return
  const style = doc.createElement('style')
  style.id = id
  style.textContent = GLOBAL_CSS
  doc.head.appendChild(style)
}
