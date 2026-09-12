/**
 * Shared connection info for the dedicated test database, used by
 * `preload.ts` to both create/schema it once per test run and to point every
 * test file's `AppService` at it. Kept in one place so the two can never
 * disagree on what database they mean.
 *
 * Host/port/user/password come from the developer's own `server/.env` -
 * reused as-is since it's already pointed at a real local Postgres (see
 * docker-compose.yml). Only the database name is overridden, so tests never
 * touch real dev/demo data. Bun loads `server/.env` itself before any code
 * runs (no dotenv call needed), and - like dotenv - never overrides a
 * variable that is already set in the real environment, so CI (see
 * .github/workflows/test.yml) still resolves correctly without an .env file.
 */
export interface ITestDbConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

export function getTestDbConfig(): ITestDbConfig {
    return {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
        database: process.env.TEST_DB_NAME || "vaultisse_test",
    };
}
