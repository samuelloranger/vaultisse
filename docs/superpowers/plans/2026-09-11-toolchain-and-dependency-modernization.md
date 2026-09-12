# Toolchain and Dependency Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Vaultisse fork from Node/tslint/jest/Vite 7/TS 5 to Bun/Biome/`bun test`/Vite 8/TS 7, delete every dependency the platform now provides, replace the three unmaintained libraries, and take Vuetify to 4.

**Architecture:** Four phases, each independently shippable and each ending green. Phase A swaps the toolchain without changing a line of product behaviour. Phase B replaces libraries with platform or modern equivalents behind unchanged call sites. Phase C rewrites three feature integrations whose upstreams are abandoned. Phase D is a UI framework major. The order is deliberate: nothing in B, C or D is attempted until the test runner and typechecker they depend on are themselves stable.

**Tech Stack:** Bun 1.4.0, TypeScript 7.0.2, Vite 8.3.0, Biome 2.5.13, Vue 3.5, Vuetify 3.9.6 → 4.2.1, Express 4.22 → 5.2.1, PostgreSQL 18.

**Spec:** `docs/superpowers/specs/2026-09-11-shared-library-admin-mobile-design.md` covers the shared-library/admin/mobile work that precedes this plan. This plan has no separate spec — it was scoped directly by the repo owner as "Biome, Vite 8, TypeScript 7, Bun instead of Node", then extended to "update them all" across the three dependency tiers below.

## Global Constraints

- Bun **1.4.0** is the runtime. Node is removed from the Dockerfile.
- TypeScript **7.0.2** exactly. This is the native port; the package unpacks to 2.5MB vs 5.8's 22.9MB because the compiler binary ships as platform-specific optional dependencies.
- Vite **8.3.0**. `@vitejs/plugin-vue` must be **>= 6.0.8** (its peer range is the first to include `^8.0.0`).
- Biome **2.5.13**. Verified to process `.vue` files (script blocks). It does **not** lint `<template>` — accepted; nothing lints templates today either.
- Vuetify **4.2.1**. Peers: `vue ^3.5.0 || ^3.6.0-0` (satisfied by 3.5.20, no Vue upgrade needed), `vite-plugin-vuetify >= 2.1.0` (a **new** dependency — the project does not currently use it).
- `ts-jest`'s peer range is `typescript >=4.3 <7`. It can never coexist with TS 7. This is why the test runner must move before the typechecker.
- Every phase ends with: typecheck clean, full test suite green, and the app manually exercised at a 390px viewport.
- Never commit with a failing or skipped test. Never delete a test to make a phase pass — if behaviour genuinely changed, change the assertion and say so in the commit message.

## Verified Facts (do not re-litigate)

These were checked empirically before this plan was written. Trust them.

- All native and CJS server dependencies load and work under Bun 1.4.0, **including the `bcrypt` C++ addon**: hash, compare, `pg` queries, `jsonwebtoken` sign/verify, `otplib` `generateSecret`/`generateURI`/`verify`, `qrcode`, `express`, `multer`, `csv-parse` all confirmed.
- Baseline before this plan: server `npx tsc -p . --noEmit` clean, `npx jest --silent` = 12 suites / 126 tests green; client `npx vue-tsc --build` exit 0.
- Last-publish dates driving Phase C: `html5-qrcode` 2023-04-15, `epubjs` 2023-09-26, `exceljs` 2024-12-20.
- `sass-loader` is a **webpack** loader present in a Vite project. It has never done anything here.
- There are **zero** client tests. No Vitest, no Testing Library. All 126 tests are server-side.

---

# Phase A — Toolchain

Behaviour must not change in this phase. Any product-visible difference is a bug.

### Task A0: Spike — prove TypeScript 7 can compile this codebase

This gates everything. TS 7 is a reimplementation; if it rejects the existing code, the whole plan changes shape. Do this before touching any config.

**Files:**
- Create: nothing (throwaway)

**Interfaces:**
- Consumes: nothing
- Produces: a go/no-go answer recorded in the task checkbox

- [ ] **Step 1: Typecheck the server with TS 7 without installing it into the project**

```bash
cd server
bunx --bun typescript@7.0.2 tsc -p . --noEmit 2>&1 | tee /tmp/ts7-server.log | tail -40
```

