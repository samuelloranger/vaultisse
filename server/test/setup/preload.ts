/**
 * `bun test` preload (wired up in `server/bunfig.toml`). Bun has no
 * `globalSetup`/`setupFiles` split like Jest had, so this single module does
 * both jobs, in order, before any test file - and therefore before
 * `AppService`'s constructor, which reads these same variables - is imported:
 *
 *  1. Point the app at the dedicated test database and force every behavior
 *     flag to a deterministic value, regardless of what the developer's own
 *     `server/.env` (or CI's real environment) happens to have set for local
 *     development. This was `test/setup/testEnv.js` under Jest.
 *  2. Drop and recreate that database from scratch, then load the real schema
 *     (including its seed data - languages, formats, i18n labels) from
 *     `assets/db/databaseSchema.sql`, the same file a fresh production deploy
 *     runs. This was `test/setup/globalSetup.js` under Jest.
 *
 * A full drop+recreate per run (rather than truncating tables) keeps this
 * immune to schema drift between runs and matches how a fresh install
 * actually gets its database - if this ever stops working, so would a new
 * deployment.
 *
 * TRUST_PROXY=true is deliberate here (unlike real deployments, where it's
 * only safe behind an actual reverse proxy): it lets `test/helpers/auth.ts`
 * give each login/register pair its own `X-Forwarded-For` IP, so many tests
 * can each get a fresh bucket against the shared authLimiter (5 req/5min per
 * IP) instead of tripping it after a handful of auth-related tests.
 */
import {afterAll} from "bun:test";
import fs from "fs";
import path from "path";
import {Client} from "pg";
import {getTestDbConfig} from "./testDbConfig";

const dbConfig = getTestDbConfig();

process.env.DB_HOST = String(dbConfig.host);
process.env.DB_PORT = String(dbConfig.port);
process.env.DB_USER = String(dbConfig.user);
process.env.DB_PASSWORD = String(dbConfig.password);
process.env.DB_NAME = dbConfig.database;

process.env.ALLOW_DEV_AUTH = "false";
process.env.DEMO_MODE = "false";
process.env.REGISTRATION_REQUIRES_APPROVAL = "false";
process.env.TRUST_PROXY = "true";
process.env.API_PORT = "0"; // OS-assigned free port - many test files run their own server.
process.env.LOGGER_PATH = path.join(__dirname, "..", ".tmp", "logs");
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-only-secret-do-not-use-in-production";
process.env.SESSION_TIME = process.env.SESSION_TIME || String(60 * 60 * 1000);
process.env.FRONT_END_URL = process.env.FRONT_END_URL || "http://localhost:5173";
// Unconditional (not `||`-defaulted): a placeholder value some developers
// leave in their own server/.env (e.g. "npm") would otherwise leak in here
// and silently flip which branch (Google Books vs. the Open Library
// fallback) BooksRoute.ts's ISBN lookup takes between machines/CI - tests
// mock both branches explicitly (see BooksRoute.test.ts) and must not
// depend on which one actually runs.
process.env.GOOGLE_BOOKS_API_KEY = "";
process.env.MAX_IMPORT_FILE_SIZE_MB = process.env.MAX_IMPORT_FILE_SIZE_MB || "10";
process.env.MAX_EBOOK_FILE_SIZE_MB = process.env.MAX_EBOOK_FILE_SIZE_MB || "10";
process.env.DEBUG_LOGGING = "false";

const admin = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: "postgres",
});
await admin.connect();

// In case a previous run's server process didn't shut down cleanly and
// left connections open - DROP DATABASE fails while any exist.
await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [dbConfig.database]
);
await admin.query(`DROP DATABASE IF EXISTS "${dbConfig.database}"`);
await admin.query(`CREATE DATABASE "${dbConfig.database}"`);
await admin.end();

const schemaPath = path.join(__dirname, "..", "..", "..", "assets", "db", "databaseSchema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf-8");

const db = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
});
await db.connect();
await db.query(schemaSql);
await db.end();

/**
 * Jest ran each test file in its own module registry, so every file both
 * created and tore down its own `appService`. `bun test` shares one module
 * graph across the whole run, so the shared server/pool must be closed once,
 * after the last file - which is what a preload-level `afterAll` does (it is
 * global, not per-file). The import is dynamic on purpose: a static one is
 * hoisted above the `process.env` assignments above and would construct
 * `AppService` - and its pg pool - pointed at the developer's real database.
 */
afterAll(async () => {
    const {teardownTestApp} = await import("../helpers/testApp");
    await teardownTestApp();
});
