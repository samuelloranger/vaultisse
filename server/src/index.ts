/**
 * Server entry point. Loading `./AppService` runs its constructor (env vars,
 * Express app, DB pool, CSP/CORS/rate-limit middleware), and `init()` then
 * registers every route and starts the HTTP listener on `API_PORT`.
 *
 * Run with `bun start` (or `bun src/index.ts`). Bun reads `.env` itself
 * before any of this executes, so there is no dotenv call anywhere.
 */
import { appService } from "./AppService";

appService.init();
