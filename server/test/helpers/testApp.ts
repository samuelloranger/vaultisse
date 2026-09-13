/**
 * Wires up the `AppService` (routes mounted, HTTP server listening on an
 * OS-assigned free port per `API_PORT=0` - see test/setup/preload.ts) for a
 * test file.
 *
 * Under Jest each test file got its own module registry, so every file
 * constructed - and tore down - its own `appService`, server and pg pool.
 * `bun test` runs the whole suite in ONE process with ONE module graph, so
 * all files share the single `appService` singleton: initialising per file
 * would stack a second copy of every route and start a second listener, and
 * the first file's teardown would `pool.end()` the pool every later file
 * still needs. Hence init-once here, and a single teardown at the very end of
 * the run, driven by `afterAll` in the preload (test/setup/preload.ts).
 *
 * Usage: `const app = setupTestApp();` at the top of a describe block, then
 * `request(app).get(...)` as usual.
 */
// Imported explicitly rather than relied on as globals: bun only injects
// the test globals into test files, not into the modules they import.
import { beforeAll } from "bun:test";
import { Express } from "express";
import { appService } from "../../src/AppService";

let initialized = false;

export function setupTestApp(): Express {
    beforeAll(() => {
        if (initialized) {
            return;
        }
        appService.init();
        initialized = true;
    });

    return appService.getApp();
}

/**
 * Closes the shared HTTP server and pg pool. Called once, after every test
 * file has run, from the preload's global `afterAll`.
 */
export async function teardownTestApp(): Promise<void> {
    if (!initialized) {
        return;
    }
    initialized = false;

    await new Promise<void>((resolve) => appService.getServer()?.close(() => resolve()));
    await appService.getDatabasePool().end();
}
