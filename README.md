# Vaultisse

**The easiest way to track, organize, and share all your books.**

Vaultisse is an open-source web application for managing physical book collections —
at home, in a school library, or in a small lending library. It tracks where each book
lives, who currently has it on loan, and its full catalog metadata (author, category,
language, format, cover image), and it can look books up automatically by ISBN.

- **Website:** [vaultisse.com](https://vaultisse.com)
- **Live demo (read-only):** [demo.vaultisse.com](https://demo.vaultisse.com) — log in with
  `demo@vaultisse.com` / `VaultisseDemo!2026`
- **License:** [MIT](LICENSE)

<p align="center">
  <img src="assets/screenshots/dashboard.png" alt="Vaultisse dashboard" width="80%"><br>
  <img src="assets/screenshots/library.png" alt="Vaultisse library view" width="80%">
</p>

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
  - [Client (frontend)](#client-frontend)
  - [Server (backend)](#server-backend)
  - [How they talk to each other](#how-they-talk-to-each-other)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone the repository](#1-clone-the-repository)
  - [2. Set up the database](#2-set-up-the-database)
  - [3. Configure the server](#3-configure-the-server)
  - [4. Run the server](#4-run-the-server)
  - [5. Run the client](#5-run-the-client)
- [Building for production](#building-for-production)
- [Deploying with PM2](#deploying-with-pm2)
- [Deploying with Docker](#deploying-with-docker)
- [Releasing a new version](#releasing-a-new-version)
- [Internationalization](#internationalization)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Features

- Add books manually or by typing an ISBN (auto-filled via the Google Books
  API, falling back to Open Library when no API key is configured)
- Track individual physical copies ("stock") of a book independently — each copy has
  its own status: available, booked/on loan, damaged, or not available
- Record who a book is currently lent to, using a borrower directory
- Organize books by category, author, language, and format
- Organize physical copies by shelf/location, so you always know where to find them
- Full-text search across the catalog
- A dashboard with collection counters and category shelves
- One shared library per instance: every account co-manages the same collection,
  and each row records who added it
- An admin role for managing accounts — approve, enable/disable, promote, delete
- Cookie/session-based authentication with JWT, password hashing, rate limiting, and
  secure HTTP headers out of the box

## Architecture

Vaultisse is a classic **SPA + REST API** monorepo: a React single-page app talks to
an Express/PostgreSQL backend over a JSON API. In production the backend also serves
the built frontend, so the whole app runs as a single Bun process behind one port.

```
┌──────────────────────────┐       HTTPS / cookies       ┌──────────────────────────┐
│ client-react/ (React 19) │ ──────────────────────────▶ │  server/ (Express API)   │
│ TanStack Router + Query  │ ◀────────────────────────── │  JWT auth, business      │
│ Tamagui UI, built w/Vite │      JSON over /api/rest    │  logic, PostgreSQL       │
└──────────────────────────┘                             └────────────┬─────────────┘
                                                                      │
                                                                      ▼
                                                            ┌────────────────────┐
                                                            │   PostgreSQL DB    │
                                                            └────────────────────┘
```

### Client (frontend)

Located in [`client-react/`](client-react). A React 19 single-page application built
with Vite, using TanStack Router for routing, TanStack Query for server state, and
Tamagui for the UI layer. It replaced the original Vue 3 + Vuetify client; see
[docs/CLIENT-ARCHITECTURE.md](docs/CLIENT-ARCHITECTURE.md) for the full tour and
[`client-react/README.md`](client-react/README.md) for the conventions every screen
follows.

- **`src/api/`** – one thin module per REST resource (app, book, search, author,
  category, location, customer, loans, dashboard, user, admin). Fetch wrappers only:
  no caching, no state, no React. `http.ts` is the shared request helper.
- **`src/queries/`** – the `useQuery`/`useMutation` hooks built on `api/`. Cache keys
  are declared once in `queries/keys.ts`, and this is where invalidation lives.
- **`src/routes/`** – TanStack Router file-based route modules, one per screen, under
  the authenticated `_app` layout.
- **`src/features/<domain>/`** – screen-specific components, colocated with their
  route (dashboard, search, book, locations, categories, authors, customers, loans,
  settings, admin).
- **`src/components/`** – shared presentational components: the app shell, the
  responsive dialog, the text field, screen loading/error/empty states, icons.
- **`src/theme/`** – the Tamagui config, the ported palette, and global CSS.

The client is served under the `/app` base path (see `vite.config.ts` and
`src/router.tsx`) and never talks to the database directly — everything goes
through the REST API at `/api/rest/*`.

A handful of the old client's features have working server endpoints but no UI in the
React client yet: the camera barcode scanner (typed stock codes and ISBNs work
everywhere it used to front), barcode label printing, in-browser ebook preview, the
CSV library import, and the dashboard's "books added over time" chart. The loan report
renders on screen with a CSV download instead of pushing an `.xlsx`. Each is noted in
the file that would own it.

### Server (backend)

Located in [`server/`](server). A Bun + Express + TypeScript REST API backed by
PostgreSQL. Bun runs the TypeScript sources directly — there is no compile step in
the Docker image.

- **`src/index.ts`** – process entry point; boots the singleton `AppService`.
- **`src/AppService.ts`** – the application core. Owns the Express app, the
  PostgreSQL connection pool (`pg.Pool`), configuration read from environment
  variables, the logger, and helpers for JWT sessions and password hashing
  (bcrypt). It also wires up global middleware: `helmet` (secure headers),
  `express-rate-limit` (brute-force/DoS mitigation), `cors` (restricted to the
  configured frontend origin), and cookie/body parsing.
- **`src/routes/`** – one Express router per resource, registered in `Routes.ts`
  under the `/api/rest` prefix: `AppRoute`, `BooksRoute`, `LocationRoute`,
  `CustomerRoute`, `AuthorRoute`, `CategoriesRoute`, `UserRoute`, `DashboardRoute`,
  `LoansRoute`, `import-export/ImportRoute`, and `admin/AdminUsersRoute` (mounted at
  `/admin/users` and gated by `requireAdmin` rather than `requireAuth`).
  `AuthRoute` is mounted separately at the root (`/`) and handles login, register,
  logout, and serving the built SPA in production.
- **`src/middlewares/AdminMiddleware.ts`** – `requireAdmin`, the gate on every
  `/api/rest/admin/*` route. See
  [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md#roles-and-the-admin-panel).
- **`src/middlewares/AuthMiddleware.ts`** – `requireAuth`/`requireAuthPage`
  guards. Verify the JWT stored in the `token` cookie, check the user still
  exists and isn't disabled, check the session hasn't been individually
  revoked, and silently refresh the cookie when it's close to expiry — see
  [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md). In development, setting
  `ALLOW_DEV_AUTH=true` bypasses login with a fake session — never enable
  this in production.
- **`src/types/`** – shared TypeScript interfaces (book/stock shapes, search
  filters, app error types).
- **`src/utils/Logger.ts`** – lightweight file logger (`LOGGER_PATH` env var).
- **`src/assets/`** – the standalone server-rendered `login.html` and
  `register.html` pages. The built client is *not* in here: `AuthRoute.ts`
  serves it from a sibling directory (`../../../client` in production, which is
  where the Dockerfile puts the Vite output; `client-react/dist` in
  development).

Authentication is a JWT in an httpOnly cookie, but not purely stateless:
`requireAuth` also checks a per-user `token_version` counter (bumped on
password change, invalidating every device at once) and a per-login
`user_sessions` row (so "log out this device" in Settings can revoke just
one), on every protected request. Passwords are hashed with bcrypt (12 salt
rounds) and never stored or logged in plaintext. See
[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for the full session/revocation model.

### How they talk to each other

- In **development**, Vite runs its own dev server (`bun run dev` in `client-react/`)
  and proxies `/api/rest/*`, `/login` and `/register` to the API (`VITE_API_TARGET`,
  `http://localhost:3000` by default — see `vite.config.ts`). The API runs separately
  via `bun run dev` in `server/` (`bun --watch`).
- In **production**, the client is built into static files and the Express server
  serves them directly (see `AuthRoute.ts`, which serves `index.html` for `/app` and
  `/app/*`, guarded by `requireAuth`) — there is a single process and a single port.

For deeper dives into specific parts of the codebase (not to be confused with
the in-app `/docs` help pages, which are end-user-facing), see
[docs/](docs/README.md).

## Project structure

```
vaultisse/
├── client-react/          # React 19 + Tamagui frontend (see client-react/README.md)
│   └── src/
│       ├── api/           # Thin fetch wrappers, one per REST resource
│       ├── queries/       # TanStack Query hooks; cache keys live in keys.ts
│       ├── routes/        # TanStack Router file-based route modules
│       ├── features/      # Screen-specific components, beside their route
│       ├── components/    # Shared UI components (shell, dialog, field, icons)
│       ├── theme/         # Tamagui config, palette, global CSS
│       └── test/          # Render helper, fixtures, Vitest setup
├── server/                # Express + TypeScript REST API, run by Bun
│   └── src/
│       ├── routes/        # One Express router per resource (+ admin/, import-export/)
│       ├── middlewares/   # requireAuth (JWT) and requireAdmin middleware
│       ├── types/         # Shared TypeScript types
│       ├── utils/         # Logger, etc.
│       └── assets/        # Static server-rendered login/register pages
├── assets/
│   ├── db/                # SQL schema (databaseSchema.sql) + upgrade/ (dated upgrade files)
│   └── pm2/               # Sample PM2 ecosystem config for production
├── build.sh               # Builds client + server into ./dist and zips it
└── LICENSE
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) 1.4.x — the runtime, package manager, and test runner for
  both packages. Bun executes the server's TypeScript directly, so there is no
  separate Node.js install or build step to run it.
- [PostgreSQL](https://www.postgresql.org/) 13+ (any recent version should do)
- A [Google Books API key](https://developers.google.com/books) (optional — the
  server falls back to the free [Open Library API](https://openlibrary.org/developers/api)
  if `GOOGLE_BOOKS_API_KEY` isn't set)

### 1. Clone the repository

```bash
git clone https://github.com/AlbertAmat/vaultisse.git
cd vaultisse
```

### 2. Set up the database

Create a PostgreSQL database and load the schema — `databaseSchema.sql` is always
kept up to date, so this is everything a new install needs:

```bash
createdb paperbooks
psql -d paperbooks -f assets/db/databaseSchema.sql
```

> Nothing has to be seeded by hand: `/register` is a normal, always-available page
> regardless of `ALLOW_DEV_AUTH` (see `AuthRoute.ts`), so after loading the schema you
> just start the server and register through it. **The first account to register
> becomes the instance's admin** (`users.role = 'admin'`), decided in SQL under an
> advisory lock so a race between two simultaneous registrations still produces
> exactly one — and it is created enabled even when `REGISTRATION_REQUIRES_APPROVAL`
> is on, since otherwise there would be nobody able to approve it. From there, the
> admin panel at `/app/admin` manages every account that follows.

The version-named files in `assets/db/upgrade/` (`1.0.0/1.sql`, `1.0.0/2.sql`,
...) are **not** for new installs — they're incremental upgrades for a
database that's already running an older version of the schema (see
[`assets/db/upgrade/README.md`](assets/db/upgrade/README.md) for the full
convention). Each one's header comment says what it does and confirms new
installs should skip it. If you're upgrading an existing instance instead of
setting one up fresh, apply every version's file(s) newer than whatever
version you're currently on, up through the version you're installing, in
order:

```bash
psql -d paperbooks -f assets/db/upgrade/1.0.0/1.sql   # example: apply the first v1.0.0 upgrade file
```

### 3. Configure the server

Create `server/.env` (this file is git-ignored) with:

```dotenv
API_PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=paperbooks
DB_USER=your_db_user
DB_PASSWORD=your_db_password
GOOGLE_BOOKS_API_KEY=            # optional, see Prerequisites
LOGGER_PATH=./logs.log
FRONT_END_URL=http://localhost:5173
JWT_SECRET=replace_with_a_long_random_string
SESSION_TIME=3600000             # milliseconds
ALLOW_DEV_AUTH=false             # NEVER true in production
```

Generate a strong `JWT_SECRET`, for example: `openssl rand -hex 32`.

### 4. Run the server

```bash
cd server
bun install
bun run dev      # starts the API with bun --watch on API_PORT
```

### 5. Run the client

```bash
cd client-react
bun install
bun run dev       # starts Vite; proxies /api/rest, /login and /register to the server
```

Point the proxy at a non-default API port with `VITE_API_TARGET`, e.g.
`VITE_API_TARGET=http://localhost:3010 bun run dev`.

Open the URL Vite prints (typically `http://localhost:5173/app`) in your browser.

## Building for production

From the repository root:

```bash
./build.sh
```

This installs dependencies, builds the client (Vite) and compiles the server (`tsc`),
assembles everything under `./dist` (`dist/client`, `dist/server`), copies server
assets, and produces a deployable `dist.zip`. The server serves the built client
itself, so a single process is all you need to run in production.

The Docker image is built differently and does **not** use this script: it has no
compile stage at all, because Bun runs the server's TypeScript sources directly.
See [Deploying with Docker](#deploying-with-docker).

## Deploying with PM2

A sample [PM2](https://pm2.keymetrics.io/) config is provided at
`assets/pm2/ecosystem.config.js.sample`. Copy it, fill in your production values
(database credentials, `JWT_SECRET`, `FRONT_END_URL`, etc.), and run:

```bash
cp assets/pm2/ecosystem.config.js.sample ecosystem.config.js
# edit ecosystem.config.js with your production values
pm2 start ecosystem.config.js --env production
```

## Deploying with Docker

Every push of a `vX.Y.Z` tag builds a production image and publishes it to GitHub
Container Registry at `ghcr.io/albertamat/vaultisse` (see
[Releasing a new version](#releasing-a-new-version)). The image is `oven/bun:1.4-alpine`
and bundles the server's TypeScript sources and the built client into one process, same
as the PM2 deployment above — there is no separate frontend container, and no compile
stage, since Bun runs the TypeScript directly (`bun server/src/index.ts`).

To run it on a server with Docker installed:

```bash
mkdir -p assets/db
curl -O https://raw.githubusercontent.com/AlbertAmat/vaultisse/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/AlbertAmat/vaultisse/main/.env.example
curl -o assets/db/databaseSchema.sql https://raw.githubusercontent.com/AlbertAmat/vaultisse/main/assets/db/databaseSchema.sql
cp .env.example .env
# edit .env: set JWT_SECRET, DB_PASSWORD, FRONT_END_URL, etc.
docker compose up -d
```

This starts two containers: `db` (PostgreSQL, seeded from
`assets/db/databaseSchema.sql` — the file fetched above — on first run) and `app`
(the image above). `docker-compose.yml` mounts that file by its relative path, so it
must exist at `assets/db/databaseSchema.sql` next to the compose file, not just be
present somewhere in the clone. Pin `APP_TAG` in `.env` to a specific released version
rather than `latest` if you want upgrades to be a deliberate step.

Once `app` is up, open `FRONT_END_URL` and go to `/register` to create your first
account — it's a normal, always-available page, not gated by `ALLOW_DEV_AUTH` (which
should stay `false`, see below). That first account becomes the instance's **admin**
and gets the admin panel at `/app/admin`: list accounts, approve pending
registrations, enable/disable, promote/demote, and delete. Every account after it
registers as a plain `user`. There are no library-level roles — the library is shared,
so any account that can log in can add, edit, lend and return books.

A few things worth knowing before pointing this at a real server:

- **`ALLOW_DEV_AUTH` must stay `false`.** It bypasses login with a fake session and
  exists only for local development.
- **`DB_HOST`/`DB_PORT` in `.env` are ignored for the `app` container** — it always
  connects to the `db` service on the compose network. They only configure the `db`
  container itself.
- **Logs** are written to `/app/logs` inside the container (`LOGGER_PATH`), persisted
  via the `app-logs` volume.
- To build and run the image locally instead of pulling it:
  `docker build -t vaultisse .`

To build a multi-arch image or push to a different registry, adjust
`.github/workflows/docker-release.yml`.

For step-by-step instructions covering local-only self-hosting, production behind
your own reverse proxy/DNS, production behind Cloudflare Tunnel, and a one-click
**Unraid** template (Docker tab → Add Container, no Compose needed), see
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Releasing a new version

The repository root has a `package.json` that anchors the release version (the client
and server aren't published packages and keep their own internal version fields) and
holds the shared [Biome](https://biomejs.dev/) dependency and its lint/format scripts.
To cut a release:

```bash
npm version patch   # or: minor / major
git push --follow-tags
```

`npm version` bumps `package.json`, commits it, and creates a `vX.Y.Z` git tag.
Pushing that tag triggers `.github/workflows/docker-release.yml`, which builds the
Docker image, pushes `ghcr.io/albertamat/vaultisse:X.Y.Z` and `:latest`, and creates
a matching GitHub Release with auto-generated notes.

The running app version is available at `GET /api/rest/app/version` (unauthenticated),
useful for confirming what's actually deployed.

The first time you release, open the new package under **Packages** on the GitHub repo
and set its visibility (packages default to private) so `docker pull` works without
authentication on your server.

## Internationalization

UI labels are stored in the database (`app_languages` / `app_labels` tables in
`databaseSchema.sql`), translated into English, Spanish, Catalan, and Italian, and
delivered to the client in `GET /app/policy`'s `labels` map — which keeps translations
editable without a redeploy. Each account picks its language in Settings
(`users.language`).

**The React client does not apply those labels yet.** The rewrite replaced `vue-i18n`
with a lightweight lookup that has not landed, so its UI strings are currently
hardcoded English; the language selector and the server-side plumbing are both intact
and waiting for it. See [Contributing](#contributing) for how to add a new language to
the database.

## Roadmap

Looking for ways to contribute? [docs/ROADMAP.md](docs/ROADMAP.md) lists feature ideas
that don't have anyone working on them yet — Kindle/Kobo sync, SSO, OPDS feeds,
duplicate detection, and more. It also notes which of upstream's items this fork has
already implemented.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for how to
set up your environment, coding conventions, and how to submit a pull request. All
participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please **do not** open a public issue for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for how to report them responsibly.

## License

This project is licensed under the [MIT License](LICENSE).

## Topics

books reading organization tracking lending library collection management
open-source inventory personal-library cataloging
