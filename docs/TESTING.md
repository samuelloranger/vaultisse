# Testing the server

Jest + Supertest integration tests for the Express/Postgres API in `server/`,
plus a few pure-function unit tests. Runs automatically on every push and PR
via [`.github/workflows/test.yml`](../.github/workflows/test.yml) - see
[Continuous integration](#continuous-integration) below.

## Contents

- [Running locally](#running-locally)
- [How a test file works](#how-a-test-file-works)
- [The dedicated test database](#the-dedicated-test-database)
- [Real login, not a shortcut](#real-login-not-a-shortcut)
- [Mocking external APIs](#mocking-external-apis)
- [Adding a new test file](#adding-a-new-test-file)
- [What's covered, what isn't](#whats-covered-what-isnt)
- [Continuous integration](#continuous-integration)

## Running locally

Needs a reachable Postgres - the same one `docker-compose up` gives you for
normal development is enough, tests use a completely separate database on it
(see below) so they never touch your dev/demo data.

```bash
cd server
npm test          # single run
npm run test:watch
```

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
  wires up one fresh `AppService` per test file (routes mounted, HTTP server
  listening on an OS-assigned free port) and tears it down in `afterAll`.
  Each test file gets its own isolated module registry (a Jest default), so
  this is safe to call once per file with zero cross-file interference.
- **`createAuthenticatedUser()`** ([`test/helpers/auth.ts`](../server/test/helpers/auth.ts))
  registers and logs in a brand-new real account and hands back a `supertest`
  agent that carries its session cookie automatically, like a logged-in
  browser tab.

## The dedicated test database

[`test/setup/globalSetup.js`](../server/test/setup/globalSetup.js) runs once
before the whole suite: it drops and recreates a `vaultisse_test` database
and loads the real schema (tables + seed data - languages, formats, i18n
labels) from [`assets/db/databaseSchema.sql`](../assets/db/databaseSchema.sql),
the same file a fresh production deploy runs. A full drop+recreate rather
than truncating tables keeps this immune to schema drift - if it ever stops
working, so would a new deployment.

Locally, connection details (host/port/user/password) are read from your own
`server/.env` - only the database name is overridden. In CI those are just
real environment variables set before Node starts (see the workflow file),
which `dotenv.config()` never overrides.

Integration tests share this one database, so `jest.config.js` sets
`maxWorkers: 1` - test *files* run serially. Each file's own tests still run
at normal speed.

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
Books/Open Library ISBN metadata, Open Library cover images) mocks `axios`
with `jest.mock("axios")`. `GOOGLE_BOOKS_API_KEY` is forced to an empty
string in `test/setup/testEnv.js` - **unconditionally**, not just when unset
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
aggregate, and the two file-signature/ISBN-checksum utilities.

Not yet covered - reasonable next additions, not attempted here because they
need file fixtures or push the initial suite's scope too far: cover-image
and ebook-file upload/download endpoints (`POST /book/:id/image`,
`POST /book/:id/file`, `POST /user/image`), the paginated `/loans` listing
(the `/loans/report` export used for the loan-history regression test above
*is* covered), and `activity_log`/session-management edge cases beyond the
one happy-path test each.

## Continuous integration

[`.github/workflows/test.yml`](../.github/workflows/test.yml) runs the whole
suite on every push (any branch) and every PR into `main`, against a
throwaway `postgres:18-alpine` service container - the same image
`docker-compose.yml` runs in production, so a passing run there is a
meaningful signal, not just "the mocks agree with each other."
