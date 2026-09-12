# Vaultisse — Server

Express + TypeScript REST API for Vaultisse, backed by PostgreSQL, run by Bun.
There is no build step to run it — Bun executes the TypeScript sources directly.
See the [repository root README](../README.md) for the full project overview,
architecture, and setup instructions covering both the client and the server.

## Quick start

```bash
bun install
cp .env.example .env   # then fill in your local values
bun run dev            # starts the API with bun --watch
```

See [Configure the server](../README.md#3-configure-the-server) in the root
README for what each environment variable does, and
[Set up the database](../README.md#2-set-up-the-database) for loading the schema.

## Scripts

- `bun run dev` — start the API in watch mode (`NODE_ENV=development`)
- `bun run start` — run the API (`bun src/index.ts`); this is what the Docker
  image's `CMD` does
- `bun test` / `bun run test:watch` — the Supertest suite, see
  [docs/TESTING.md](../docs/TESTING.md)
- `bun run build` — compile TypeScript to `dist/` with `tsc`. Only `build.sh`'s
  zip-a-dist path needs this; the Docker image has no compile stage.
- Linting and formatting are Biome, configured at the repo root: `bun run lint`
  / `bun run format` from there.

## Structure

See [Server (backend)](../README.md#server-backend) in the root README for a
breakdown of `src/routes`, `src/middlewares`, `src/types`, `src/utils`, and
`src/assets`.

## Authentication

Sessions are JWTs stored in an HTTP-only `token` cookie, verified on every
protected request by `requireAuth`/`requireAuthPage`
(`src/middlewares/AuthMiddleware.ts`) - not just the JWT signature, but also a
per-user `token_version` counter and a per-login `user_sessions` row, so a
session can actually be revoked (one device or all of them) rather than just
expiring on its own. See [docs/AUTHENTICATION.md](../docs/AUTHENTICATION.md) for the
full model, or [SECURITY.md](../SECURITY.md) for reporting auth-related
issues. Never set `ALLOW_DEV_AUTH=true` outside local development — it
bypasses login entirely.