Expected: either clean, or a finite list of real errors. Record the count.

- [ ] **Step 2: Typecheck the client with TS 7**

```bash
cd client
bunx --bun typescript@7.0.2 tsc -p tsconfig.json --noEmit 2>&1 | tee /tmp/ts7-client.log | tail -40
```

Note: this bypasses `vue-tsc`, so `.vue` files are not covered — it only proves the `.ts` sources compile. `vue-tsc` coverage is proven in Task A4.

- [ ] **Step 3: Decide and record**

If both are clean or the errors are few and mechanical, continue. If TS 7 rejects something structural (decorators, a tsconfig option it dropped, project references behaving differently), **stop and report** — do not work around it silently. Write the finding into this checkbox before proceeding.

---

### Task A1: Server test runner — jest → `bun test`

Must come before TS 7 on the server, because `ts-jest` blocks it.

**Files:**
- Modify: `server/package.json` (scripts, devDependencies)
- Modify: `server/test/setup/globalSetup.js`, `server/test/setup/testEnv.js`, `server/test/setup/testDbConfig.js`
- Delete: `server/jest.config.js`, `server/tsconfig.test.json` (only if unused after the move — check first)
- Modify: every file under `server/test/routes/` only if an import needs changing

**Interfaces:**
- Consumes: the existing 126 tests and their `supertest` usage
- Produces: `bun test` as the suite entry point; `bun run test` must remain the documented command so `docs/TESTING.md` and CI keep working

- [ ] **Step 1: Delete the stale compiled test artifacts first**

`server/test/**/*.js` and `*.js.map` are committed build output, already out of sync with the `.ts` sources, and `bun test` **will** pick them up as test files where jest's `testMatch` ignored them. They must go or the suite will run duplicates of old code.

```bash
cd server
git rm -r --cached 'test/**/*.js' 'test/**/*.js.map' 2>/dev/null || true
find test -name '*.js' -o -name '*.js.map' | xargs rm -f
echo 'test/**/*.js' >> .gitignore
echo 'test/**/*.js.map' >> .gitignore
```

- [ ] **Step 2: Run the suite under bun to see the real delta**

```bash
cd server
bun test 2>&1 | tail -40
```

Expected: failures. Record them. Bun implements the Jest API (`describe`/`it`/`expect`/`beforeAll`/`afterAll`) but `jest.mock`, `jest.fn`, fake timers and `globalSetup` are the usual gaps — Bun uses `mock()` from `bun:test` and a `preload` entry in `bunfig.toml` instead of `globalSetup`.

- [ ] **Step 3: Port the global setup to `bunfig.toml`**

Create `server/bunfig.toml`:

```toml
[test]
preload = ["./test/setup/preload.ts"]
```

Move whatever `jest.config.js`'s `globalSetup` did (DB creation/teardown for the test database) into `server/test/setup/preload.ts`. Read `server/test/setup/globalSetup.js` and `testDbConfig.js` first — they create and migrate a throwaway Postgres database; that logic is reused as-is, only the entry point changes.

- [ ] **Step 4: Fix the remaining failures one file at a time**

For each failing suite, the likely fixes are: `import { describe, it, expect, mock } from "bun:test"` where jest globals were implicit, and `mock()` in place of `jest.fn()`. Do not change any assertion's meaning.

- [ ] **Step 5: Run the full suite until green**

```bash
cd server && bun test 2>&1 | tail -15
```

Expected: **126 passed**. If the number is lower, tests were lost — find them. If higher, something is running twice (see Step 1).

- [ ] **Step 6: Update the scripts and drop the dependencies**

In `server/package.json`, set `"test": "bun test"`, `"test:watch": "bun test --watch"`, and remove `jest`, `ts-jest`, `@types/jest` from devDependencies.

- [ ] **Step 7: Update `docs/TESTING.md`** to say `bun test`, and note the preload/`bunfig.toml` arrangement where it currently describes `globalSetup`.

- [ ] **Step 8: Commit**

```bash
git add server/ docs/TESTING.md
git commit -m "test(server): run the suite on bun test instead of jest

ts-jest's peer range caps at typescript <7, so it can never move to
TypeScript 7. Bun's runner implements the same API and executes
TypeScript directly, removing jest, ts-jest and @types/jest.

Also deletes server/test/**/*.js — committed build output that was
already stale and that bun test would have executed as duplicate suites."
```

