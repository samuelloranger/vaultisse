import * as path from 'node:path'
import { tamaguiAliases } from '@tamagui/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * A separate config from `vite.config.ts` on purpose.
 *
 * The app build needs the TanStack Router code generator and the Tamagui
 * plugin; a unit test needs neither. Running them under Vitest costs a route
 * tree regeneration per watch cycle and, in Tamagui's case, pulls the
 * static-extraction worker into a jsdom process that has no use for it.
 *
 * Tamagui components still work here — at runtime they read the config through
 * `TamaguiProvider`, which `renderWithProviders` supplies. The vite plugin is a
 * build-time optimiser, not a requirement.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
      // Without these, `import 'react-native'` inside Tamagui resolves to the
      // real React Native source — Flow-typed JS that Vite cannot parse, which
      // surfaces as a bare `SyntaxError: Unexpected token 'typeof'` with no
      // stack and no file name. `tamaguiPlugin` installs them for the app
      // build; the test run has to ask for them itself.
      ...tamaguiAliases({ svg: true }),
    ],
    // One Tamagui runtime, always. `@tamagui/lucide-icons` pins an older
    // `@tamagui/core`, which the package manager nests rather than hoists — two
    // copies of the library means two React contexts, and every icon throws
    // "Missing theme" because it is looking in the wrong one.
    dedupe: ['tamagui', '@tamagui/core', '@tamagui/web', 'react', 'react-dom'],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    'process.env.TAMAGUI_TARGET': JSON.stringify('web'),
  },
  test: {
    // Limit concurrent jsdom/Tamagui workers when client and server suites
    // run together. Per-file isolation still spawns 28 workers in total, but
    // running too many at once starves normal Testing Library waits.
    maxWorkers: 4,
    server: {
      deps: {
        // Vitest externalises `node_modules` by default and loads them through
        // Node's own resolver, which never sees Vite's aliases. The Tamagui
        // packages have to go through Vite's pipeline for the aliases above to
        // apply at all — otherwise `@tamagui/lucide-icons` pulls in the real
        // `react-native-svg`, whose Flow-typed source fails to parse.
        inline: [/tamagui/, /react-native-svg/],
      },
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
