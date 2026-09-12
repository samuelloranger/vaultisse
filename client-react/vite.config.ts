import * as path from 'node:path'
import react from '@vitejs/plugin-react'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'

/**
 * Vite config for the React client.
 *
 * Two things here are load-bearing and must not drift:
 *
 *  - `base: '/app/'` — the server serves this SPA under `/app` and
 *    `requireAuthPage` catch-alls `/app/*` back to `index.html`, so a hard
 *    refresh on `/app/book/12` still boots the app. TanStack Router is given
 *    the matching `basepath` in `src/main.tsx`.
 *  - The dev proxy. `VITE_API_TARGET` exists so the dev server can point at an
 *    API on a port that isn't already taken on the host (the default 3000 often
 *    is). `/login` and `/register` are proxied as well as `/api/rest`, because
 *    the session-expired handler does a real `window.location.href = '/login'`
 *    navigation — without the proxy that 404s on the Vite dev server and the
 *    redirect can't be exercised in dev at all.
 */
export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000'
  const proxyToApi = { target: apiTarget, changeOrigin: true, secure: false }

  return {
    base: '/app/',
    plugins: [
      // Must come before the React plugin: it generates routeTree.gen.ts from
      // src/routes/** and that output is then compiled like any other source.
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tamaguiPlugin({
        config: './src/theme/tamagui.config.ts',
        components: ['tamagui'],
        // No `optimize: true`. Tamagui's compile-time style extractor is an
        // optimisation, not a correctness requirement, and turning it on
        // changes build behaviour enough to deserve its own commit with its own
        // before/after bundle numbers.
      }),
    ],
    resolve: {
      alias: {
        // `import.meta.dirname` rather than `__dirname`: Vite 8's native config
        // loader (the planned default) has no CJS globals.
        '@': path.resolve(import.meta.dirname, './src'),
      },
    // One Tamagui runtime, always. `@tamagui/lucide-icons` pins an older
    // `@tamagui/core`, which the package manager nests rather than hoists — two
    // copies of the library means two React contexts, and every icon throws
    // "Missing theme" because it is looking in the wrong one.
    dedupe: ['tamagui', '@tamagui/core', '@tamagui/web', 'react', 'react-dom'],
    },
    define: {
      // react-native-web reads this; without it Tamagui's RN-compat layer
      // throws on `process is not defined` in the browser.
      'process.env.NODE_ENV': JSON.stringify(
        isDev ? 'development' : 'production'
      ),
      'process.env.TAMAGUI_TARGET': JSON.stringify('web'),
    },
    build: {
      minify: 'esbuild',
    },
    server: {
      proxy: isDev
        ? {
            '/api/rest': proxyToApi,
            '/login': proxyToApi,
            '/register': proxyToApi,
          }
        : undefined,
    },
  }
})