---

### Task A2: Server runtime — Node → Bun, and the Tier 1 deletions

**Files:**
- Modify: `server/package.json`
- Modify: `server/src/AppService.ts:107` (the `dotenv.config()` call), `server/src/index.ts:9` (the dotenv import)
- Modify: wherever `uuid` is imported (find with the command in Step 3)
- Modify: wherever `body-parser` is imported
- Modify: `server/src/**` any server-side `axios` usage

**Interfaces:**
- Consumes: A1's green `bun test`
- Produces: a server that starts with `bun run src/index.ts`; no `dotenv`, `uuid`, `body-parser`, `nodemon`, `ts-node`, or server-side `axios` in `package.json`

- [ ] **Step 1: Switch dev/start scripts**

In `server/package.json`: `"dev": "bun --watch src/index.ts"`, `"start": "bun src/index.ts"`. Remove `nodemon` and `ts-node` from devDependencies. The `build` script's fate depends on Task A5 — leave it alone for now.

- [ ] **Step 2: Remove `dotenv`**

Bun loads `.env` automatically. Delete the import in `server/src/index.ts` and the `dotenv.config()` call in `server/src/AppService.ts`. Remove `dotenv` from dependencies.

Verify the env still arrives:

```bash
cd server && bun -e 'console.log("API_PORT =", process.env.API_PORT, "| DB_PORT =", process.env.DB_PORT)'
```

Expected: `API_PORT = 3010 | DB_PORT = 5435`

- [ ] **Step 3: Remove `uuid`**

```bash
cd server && grep -rn "from ['\"]uuid['\"]\|require(['\"]uuid['\"])" src/
```

