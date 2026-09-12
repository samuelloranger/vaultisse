import * as fs from 'node:fs'
import * as path from 'node:path'
import react from '@vitejs/plugin-react'
import { tamaguiPlugin } from '@tamagui/vite-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig, type Plugin } from 'vite'

/**
 * The PWA install surface, and the content type each file has to be served
 * with. Kept in step with `PUBLIC_PWA_FILES` in server/src/AppService.ts, which
 * is what serves them in production.
 *
 * `application/manifest+json` is not optional pedantry: a manifest served as
 * `text/plain` or `application/octet-stream` is rejected outright, and the
 * failure surfaces as "the app just isn't installable" with a 200 in the
 * network log.
 */
const PWA_ROOT_FILES: Record<string, string> = {
  'manifest.webmanifest': 'application/manifest+json',
  'favicon.svg': 'image/svg+xml',
  'favicon.ico': 'image/x-icon',
  'apple-touch-icon.png': 'image/png',
  'icon-192.png': 'image/png',
  'icon-512.png': 'image/png',
  'icon-maskable-192.png': 'image/png',
  'icon-maskable-512.png': 'image/png',
}

/**
 * Serve the PWA install surface from the site *root* in dev and preview.
 *
 * `base` is `/app/`, so Vite publishes everything in `public/` under `/app/`,
 * and in production the server does the opposite: those eight files are the one
 * part of the client reachable without a session, at the root, because the
 * manifest declares `scope: "/"` and is fetched without credentials (see
 * `PUBLIC_PWA_FILES` in server/src/AppService.ts).
 *
 * Without this, `/manifest.webmanifest` 404s on the dev server and the manifest
 * can only ever be exercised against a built image - which is exactly the class
 * of bug that ships: install works in dev and does nothing in production, or
 * the reverse.
 */
function pwaRootFiles(publicDir: string): Plugin {
  const handler = (
    url: string | undefined,
    res: { setHeader(k: string, v: string): void; end(body?: unknown): void },
    next: () => void
  ) => {
    const name = (url ?? '').split('?')[0].replace(/^\//, '')
    const type = PWA_ROOT_FILES[name]
    if (!type) return next()

    const file = path.join(publicDir, name)
    if (!fs.existsSync(file)) return next()

    res.setHeader('Content-Type', type)
    // Match the server: revalidate rather than cache, the names are not hashed.
    res.setHeader('Cache-Control', 'no-cache')
    res.end(fs.readFileSync(file))
  }

  return {
    name: 'vaultisse:pwa-root-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => handler(req.url, res, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => handler(req.url, res, next))
    },
  }
}

/**
 * Vite config for the React client.
 *
 * Three things here are load-bearing and must not drift:
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
 *  - `pwaRootFiles`, which puts the eight install-surface files back at the
 *    site root that `base: '/app/'` moved them away from. See its own comment.
 */
export default defineConfig(({ command }) => {
  const isDev = command === 'serve'
  const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:3000'
  const proxyToApi = { target: apiTarget, changeOrigin: true, secure: false }

  return {
    base: '/app/',
    plugins: [
      pwaRootFiles(path.resolve(import.meta.dirname, './public')),
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
