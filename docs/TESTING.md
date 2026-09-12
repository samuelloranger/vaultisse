# Testing

Two suites, one per package. Most of this document is about the server's,
which is the older and more involved of the two; the client's has its own
section at the end.

- **`server/`** - `bun test` + Supertest integration tests against the real
  Express/Postgres API, plus a few pure-function unit tests. Runs automatically
  on every push and PR via
  [`.github/workflows/test.yml`](../.github/workflows/test.yml) - see
  [Continuous integration](#continuous-integration) below.
- **`client-react/`** - Vitest + React Testing Library, jsdom, no server. See
  [Testing the client](#testing-the-client).

## Contents

- [Running locally](#running-locally)
- [How a test file works](#how-a-test-file-works)
- [The dedicated test database](#the-dedicated-test-database)
- [Real login, not a shortcut](#real-login-not-a-shortcut)
- [Mocking external APIs](#mocking-external-apis)
- [Adding a new test file](#adding-a-new-test-file)
- [What's covered, what isn't](#whats-covered-what-isnt)
- [Testing the client](#testing-the-client)
- [Continuous integration](#continuous-integration)

## Running locally

Needs a reachable Postgres - the same one `docker-compose up` gives you for
normal development is enough, tests use a completely separate database on it
(see below) so they never touch your dev/demo data.

```bash
cd server
bun test          # single run
bun test --watch
```

`bun run test` / `bun run test:watch` work too - both scripts just call
`bun test`.

## How a test file works

```ts
import {setupTestApp} from "../helpers/testApp";
import {createAuthenticatedUser} from "../helpers/auth";

const app = setupTestApp();

it("does the thing", async () => {
    const user = await createAuthenticatedUser(app);
    const res = await user.agent.get("/api/rest/book/search");
    expect(res.status).toBe(200);
});
```

- **`setupTestApp()`** ([`test/helpers/testApp.ts`](../server/test/helpers/testApp.ts))
  wires up the `AppService` (routes mounted, HTTP server listening on an
  OS-assigned free port). `bun test` runs the whole suite in one process with
  one module graph, so all files share that one instance: `setupTestApp()`
  initialises it on the first call and is a no-op afterwards, and the single
  teardown runs from the preload's global `afterAll` once every file is done.
  Call it once per file exactly as before - just don't assume your file has a
  private `AppService`, a private pg pool, or a private module registry the
  way it would have had under Jest.
- **`createAuthenticatedUser()`** ([`test/helpers/auth.ts`](../server/test/helpers/auth.ts))
  registers and logs in a brand-new real account and hands back a `supertest`
  agent that carries its session cookie automatically, like a logged-in
  browser tab.

## The dedicated test database

[`test/setup/preload.ts`](../server/test/setup/preload.ts) runs once before
the whole suite - `bun test` has no `globalSetup`, so it is wired in as a
`preload` entry in [`server/bunfig.toml`](../server/bunfig.toml) and does the
job Jest split across `globalSetup.js` and `setupFiles`: it forces every
environment variable the app reads to a deterministic test value, then drops
and recreates a `vaultisse_test` database and loads the real schema (tables + seed data - languages, formats, i18n
labels) from [`assets/db/databaseSchema.sql`](../assets/db/databaseSchema.sql),
the same file a fresh production deploy runs. A full drop+recreate rather
than truncating tables keeps this immune to schema drift - if it ever stops
working, so would a new deployment.

Locally, connection details (host/port/user/password) are read from your own
`server/.env` - only the database name is overridden. Bun loads that file
itself, before any code runs, so there is no `dotenv.config()` call anywhere
in the test path. In CI those are just real environment variables set before
the runner starts (see the workflow file), and Bun - like dotenv before it -
never overrides a variable that is already set.

Integration tests share this one database. `bun test` runs every file
sequentially in a single process, so that sharing is safe without any
`maxWorkers` setting - but it also means a file cannot assume it is alone:
anything you write that is instance-wide (a lone location, a truncated table)
is visible to every file that runs after yours.

One file opts out:
[`AuthRegisterBootstrap.test.ts`](../server/test/routes/AuthRegisterBootstrap.test.ts)
tests what happens when the **first** account on an instance registers (it
becomes the admin), which needs a genuinely empty `users` table - and the
shared database has accounts in it from whichever files ran earlier, an order
no test may assume. So it creates its own `vaultisse_test_bootstrap` database
from the same schema file, swaps the shared `AppService`'s pg pool for one
pointed at it in `beforeAll`, and restores the pool and drops the database in
`afterAll`. The swap is what a `require` inside `beforeAll` used to achieve
under Jest's per-file module registry; with one module graph, every route is
already bound to the one `AppService`, and the pool is the only thing left to
redirect (routes call `appService.getDatabasePool()` per request rather than
caching it). Reach for this only when a test genuinely needs an empty
instance; everything else belongs in the shared database. Do **not** try to
get an empty instance by truncating the shared one - it cascades across every
library table, and a later file that then finds exactly one location in the
instance gets its books auto-filed into it.

## Real login, not a shortcut

Auth-related tests go through the actual `POST /register` + `POST /login`
flow rather than minting a session token directly, so `AuthRoute.ts` itself
stays covered. One wrinkle: `/login` and `/register` share one rate limiter
(5 requests / 5 minutes per IP). `TRUST_PROXY=true` is forced on in tests
(unlike a real deployment, where that's only safe behind an actual reverse
proxy) so `createAuthenticatedUser()` and any test hitting `/login` or
`/register` directly can give each attempt its own `X-Forwarded-For` IP via
`nextFakeIp()` - many tests can each register+log in without ever sharing,
and so tripping, that limiter's bucket.

## Mocking external APIs

Anything that would otherwise call a real third-party service (Google
Books/Open Library ISBN metadata, Open Library cover images) goes through
[`test/helpers/fetchMock.ts`](../server/test/helpers/fetchMock.ts). Those call
sites use `fetch`, which is a global rather than a module, so there is nothing
to `mock.module()`: the stub is installed on `globalThis` for the duration of a
file and put back afterwards. That matters because `bun test` runs every file
in one process - a stub left in place would silently answer for every file that
runs later. The helpers hand back real `Response` objects, since the code under
test reads `ok`, `status`, `headers.get(...)`, `json()` and `body?.cancel()`.

`GOOGLE_BOOKS_API_KEY` is forced to an empty string in
`test/setup/preload.ts` - **unconditionally**, not just when unset
- because a leftover placeholder value in a developer's own `server/.env`
would otherwise silently flip which code path (Google Books vs. the Open
Library fallback) `BooksRoute.ts`'s ISBN lookup takes, and tests must not
depend on which machine happens to run them. With the key always empty, the
Open Library fallback path is what tests mock.

## Adding a new test file

Mirror an existing one close to what you're testing -
[`CategoriesRoute.test.ts`](../server/test/routes/CategoriesRoute.test.ts)
is the simplest full example (list/create/rename/delete plus a
shared-visibility check). Conventions worth keeping:

- One `describe` per endpoint or feature; a fresh user per test (or per
  `describe`, via `beforeAll`) rather than sharing one across unrelated
  assertions.
- Assert the *response*, not implementation details - status code and body
  shape a client would actually see.
- If a test needs several distinct accounts (e.g. checking one account sees
  what another added), call `createAuthenticatedUser()` again - it's cheap.

**A fresh account is no longer a fresh library.** There is one shared
collection per instance, and every test file runs against the same database,
so a new user inherits whatever every other test already created. Two
consequences for new tests:

- Don't assert absolute totals ("this account has 1 book"). Read the counter
  first and assert the *delta*, as `DashboardRoute.test.ts` does.
- Don't use a bare literal for anything with an instance-wide unique
  constraint - a book ISBN, or a category / author / customer-group name.
  Another file's fixture will eventually claim it and the collision will look
  like a failure in your test. Give it a run-unique suffix (see the
  `freshIsbn()` helpers in `BooksRoute.test.ts` / `ImportRoute.test.ts`).

The one thing worth testing carefully by hand is account deletion: the ten
library tables reference `users` through a nullable `created_by` with
`ON DELETE SET NULL`, and getting that wrong silently deletes the shared
library. `UserRoute.test.ts`'s "leaves the departing account's contributions
in the shared library" is the regression test for it.

## What's covered, what isn't

Covered: auth (register/login/logout/2FA), the user profile/settings/session
endpoints, categories, authors, locations (including moving stock), customers
(including groups and lending/returning), the book catalog (CRUD, search,
ISBN lookup, the stock lifecycle and loan history), the CSV import feature
(both origins, templates, duplicates, cover handling), the dashboard
aggregate, the admin account-management API including its guard rails
(`AdminUsersRoute.test.ts`) and the first-account-becomes-admin bootstrap
(`AuthRegisterBootstrap.test.ts`), and the two file-signature/ISBN-checksum
utilities.

Not yet covered - reasonable next additions, not attempted here because they
need file fixtures or push the initial suite's scope too far: cover-image
and ebook-file upload/download endpoints (`POST /book/:id/image`,
`POST /book/:id/file`, `POST /user/image`), the paginated `/loans` listing
(the `/loans/report` export used for the loan-history regression test above
*is* covered), and `activity_log`/session-management edge cases beyond the
one happy-path test each.

## Testing the client

Vitest + React Testing Library, in jsdom. No database, no server, no Postgres -
this suite is fast and runs anywhere.

```bash
cd client-react
bunx vitest run       # single run: 72 tests across 11 files
bun run test:watch
```

`bun run test` runs the same thing (`vitest run`).

Per the rewrite design, **each screen gets at least four tests**: it renders, it
shows data from a mocked query, its primary action fires the right mutation, and
its error state renders.
[`features/dashboard/DashboardScreen.test.tsx`](../client-react/src/features/dashboard/DashboardScreen.test.tsx)
is the template - copy its shape.

The one rule worth stating outright: **mock the `api/` module, never the query
hook.** Stubbing the hook would take the real cache key and the real
invalidation out of the test, which is exactly the part most likely to be wrong.
Mocking a level lower leaves both in place.

[`src/test/renderWithProviders.tsx`](../client-react/src/test/renderWithProviders.tsx)
wraps a component in a fresh `QueryClient` and the theme,
[`src/test/fixtures.ts`](../client-react/src/test/fixtures.ts) holds the shared
policy/dashboard shapes, and
[`src/test/setup.ts`](../client-react/src/test/setup.ts) is the Vitest setup file.

One file is not a screen test:
[`src/api/http.test.ts`](../client-react/src/api/http.test.ts) pins the session
rules from [AUTHENTICATION.md](AUTHENTICATION.md#what-the-client-does-when-a-session-dies) -
a 401 carrying `sessionExpired: true` hard-navigates to `/login`; any other 401,
and a 403, must not.

## Continuous integration

[`.github/workflows/test.yml`](../.github/workflows/test.yml) runs the **server**
suite on every push (any branch) and every PR into `main`, against a
throwaway `postgres:18-alpine` service container - the same image
`docker-compose.yml` runs in production, so a passing run there is a
meaningful signal, not just "the mocks agree with each other."
`docker-release.yml` calls that workflow directly to gate the image build on it.

The client suite is **not** in CI yet - run `bunx vitest run` in `client-react/`
before opening a PR that touches it.
