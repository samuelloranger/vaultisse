import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

/**
 * Global test setup.
 *
 * jsdom implements neither `matchMedia` nor `ResizeObserver`, and Tamagui uses
 * both — `matchMedia` to resolve `$gtSm` / `useMedia()`, `ResizeObserver` in
 * `Sheet`'s measuring. Without these stubs every component test throws before
 * it renders anything.
 *
 * `matchMedia` reports **no** match, which resolves to the narrow layout: tests
 * therefore exercise the phone path by default. That is the right default here
 * — the phone path is the one the spec's hard requirements are about, and the
 * desktop path is the fallback.
 */

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// Tamagui's animation driver schedules through rAF; jsdom's is fine but noisy
// without a stable clock in CI. Keep the real one, just make sure it exists.
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(
      () => cb(Date.now()),
      0
    ) as unknown as number) as typeof requestAnimationFrame
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
