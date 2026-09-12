# client-react

The React client. Built alongside the Vue `client/` per
[the rewrite design](../docs/superpowers/specs/2026-09-11-react-client-rewrite-design.md);
`client/` keeps working until this reaches parity.

React 19 · TanStack Router (file-based) · TanStack Query · Tamagui 2.7.7 ·
Vite 8.3 · TypeScript 5.8 · Vitest + React Testing Library · Biome.

```bash
bun install
VITE_API_TARGET=http://localhost:3010 bun run dev   # http://localhost:5173/app/
bun run type-check && bun run test && bun run build
```

`VITE_API_TARGET` defaults to `http://localhost:3000`. The dev server proxies
`/api/rest`, `/login` and `/register` to it.

## Layout

```
src/
  api/               one module per REST resource. Thin fetch wrappers.
  queries/           useQuery/useMutation hooks. Cache keys live here, once.
  routes/            TanStack Router route modules (file-based)
  components/        shared presentational components
  features/<domain>/ screen-specific components, beside their route
  theme/             Tamagui config, the ported palette, global CSS
  test/              render helper, fixtures, setup
```

## Rules

These are inherited by every screen added after the first. Breaking one is a
review comment, not a style preference.

1. **`api/` never imports from `queries/`.** A module there returns parsed data
   or throws `ApiError`. No caching, no state, no React.
2. **Components never call `api/`.** Always through a query hook.
3. **Cache keys are declared once, in `queries/keys.ts`.** Never inline a key
   array at a call site — cross-resource invalidation is routine here (returning
   a copy moves book counters, the dashboard and the loans list) and a key
   nobody can name is a key nobody can invalidate.
4. **No module-level singletons for server state.** Replacing
   `ApplicationService` is a core point of the rewrite.
5. **Route loaders `ensureQueryData` what the screen cannot render without, and
   `prefetchQuery` what it can show a loading state for.** The policy is
   awaited; the dashboard is not.
6. **Colours, radii and fonts come from the theme.** `src/theme/palette.ts` is
   the only file with hex values in it.
7. **Icons are imported from `components/icons.ts`**, never from
   `@tamagui/lucide-icons` directly — its root barrel is 1,700 icons and does
   not tree-shake (it cost 840KB of bundle before this was fixed).
8. **Every modal goes through `components/ResponsiveDialog`** — `Sheet` on
   phones, `Dialog` from `sm`, action row pinned, no fixed heights.
9. **Every text input goes through `components/Field`**, which pins 16px and
   44px and requires `autoComplete` and `inputMode`.

## Mobile floors

Hard requirements from the spec, enforced structurally rather than by review:

| Rule | Where it lives |
|---|---|
| 16px minimum input font-size (below that iOS Safari zooms on focus) | `components/Field.tsx` + `theme/globals.ts` |
| 44px minimum touch target | Tamagui's `$true` size is 44; pinned again on every icon button |
| `100dvh`, never `100vh` | `theme/globals.ts`, `components/AppShell.tsx` |
| Sheet on mobile, Dialog above `sm`; action row never off-screen | `components/ResponsiveDialog.tsx` |
| No hover-only or drag-only affordance as the sole path to an action | Shelves scroll natively; hover is emphasis only |
| Page never scrolls horizontally | `theme/globals.ts`; wide content gets its own `overflow-x` box |

## Tests

Per the spec, each screen gets at least four:
it renders · it shows data from a mocked query · its primary action fires the
right mutation · its error state renders.

`src/features/dashboard/DashboardScreen.test.tsx` is the template — copy its
shape. It mocks the `api/` module rather than the query hook, so the real cache
key and the real invalidation stay in the test.

`src/api/http.test.ts` pins the session rules from `docs/AUTHENTICATION.md`:
a 401 with `sessionExpired: true` hard-navigates to `/login`; any other 401, and
a 403, must not.