Replace each `uuidv4()` call with `crypto.randomUUID()` (Node's `crypto` is already imported in several files; use `import crypto from "crypto"` to match the existing style in `src/utils/TwoFactorAuth.ts`). Remove `uuid` from dependencies.

**Care:** `user_sessions.session_key` is a UUID that lands in the JWT's `sid` claim. `crypto.randomUUID()` produces the same v4 shape, so existing sessions stay valid — but run the auth tests specifically after this change.

- [ ] **Step 4: Remove `body-parser`**

Express has shipped `express.json()` and `express.urlencoded()` since 4.16. Replace `bodyParser.json()` with `express.json()` and `bodyParser.urlencoded({...})` with `express.urlencoded({...})`, keeping every option identical. Remove `body-parser` from dependencies.

- [ ] **Step 5: Replace server-side `axios` with `fetch`**

```bash
cd server && grep -rn "axios" src/
```

The server uses axios for the Google Books / Open Library ISBN lookups. Convert to `fetch`, preserving: the timeout behaviour, the error handling that distinguishes "not found" from "lookup failed", and any `User-Agent` header. `fetch` rejects only on network failure — a 404 resolves — so the status check must be explicit where axios would have thrown. Remove `axios` from server dependencies (the **client** keeps its own).

- [ ] **Step 6: Install, typecheck, test**

```bash
cd server && rm -rf node_modules bun.lock && bun install && bunx --bun typescript@7.0.2 tsc -p . --noEmit && bun test 2>&1 | tail -10
```

Expected: install clean, typecheck clean, **126 passed**.

- [ ] **Step 7: Boot the real server and hit it**

```bash
cd server && bun src/index.ts &
sleep 5
curl -s -o /dev/null -w "root=%{http_code}\n" http://localhost:3010/
```

Expected: `root=302` (redirect to `/login`). Kill the process afterwards.

- [ ] **Step 8: Commit**

```bash
git add server/
git commit -m "feat(server): run on Bun and drop what the platform provides

dotenv (Bun loads .env), uuid (crypto.randomUUID), body-parser (built
into Express since 4.16), server-side axios (fetch), nodemon and ts-node
(bun --watch runs TypeScript directly).

Seven dependencies removed with no behaviour change."
```

---

### Task A3: Server typechecker — TypeScript 7

**Files:**
- Modify: `server/package.json`, `server/tsconfig.json`

- [ ] **Step 1: Install TS 7**

```bash
cd server && bun add -d typescript@7.0.2
```

- [ ] **Step 2: Typecheck and fix whatever A0 predicted**

```bash
cd server && bunx tsc -p . --noEmit
```

Fix real errors. Do not add `// @ts-ignore` — `CONTRIBUTING.md` explicitly says existing ones are not a licence to add more.

- [ ] **Step 3: Test, then commit**

```bash
cd server && bun test 2>&1 | tail -6
git add server/ && git commit -m "build(server): TypeScript 7"
```

---

### Task A4: Client — Vite 8, TypeScript 7, vue-tsc 3

**Files:**
- Modify: `client/package.json`, `client/vite.config.ts`

- [ ] **Step 1: Upgrade the four packages together**

They are interlocked — `@vitejs/plugin-vue` must be >= 6.0.8 for Vite 8, and `vue-tsc` 3.x for TS 7.

```bash
cd client
bun add -d vite@8.3.0 typescript@7.0.2 vue-tsc@3.3.11 @vitejs/plugin-vue@^6.0.8
```

- [ ] **Step 2: Delete the dead and duplicate sass packages**

`sass-loader` is webpack-only and does nothing in a Vite project. `sass` and `sass-embedded` are both installed; keep `sass-embedded` (faster, and Vite prefers it when present).

```bash
cd client && bun remove sass-loader sass npm-run-all2
```

Check `package.json` scripts for `npm-run-all`/`run-p`/`run-s` usage before removing that last one; if any script uses it, rewrite the script as a plain `&&` chain first.

- [ ] **Step 3: Typecheck**

```bash
cd client && bunx vue-tsc --build
```

Expected: exit 0, no output. This is the step that proves TS 7 works through `vue-tsc` on all 64 `.vue` files — A0 only covered plain `.ts`.

- [ ] **Step 4: Build**

```bash
cd client && bunx vite build 2>&1 | tail -20
```

Expected: a successful build. Record the bundle size for comparison in Phase B Task B4.

- [ ] **Step 5: Run the dev server and exercise the app**

```bash
cd client && VITE_API_TARGET=http://localhost:3010 bunx vite --host 0.0.0.0
```

With the server running, log in as `alice` / `DevPass1!` and visit dashboard, search, a book, locations, categories, authors, customers, loans, settings. Confirm no console errors and that the barcode dialog opens.

- [ ] **Step 6: Commit**

```bash
git add client/
git commit -m "build(client): Vite 8, TypeScript 7, vue-tsc 3

Also removes sass-loader (a webpack loader that has never done anything
in this Vite project), the duplicate sass package alongside
sass-embedded, and npm-run-all2."
```

---

### Task A5: Biome replaces tslint, and Bun replaces Node in Docker

**Files:**
- Create: `biome.json` (repo root)
- Delete: `server/tslint.json`
- Modify: `server/package.json`, `client/package.json` (lint scripts)
- Modify: `Dockerfile`

- [ ] **Step 1: Add Biome at the repo root so one config covers both packages**

```bash
cd /home/samuelloranger/sites/vaultisse && bun add -d @biomejs/biome@2.5.13
bunx biome init
```

- [ ] **Step 2: Configure it**

Edit `biome.json` to include `client/src` and `server/src`, and to ignore `client/dist`, `server/dist`, `node_modules`, and `server/src/assets` (the hand-written server-rendered HTML). Match the existing code style rather than imposing Biome's defaults — the codebase uses 4-space indent and double quotes in `server/src`, tabs in `.vue` files. Set `formatter.indentStyle` accordingly, or scope overrides per glob. **Do not reformat the entire repo in this task** — a 3000-line formatting diff would bury the Phase B/C/D reviews.

- [ ] **Step 3: Lint only, no writes, and read the output**

```bash
cd /home/samuelloranger/sites/vaultisse && bunx biome lint client/src server/src 2>&1 | tail -30
```

Record the error/warning count. Fix genuine bugs it finds; suppress or disable rules that are stylistic disagreements rather than defects.

- [ ] **Step 4: Wire the scripts**

Root `package.json`: `"lint": "biome check ."`, `"lint:fix": "biome check --write ."`. Remove the `lint` script and `tslint` devDependency from `server/package.json`, and delete `server/tslint.json`.

- [ ] **Step 5: Move the Dockerfile to Bun**

`Dockerfile` currently has `ARG NODE_VERSION=22-alpine` and four `FROM node:${NODE_VERSION}` stages (client-build, server-build, server-deps, runtime). Replace with `oven/bun:1.4-alpine`. The server no longer needs a `tsc` build stage at all — Bun runs TypeScript directly — so `server-build` and `server-deps` likely collapse into one. The client still needs `vite build`.

**Watch for:** `npm ci` → `bun install --frozen-lockfile`; `bun.lock` must be copied instead of `package-lock.json`; and the runtime `CMD` becomes `bun src/index.ts`.

- [ ] **Step 6: Build the image and run it**

```bash
cd /home/samuelloranger/sites/vaultisse && docker build -t vaultisse:bun-test . 2>&1 | tail -20
```

Then run it against the dev database and confirm `/` returns 302 and `/app` serves the SPA. Record the image size versus the Node-based one.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "build: Biome replaces tslint, Bun replaces Node in Docker

tslint has been deprecated since 2019 and nothing was linting the client
at all, which is how 25 no-op Vuetify 2 attributes went unnoticed.

The runtime image drops the TypeScript build stage entirely since Bun
executes TypeScript directly."
```

---

# Phase B — Tier 3 upgrades

### Task B1: Express 4.22 → 5.2.1

**Files:**
- Modify: `server/package.json`, `server/src/index.ts`, any route file using a wildcard path or relying on 4.x error handling

- [ ] **Step 1: Read the breaking changes before touching code**

The ones that bite this codebase specifically:
- **Path syntax changed.** `AuthRoute.ts:114` registers `router.get('/app/*', ...)`. Bare `*` is no longer valid in Express 5 — it must be a named wildcard, `/app/*splat`. This route is the SPA deep-link catch-all; if it breaks, every hard refresh of `/app/<anything>` 404s. This is the single highest-risk line in Phase B.
- Rejected promises in async handlers now reach the error middleware automatically (previously they were unhandled).
- `res.status()` with an invalid code now throws.
- `req.query` is a getter and no longer writable.

- [ ] **Step 2: Upgrade**

```bash
cd server && bun add express@5.2.1 && bun add -d @types/express@^5
```

- [ ] **Step 3: Fix the wildcard route**

In `server/src/routes/AuthRoute.ts:114`, change `'/app/*'` to `'/app/*splat'`. Search for any other `*` or `:param?` patterns:

```bash
cd server && grep -rnE "router\.(get|post|put|delete|use)\(['\"][^'\"]*[*?]" src/
```

- [ ] **Step 4: Typecheck and test**

```bash
cd server && bunx tsc -p . --noEmit && bun test 2>&1 | tail -6
```

- [ ] **Step 5: Prove the deep link works — the tests may not cover it**

```bash
cd server && bun src/index.ts &
sleep 5
curl -s -o /dev/null -w "deep-link=%{http_code}\n" -b /tmp/alice.cookies http://localhost:3010/app/locations
```

Expected: `200` (the SPA shell), **not** 404. Kill the server afterwards.

- [ ] **Step 6: Commit**

---

### Task B2: `bcrypt` → `Bun.password`

Removes the only native C++ addon in the project.

**Files:**
- Modify: `server/src/AppService.ts` (the `hashPassword`/`comparePassword` helpers — `docs/AUTHENTICATION.md` names this file as where the bcrypt helpers live)
- Modify: `server/src/utils/TwoFactorAuth.ts` (backup codes are hashed "with the same bcrypt helper as passwords")
- Modify: `server/package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: the same two helper signatures, unchanged for every caller

- [ ] **Step 1: Write the failing test first**

The thing that must not break is that **existing password hashes keep working**. Every user's stored hash was produced by node `bcrypt`; if `Bun.password.verify` can't read them, everyone is locked out.

Create `server/test/utils/PasswordHashing.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { appService } from "../../src/AppService";

describe("password hashing", () => {
    // Produced by node bcrypt@6 with 12 rounds, before the Bun.password switch.
    // If this ever fails, every existing account is locked out.
    const LEGACY_NODE_BCRYPT_HASH =
        "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyKQGDrAb0Nv5S";

    it("verifies a hash produced by the old node bcrypt implementation", async () => {
        expect(await appService.comparePassword("secret", LEGACY_NODE_BCRYPT_HASH)).toBe(true);
    });

    it("rejects a wrong password against a legacy hash", async () => {
        expect(await appService.comparePassword("wrong", LEGACY_NODE_BCRYPT_HASH)).toBe(false);
    });

    it("round-trips a newly created hash", async () => {
        const hash = await appService.hashPassword("DevPass1!");
        expect(hash.startsWith("$2")).toBe(true);
        expect(await appService.comparePassword("DevPass1!", hash)).toBe(true);
        expect(await appService.comparePassword("DevPass2!", hash)).toBe(false);
    });
});
```

**Before writing any implementation**, generate a real legacy hash and paste it in place of the constant above — do not trust the literal:

```bash
cd server && bun -e 'import b from "bcrypt"; console.log(await b.hash("secret", 12))'
```

- [ ] **Step 2: Run it against the current bcrypt implementation**

```bash
cd server && bun test test/utils/PasswordHashing.test.ts
```

Expected: **PASS** — this establishes the baseline behaviour the swap must preserve.

- [ ] **Step 3: Swap the implementation**

In `server/src/AppService.ts`:

```ts
public hashPassword(plain: string): Promise<string> {
    return Bun.password.hash(plain, { algorithm: "bcrypt", cost: 12 });
}

public comparePassword(plain: string, hash: string): Promise<boolean> {
    return Bun.password.verify(plain, hash);
}
```

`Bun.password.verify` auto-detects the algorithm from the hash prefix, so `$2b$` hashes are handled without configuration.

- [ ] **Step 4: Run the same test — it must still pass**

```bash
cd server && bun test test/utils/PasswordHashing.test.ts
```

Expected: PASS, unchanged. If the legacy-hash test fails, **revert immediately** — that failure means locking out every existing account.

- [ ] **Step 5: Full suite, then remove the dependency**

```bash
cd server && bun test 2>&1 | tail -6 && bun remove bcrypt && bun remove -d @types/bcrypt
```

- [ ] **Step 6: Log in as a real user against the real database**

The test DB is seeded by the suite; this proves it against a hash written months ago by Node.

```bash
curl -s -X POST http://localhost:3010/login -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"DevPass1!"}' -w " [%{http_code}]\n"
```

Expected: `{"success":true,...}` `[200]`

- [ ] **Step 7: Commit**

---

### Task B3: `jsonwebtoken` → `jose`

**Files:**
- Modify: `server/src/AppService.ts` (JWT signing/verification), `server/src/middlewares/AuthMiddleware.ts`, `server/src/routes/AuthRoute.ts` (the pending-2FA token)
- Modify: `server/package.json`

- [ ] **Step 1: Understand what must be preserved**

Per `docs/AUTHENTICATION.md`: HS256, audience `"vaultisse"`, issuer `"vaultisse.com"`, claims `user_id`/`token_version`/`sid`/`exp`, and a **separate audience** for the 5-minute pending-2FA token so it can never be mistaken for a session token. All of that is load-bearing security behaviour and must survive verbatim.

- [ ] **Step 2: Write the failing test**

Create `server/test/utils/JwtCompat.test.ts` asserting: a token signed by the new code verifies; a token with the wrong audience is rejected; a token with the wrong issuer is rejected; an expired token is rejected; and a token signed with a different secret is rejected. Write real assertions, not placeholders — mirror the cases `AuthMiddleware.ts`'s `resolveSession` actually distinguishes.

- [ ] **Step 3: Run against the current implementation to establish the baseline** — expected PASS.

- [ ] **Step 4: Install jose and port**

```bash
cd server && bun add jose && bun remove jsonwebtoken && bun remove -d @types/jsonwebtoken
```

`jose` is async and takes a `Uint8Array` key: `new TextEncoder().encode(process.env.JWT_SECRET)`. Sign with `new SignJWT(claims).setProtectedHeader({alg:"HS256"}).setIssuer(...).setAudience(...).setExpirationTime(...).sign(key)`; verify with `jwtVerify(token, key, {issuer, audience})`, which **throws** on failure where `jsonwebtoken.verify` also threw — so the existing try/catch shape holds.

**Care:** `jwt.verify` was synchronous. Every call site becomes `await`. `resolveSession` is already async; check that no synchronous caller is left behind.

- [ ] **Step 5: Same test must pass, then full suite**

- [ ] **Step 6: Manually confirm an existing browser session still works** — a token signed by the *old* library must still verify under jose, or every logged-in user is kicked out. Use a cookie jar captured before the change.

- [ ] **Step 7: Commit**

---

### Task B4: `@mdi/font` → `@mdi/js`

Ships a ~1MB icon webfont for a countable number of icons. Direct mobile win.

**Files:**
- Modify: `client/src/plugins/vuetify.ts` (icon set registration), `client/package.json`
- Modify: every component referencing an `mdi-` string

- [ ] **Step 1: Inventory the icons actually used**

```bash
cd client && grep -rhoE "mdi-[a-z0-9-]+" src/ | sort -u | tee /tmp/mdi-used.txt | wc -l
```

- [ ] **Step 2: Switch Vuetify's icon set to `mdi-svg`**

```bash
cd client && bun add @mdi/js && bun remove @mdi/font
```

In `client/src/plugins/vuetify.ts`, change the icon config from the default `mdi` set to `mdi-svg`, importing the specific paths from `@mdi/js` and registering an alias map. Remove the `@mdi/font` CSS import.

- [ ] **Step 3: Replace every `mdi-foo` string with its imported path constant** (`mdi-chevron-down` → `mdiChevronDown`), working from the inventory in Step 1.

- [ ] **Step 4: Build and compare bundle size against the figure recorded in Task A4 Step 4**

```bash
cd client && bunx vite build 2>&1 | tail -20
```

- [ ] **Step 5: Visually verify every icon still renders** — a missed alias renders as an empty box, which typechecks fine. Walk all nine screens at 390px.

- [ ] **Step 6: Commit**

---

# Phase C — replacing unmaintained libraries

Each task here changes real behaviour and needs manual testing on a physical phone, not just an emulated viewport.

### Task C1: `html5-qrcode` → `BarcodeDetector` with a `@zxing/browser` fallback

Last upstream publish 2023-04-15. This is the phone-first headline feature, and the mobile audit found it silently swallows camera errors.

**Files:**
- Modify: `client/src/components/barcodeScanner/BarcodeScanner.vue`
- Modify: `client/package.json`

- [ ] **Step 1: Establish what the component must keep doing** — read it first. It opens a dialog, mounts a reader into `#barcode-reader`, decodes an ISBN, and emits it. The audit also flagged: the camera-failure `catch` only does `console.error`, the viewfinder is a fixed 250px that doesn't fit small screens, and there is a `setTimeout(..., 100)` race waiting for the dialog DOM plus a leftover `console.log("dd", ...)`. Fix all of those here rather than porting them forward.

- [ ] **Step 2: Feature-detect and use the native API where present**

`BarcodeDetector` is available in Chrome/Android. Safari does not support it, so the fallback is not optional.

```bash
cd client && bun add @zxing/browser && bun remove html5-qrcode
```

- [ ] **Step 3: Surface failures in the UI.** A denied permission, an insecure (non-HTTPS) origin, or no rear camera must render a `v-alert` with the reason and a retry button — not an empty dashed box.

- [ ] **Step 4: Size the viewfinder from the measured container** (`aspect-ratio: 1`, not `height: 250px`) so it fits a 320px viewport and landscape.

- [ ] **Step 5: Test on a real phone** over the LAN at `https://` or `http://localhost` — `getUserMedia` requires a secure context, so plain `http://192.168.50.30:5173` **will fail** and that failure is not a bug in your code. Note how you tested.

- [ ] **Step 6: Commit**

---

### Task C2: `exceljs` → `write-excel-file`

**Files:**
- Modify: whichever client file performs the Excel export (`grep -rn exceljs client/src/`)
- Modify: `client/package.json`

- [ ] **Step 1: Find the export path and record the exact current output** — column order, headers, date formatting, sheet name. Export a real file from the running app and keep it for comparison.
- [ ] **Step 2: Swap the library**, reproducing that output exactly.
- [ ] **Step 3: Export again and diff the two files' contents** (open both, compare headers/rows/formats). Any difference is a regression unless deliberate.
- [ ] **Step 4: Commit**

---

### Task C3: `epubjs` → `foliate-js`

**Highest-risk task in the plan.** `epubjs` has been on 0.3.x since 2023. `foliate-js` is not a drop-in — it has a different API and is distributed as ES modules without a bundled build.

**Files:**
- Modify: `client/src/views/book/compoents/BookFilePreview.vue` and `BookFilePreviewDialog.vue`
- Modify: `client/package.json`

- [ ] **Step 1: Spike before committing to it.** Prove foliate-js renders one real EPUB inside the existing dialog before touching the production component. If the spike fails or takes more than a focused session, **stop and report** — keeping `epubjs` is a legitimate outcome. It is unmaintained but functional, and a broken reader is worse than an old one.
- [ ] **Step 2 onward:** only if the spike succeeds. Preserve pagination, the fullscreen toggle, and the `min(520px, 70dvh)` sizing the mobile pass introduced.

---

# Phase D — Vuetify 3.9.6 → 4.2.1

A UI framework major across 64 components. Do this **last**, alone, and on its own branch.

### Task D1: Vuetify 4

**Files:**
- Modify: `client/package.json`, `client/vite.config.ts`, `client/src/plugins/vuetify.ts`
- Modify: potentially every `.vue` file

- [ ] **Step 1: Read the official Vuetify 4 upgrade guide and write the breaking changes that apply here into this checkbox before editing anything.** This plan deliberately does not enumerate them — they must come from the current upstream guide, not from memory.

- [ ] **Step 2: Add the new required plugin.** Vuetify 4's peers require `vite-plugin-vuetify >= 2.1.0`, which this project does not currently use at all.

```bash
cd client && bun add vuetify@4.2.1 && bun add -d vite-plugin-vuetify@^2.1.0
```

Register it in `client/vite.config.ts` alongside `@vitejs/plugin-vue`.

- [ ] **Step 3: Typecheck and work through the failures**

```bash
cd client && bunx vue-tsc --build
```

- [ ] **Step 4: Walk all nine screens at 390px and at desktop width.** The mobile pass added Vuetify-specific behaviour that must survive: `:fullscreen="smAndDown"` on 19 dialogs, the `RowActionsMenu` overflow pattern, the `mobile-breakpoint` on data tables, and phone-scoped rules in `theme.scss` that target Vuetify's internally-generated markup. That last category is the most likely to break silently — Vuetify 4 may rename the classes those rules hook into.

- [ ] **Step 5: Re-run the mobile measurements from the spec** — controls under 44px on the book view, login input font-size, dialog fullscreen behaviour — and confirm none regressed.

- [ ] **Step 6: Commit**

---

## Self-Review

**Spec coverage.** Every item the owner asked for maps to a task: Biome → A5; Vite 8 → A4; TypeScript 7 → A0/A3/A4; Bun → A1/A2/A5. Tier 1's eleven deletions → A1 (jest, ts-jest, @types/jest), A2 (dotenv, uuid, body-parser, nodemon, ts-node, server axios), A4 (sass-loader, duplicate sass, npm-run-all2), A5 (tslint). Tier 2 → C1/C2/C3. Tier 3 → B1/B2/B3/B4. Vuetify 4 → D1.

**Known gaps, stated rather than hidden.**
- Task A0 is a genuine spike with a stop condition. If TS 7 rejects something structural, Phase A's shape changes and this plan needs revision.
- Task C3 has an explicit abort path. Replacing a working EPUB reader with a harder-to-integrate one is not automatically an improvement.
- Task D1 Step 1 deliberately contains no enumerated breaking-change list. Writing one from memory would be the worst kind of placeholder — confident and wrong. It must be read from the current upstream guide at execution time.
- There are still **zero client tests**. Phases B4, C and D change client behaviour with only manual verification behind them. Adding Vitest is not in this plan because it was not asked for; it is the obvious next proposal if the owner wants these phases to be safe to repeat.

**Type consistency.** `hashPassword`/`comparePassword` keep their signatures across B2 so no call site changes. B3 changes `jwt.verify` from sync to async — flagged in the task. B4's icon aliases are the only new identifiers and they are generated from a real inventory in Step 1 rather than assumed.
