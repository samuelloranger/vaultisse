# React client rewrite

Replace the Vue 3 + Vuetify SPA with React + TanStack Router + TanStack Query +
Tamagui. The Express/Postgres server and its REST API are **not** touched.

## Contents

- [Why, and what this costs](#why-and-what-this-costs)
- [Scope](#scope)
- [Stack decisions](#stack-decisions)
- [Architecture](#architecture)
- [What TanStack Query replaces](#what-tanstack-query-replaces)
- [Component mapping](#component-mapping)
- [Feature libraries](#feature-libraries)
- [Migration strategy](#migration-strategy)
- [Testing](#testing)
- [Out of scope](#out-of-scope)

## Why, and what this costs

The owner asked for React + TanStack Router + TanStack Query, with Tamagui as
the UI layer. Recorded plainly, because the costs are real and were accepted
explicitly:

- **Upstream divergence becomes permanent.** Until now this fork could rebase on
  `AlbertAmat/vaultisse`. After this, every upstream fix is a manual
  reimplementation. Accepted.
- **The mobile pass (commit `0302f66`) is discarded.** All 1,447 lines were
  Vuetify-specific. The *findings* carry forward into this spec; the code does
  not. Accepted.
- **Vuetify 4 (plan Phase D) is cancelled**, and `@mdi/font` → `@mdi/js` (Phase
  B4) is absorbed into this rewrite's icon choice.
- **There are zero client tests.** ~19,500 lines are being rewritten with no
  safety net. Addressed in [Testing](#testing).

What this buys, beyond the ask: TanStack Query deletes the stale-cache bug class
described in the shared-library spec, and Tamagui's mobile-first heritage makes
the touch-target and desktop-modal defects far less likely to recur.

## Scope

Measured, not estimated:

| | |
|---|---|
| Vue components to replace | 66 (11,594 LOC) |
| TS files to port | 118 (7,894 LOC) |
| Distinct Vuetify components | 54, across ~460 usages |
| Server changes | **none** |

`server/` is untouched. The REST contract under `/api/rest` is the fixed
interface between old and new clients, and it is already documented across
`docs/BOOKS.md`, `CATALOG.md`, `CUSTOMERS.md`, `LOANS.md`, `LOCATIONS.md`,
`DASHBOARD.md`, `SETTINGS.md` and `AUTHENTICATION.md`.

## Stack decisions

| Concern | Choice | Note |
|---|---|---|
| Framework | React 19 | |
| Routing | TanStack Router | File-based routes, typed params |
| Server state | TanStack Query | Replaces the singleton services entirely |
| UI | Tamagui 2.7.7 | `@tamagui/vite-plugin` peer is `vite ^8.0.3` — **the Vite 8 upgrade in `8510970` is a prerequisite, not a coincidence** |
| Tables | TanStack Table | Tamagui has no data grid |
| Build | Vite 8.3.0 | Already landed |
| Language | TypeScript 5.8 | **Not 7** — see below |
| Lint/format | Biome | Replaces tslint; no Vue SFC caveat once `.vue` is gone |
| Icons | `@tamagui/lucide-icons` | Tree-shaken SVG, replaces the 3.6MB `@mdi/font` webfont |

**TypeScript stays at 5.8 for now.** The blocker was `vue-tsc`, which cannot run
on the TS 7 Go port. Once `.vue` files are gone, that blocker disappears and the
client can move to TS 7 with plain `tsc` — but it is sequenced *after* the
rewrite, not during it, so a type-system change and a framework change are never
being debugged at the same time.

## Architecture

Mirror the server's resource boundaries rather than inventing new ones. The
existing client's `view / controller / service / model` split maps cleanly:

```
client/src/
  routes/            TanStack Router route modules, one per screen
  api/               one module per REST resource: books, authors, categories,
                     locations, customers, loans, admin, user, app
                     - thin fetch wrappers, no caching logic
  queries/           useQuery/useMutation hooks built on api/
                     - this is where cache keys and invalidation live
  components/        shared presentational components
  features/<domain>/ screen-specific components, colocated with their route
  theme/             Tamagui config, tokens, themes
```

Rules:

- `api/` never imports from `queries/`. It returns parsed data or throws.
- Cache keys are declared once per resource in `queries/`, never inlined at a
  call site — the shared library makes cross-resource invalidation routine
  (adding a book invalidates authors and categories too).
- A component never calls `api/` directly. Always through a query hook.
- Files that change together live together: a screen's components sit beside its
  route, not in a global `components/` bucket.

## What TanStack Query replaces

This is the part that fixes real bugs rather than just changing syntax.

Today `ApplicationService` is a module-level singleton with reactive fields. It
fetches `/app/policy` once from `App.vue`'s `onMounted` and **never refetches**.
Views then mutate those singletons locally (`setCategories(...)` from a local
list) and splice deletes out optimistically. `BaseController` fetches once in its
constructor with no refetch hook.

Under one user per library that was merely fragile. Since the shared-library
change it is wrong: a category another member adds is invisible until a full page
reload, and two members editing concurrently silently clobber each other.

Query replaces all of it:

- `/app/policy` becomes a query with a sane `staleTime`, refetched on window
  focus. No singleton.
- Every mutation invalidates the keys it affects. No local list mutation, no
  optimistic splice-and-hope.
- The blank-page bug fixed in `0302f66` — the router guard reading the user
  before the policy had loaded — cannot recur: the route loader awaits the query
  rather than racing a lifecycle hook.

## Component mapping

The 54 Vuetify components collapse to roughly 25 Tamagui ones plus TanStack
Table. The non-obvious ones:

| Vuetify | React |
|---|---|
| `v-data-table` | TanStack Table + Tamagui primitives. **Mobile gets a purpose-built card layout, not an auto-stacked table** — the audit found the auto-stack renders a 55px cover under an "Image" label |
| `v-navigation-drawer` | Tamagui `Sheet` on mobile, persistent sidebar above `sm` |
| `v-dialog` | `Dialog` on desktop, `Sheet` on mobile — replaces the `:fullscreen="smAndDown"` workaround wholesale |
| `v-snackbar` | `Toast`, bottom-anchored on mobile |
| `v-chip` | styled `View`/`Text` |
| `useDisplay()` | Tamagui media queries (`$gtSm` etc.) |
| `v-tooltip` as sole label | **not ported as-is** — tooltips never open on touch; these become real labels or `aria-label`s |

### Mobile requirements carried forward from `0302f66`

These were found by audit and verified by measurement. They are requirements of
the new client, not suggestions:

- 16px minimum font-size on every input (below that, iOS Safari zooms on focus).
- 44px minimum touch target for every interactive control.
- Dialogs must not exceed the viewport or place their action row off-screen;
  no fixed pixel heights.
- No hover-only or drag-only affordance may be the sole path to an action.
- `autocomplete` / `inputmode` / `type="email"` on every relevant field.
- Per-row actions collapse into one overflow control on phones rather than
  three competing controls in a 390px row.
- Use `100dvh`, never `100vh`.
- The legal footer does not occupy mobile layout space.

The server-rendered `login.html` / `register.html` pages are **not** part of this
rewrite and keep their existing 16px fix.

## Feature libraries

| Current | Decision |
|---|---|
| `chart.js` + `vue-chartjs` | → `chart.js` + `react-chartjs-2` |
| `vue-i18n` | → lightweight context hook. Labels come from the DB (`app_labels`) via `/app/policy`, so almost none of vue-i18n's feature set is used |
| `jspdf`, `jsbarcode` | Keep — framework-agnostic |
| `epubjs` | Keep for now. Framework-agnostic, mounts into a ref. Unmaintained since 2023, but replacing the reader *and* the framework at once is two risks; revisit after |
| `exceljs` | → `write-excel-file`. Unmaintained since 2024, and it is the second-largest JS chunk at 945KB |
| `html5-qrcode` | → `BarcodeDetector` with `@zxing/browser` fallback. Unmaintained since 2023; the rewrite is the right moment |
| `@mdi/font` | → `@tamagui/lucide-icons`. Drops 3.6MB of webfont |

## Migration strategy

**Big-bang, in a parallel directory.** Not incremental.

There is no practical way to run Vue and React side by side in one SPA behind a
single `/app` mount without building a bridge that costs more than the rewrite.
So: build `client-react/` alongside `client/`, cut over when it reaches parity,
then delete `client/` in one commit.

Consequences, accepted:

- The old client keeps working throughout; the server serves whichever `dist/`
  the Dockerfile points at.
- Cutover is a single revertable commit.
- Screens land in dependency order, each verified against the real API before the
  next starts: shell/auth → dashboard → search → book detail → locations →
  categories → authors → customers → loans → settings → **admin** (which has no
  Vue implementation at all — it is new UI against the already-built
  `/api/rest/admin/users`).

## Testing

Rewriting ~19,500 lines with zero client tests is the largest risk here, and
unlike the others it is not inherent — it is a gap.

**Vitest + React Testing Library are set up in the first task**, before any
screen is ported. Not to chase coverage, but so that each ported screen has at
least: it renders, it shows data from a mocked query, its primary action fires
the right mutation, and its error state renders.

The server's 145 tests continue to guard the API contract the client depends on.

Playwright drives the real app at a 390px viewport for each ported screen, as it
did for the mobile pass — that harness already exists.

## Out of scope

- Any change to `server/`, the REST contract, or the database.
- The server-rendered `login.html` / `register.html` pages.
- TypeScript 7 on the client (sequenced after the rewrite).
- Vuetify 4 (cancelled).
- Replacing `epubjs` (deferred).
- React Native / native app targets. Tamagui makes this possible later; nothing
  here is built for it.
