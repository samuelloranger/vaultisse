import express, { Express, Request } from "express"; // Express framework for building APIs
import http, { Server } from "http"; // Node HTTP module to create server
import pg from "pg"; // PostgreSQL client
import { routes } from "./routes/Routes"; // Import all application routes
import { Logger } from "./utils/Logger"; // Custom logger utility
import AuthRoute from "./routes/AuthRoute"; // Auth-related routes
import cors from "cors"; // Cross-Origin Resource Sharing middleware
import cookieParser from "cookie-parser"; // Middleware to parse cookies
import jwt from "jsonwebtoken"; // JSON Web Token library for authentication
import helmet from "helmet"; // Middleware to set secure HTTP headers
import rateLimit from "express-rate-limit";
import path from "path"; // Middleware to limit repeated requests
import { blockWritesInDemo } from "./middlewares/DemoModeMiddleware"; // Rejects writes when DEMO_MODE=true
import "./types/express"; // Request.sessionId/sessionKey ambient augmentation - imported for its side effect, see that file's comment

/**
 * `GOOGLE_BOOKS_API_KEY` as the rest of the app should see it: a usable key,
 * or `undefined`.
 *
 * This was `String(process.env.GOOGLE_BOOKS_API_KEY)`, which turns an absent
 * variable into the nine-character string `"undefined"` - truthy, so it sails
 * past every `if (!apiKey)` guard and gets sent to Google as `key=undefined`,
 * which 400s. Production happened to have the variable present-but-empty,
 * which took the honest "not configured" path; a deployment that simply
 * omitted the line got the confusing one. Empty, whitespace and the literal
 * `"undefined"` all mean the same thing here: not configured.
 */
export function normalizeGoogleApiKey(raw: string | undefined): string | undefined {
    const key = raw?.trim();
    return !key || key === "undefined" ? undefined : key;
}

/**
 * The compiled client's build output.
 *
 * Deliberately a second copy of AuthRoute's `clientDistPath` rather than an
 * import: AuthRoute resolves it from `server/src/routes`, this file from
 * `server/src`, so the two are different literals for the same directory and
 * neither can be expressed in terms of the other without exporting a helper
 * across a module boundary that currently has no other reason to exist.
 */
const clientDistPath =
    process.env.NODE_ENV === "production"
        ? path.join(__dirname, "../../client")
        : path.join(__dirname, "../../client-react/dist");

/**
 * The PWA install surface, served from the client build **without a session**.
 *
 * Everything else the client ships lives under `/app`, which `requireAuthPage`
 * 302s to `/login` for an anonymous request. That gate cannot cover these
 * files:
 *
 *  - `<link rel="manifest">` is fetched with credentials *omitted* even on the
 *    same origin unless the link carries `crossorigin="use-credentials"`, and
 *    the icons the manifest names are fetched by the browser and by the OS
 *    (Android's WebAPK minting, a launcher icon refresh weeks later) outside
 *    any page context at all. A 302 to `/login` at any of those moments is an
 *    install that silently produces no icon.
 *  - `scope` is `/`, because a cold launch by a signed-out user has to land on
 *    `/login` and stay inside the standalone window. A manifest describing that
 *    scope has no business being reachable only from inside the scope's
 *    authenticated half.
 *  - `/favicon.ico` is fetched by path-guessing clients that will never see a
 *    `<link>` tag.
 *
 * None of it is private - an app icon and a name are the two things a PWA
 * publishes by design - but the allowlist is explicit rather than an
 * `express.static` of the dist root, which would also hand out `index.html`
 * and the hashed bundle under `assets/` and defeat the gate that does matter.
 *
 * Each name is published twice, at `/<name>` and at `/app/<name>`, because the
 * client's HTML cannot be relied on to ask for the first one: Vite rewrites any
 * absolute URL in index.html that resolves into `public/` to sit under `base`,
 * so a hand-written `/favicon.svg` is emitted as `/app/favicon.svg` by the
 * build and only by the build. Serving both spellings costs one `startsWith`
 * and removes a whole category of "installable in dev, inert in production".
 * They are the same bytes and the same app either way - the manifest pins
 * identity with `"id": "/"` rather than leaving it to infer one from the URL it
 * happened to be fetched from.
 */
const PUBLIC_PWA_FILES = new Set([
    "/manifest.webmanifest",
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/icon-maskable-192.png",
    "/icon-maskable-512.png",
]);

/**
 * The path within the client build for a public PWA request, or `null` if the
 * request is not one. Accepts the bare root spelling and the `/app`-prefixed
 * one the Vite build emits; see PUBLIC_PWA_FILES.
 */
export function publicPwaFile(reqPath: string): string | null {
    const bare = reqPath.startsWith("/app/") ? reqPath.slice("/app".length) : reqPath;
    return PUBLIC_PWA_FILES.has(bare) ? bare : null;
}

interface DatabaseConf {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
}

export class AppService {
    /**
     * Prefix for all API routes
     * @private
     */
    private static ROUTE_PREFIX = "/api/rest";

    /**
     * Express application instance
     * @private
     */
    private readonly m_app: Express;

    /**
     * Port on which the server runs
     * @private
     */
    private readonly m_port: number;

    /**
     * HTTP server instance
     * @private
     */
    private m_server: Server<any, any> | null;

    /**
     * Database configuration
     * @private
     */
    private readonly m_databaseConf: DatabaseConf;

    /**
     * PostgreSQL connection pool
     * @private
     */
    private readonly m_databasePool: pg.Pool;

    /**
     * Custom logger instance
     * @private
     */
    private readonly m_logger: Logger;

    /**
     * Secret key for JWT
     * @private
     */
    private readonly m_jwtSecret: string;

    /**
     * Session expiration time in seconds
     * @private
     */
    private readonly m_sessionTime: number;

    /**
     * Flag to allow development authentication
     * @private
     */
    private readonly m_allowDevAuth: boolean;

    /**
     * The google books PI key, if not present, it will use open library
     * @private
     */
    private readonly m_googleApiKey: string | undefined;

    /**
     * Max size (in MB) accepted for a library import CSV (see ImportRoute.ts),
     * configurable via MAX_IMPORT_FILE_SIZE_MB. Defaults to 10MB when unset
     * or not a valid positive number.
     * @private
     */
    private readonly m_maxImportFileSizeMb: number;

    /**
     * Application constructor
     * Initializes environment variables, database, middleware, and logging
     */
    public constructor() {
        // No dotenv call: Bun loads `.env` before any module runs, and - like
        // dotenv did - never overrides a variable already set in the real
        // environment, so Docker/CI keep winning over a stray local file.
        const frontEndUrl = String(process.env.FRONT_END_URL);

        this.m_port = Number(process.env.API_PORT); // API port

        this.m_app = express(); // Initialize Express app

        // Only trust X-Forwarded-* headers when this instance is actually
        // sitting behind a reverse proxy/tunnel (Cloudflare Tunnel, Nginx,
        // Caddy, ...). Enabling this without a real proxy in front lets any
        // client spoof its IP and bypass the rate limiters below.
        if (process.env.TRUST_PROXY === "true") {
            this.m_app.set("trust proxy", 1);
        }

        this.m_app.use(express.json()); // Parse JSON request bodies
        this.m_app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

        /*
         * Express 5 leaves `req.body` undefined when nothing parsed a body -
         * Express 4 defaulted it to `{}`. Forty-five call sites read
         * `req.body.<field>` directly, and under Express 5 a request with no
         * body at all makes every one of them throw a TypeError, which the
         * async handlers then surface as a 500 instead of the 400/404 they
         * were written to return.
         *
         * Restoring the old default here is one line against forty-five
         * guards, and it keeps "absent body" and "empty body" behaving the
         * same way, which is what every handler already assumes.
         */
        this.m_app.use((req, _res, next) => {
            if (req.body === undefined) {
                req.body = {};
            }
            next();
        });

        this.m_app.use(cookieParser()); // Parse cookies

        // Reject state-changing requests when DEMO_MODE=true - must run
        // before routes are mounted so it covers AuthRoute (at "/") too.
        this.m_app.use(blockWritesInDemo);

        // use static from compiled app in /assets/app
        this.m_app.use(express.static(path.join(__dirname, "assets", "app")));

        // Secure HTTP headers
        this.m_app.use(
            helmet({
                contentSecurityPolicy: {
                    useDefaults: true,
                    directives: {
                        defaultSrc: ["'self'"],
                        // Explicit, though `default-src` already covers it: without
                        // this directive named here, narrowing `default-src` later
                        // would block the manifest, and a blocked manifest fails
                        // *silently* - the page renders, and the app simply stops
                        // being installable with nothing in the network log to say
                        // why. (`worker-src` is deliberately absent: it falls back
                        // to `script-src`, which already allows `'self'`, so a
                        // future service worker needs no change here.)
                        manifestSrc: ["'self'"],
                        scriptSrc: ["'self'", frontEndUrl, "'unsafe-inline'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        // Login/register use Google Fonts. Scope this exception to
                        // stylesheet elements and that one stylesheet origin, so
                        // inline style attributes and arbitrary third-party CSS
                        // remain covered by the tighter style-src policy above.
                        "style-src-elem": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                        frameSrc: ["'self'", "data:", "blob:"],
                        // Book covers are either our own uploads (data: URIs) or fetched
                        // from these two ISBN metadata providers - kept in sync with the
                        // isAllowedImageUrl() allowlist in BooksRoute.ts.
                        imgSrc: [
                            "'self'",
                            "data:",
                            "https://books.google.com",
                            "http://books.google.com",
                            "https://covers.openlibrary.org",
                        ],
                        "script-src-attr": ["'unsafe-inline'"],
                        "script-src-elem": ["'unsafe-inline'", "'self'", frontEndUrl, "'unsafe-inline'"],
                    },
                },
            })
        );

        /*
         * The PWA install surface - see PUBLIC_PWA_FILES above for why these
         * eight files sit outside the session gate.
         *
         * After helmet so they still carry `X-Content-Type-Options: nosniff`,
         * and before the rate limiter so that minting a WebAPK (which fetches
         * the manifest and every icon it names in a burst) cannot eat into a
         * shared-IP household's request budget.
         *
         * No `maxAge`: the filenames are not content-hashed, so express.static's
         * default of ETag revalidation is the right trade - a conditional GET
         * per icon is a rounding error next to an icon that cannot be updated.
         */
        const pwaStatic = express.static(clientDistPath, { index: false, fallthrough: true });
        this.m_app.use((req, res, next) => {
            if (req.method !== "GET" && req.method !== "HEAD") return next();
            const file = publicPwaFile(req.path);
            if (!file) return next();
            // express.static reads req.url, so rewrite the /app-prefixed
            // spelling onto the one path that exists in the build output.
            req.url = file;
            return pwaStatic(req, res, next);
        });

        // Rate limiting to prevent brute force attacks / DDoS
        const limiter = rateLimit({
            windowMs: 10 * 60 * 1000, // 10 minutes
            max: 500, // max 300 requests per IP in the window
        });
        this.m_app.use(limiter);

        // CORS configuration to allow requests from frontend
        this.m_app.use(
            cors({
                origin: frontEndUrl,
                credentials: true,
            })
        );

        // Setup database configuration
        this.m_databaseConf = {
            host: String(process.env.DB_HOST),
            port: Number(process.env.DB_PORT),
            name: String(process.env.DB_NAME),
            user: String(process.env.DB_USER),
            password: String(process.env.DB_PASSWORD),
        };

        // Initialize PostgreSQL connection pool
        this.m_databasePool = new pg.Pool({
            host: this.m_databaseConf.host,
            port: this.m_databaseConf.port,
            database: this.m_databaseConf.name,
            user: this.m_databaseConf.user,
            password: this.m_databaseConf.password,
            max: 20, // max connections
            idleTimeoutMillis: 30000, // idle timeout
            connectionTimeoutMillis: 2000, // connection timeout
        });

        // JWT secret and session configuration
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET environment variable is required");
        }
        this.m_jwtSecret = process.env.JWT_SECRET;
        this.m_sessionTime = Number(process.env.SESSION_TIME);
        this.m_allowDevAuth = process.env.ALLOW_DEV_AUTH === "true";

        this.m_googleApiKey = normalizeGoogleApiKey(process.env.GOOGLE_BOOKS_API_KEY);

        const parsedMaxImportFileSizeMb = Number(process.env.MAX_IMPORT_FILE_SIZE_MB);
        this.m_maxImportFileSizeMb =
            Number.isFinite(parsedMaxImportFileSizeMb) && parsedMaxImportFileSizeMb > 0
                ? parsedMaxImportFileSizeMb
                : 10;

        this.m_server = null;

        // Initialize logger
        this.m_logger = new Logger(String(process.env.LOGGER_PATH));
    }

    /**
     * Initialize the API server
     */
    public init() {
        AppService.__printBanner();

        const server = http.createServer(this.m_app);

        // Load all routes into Express
        this.__loadRoutes();

        // Start listening on the configured port
        server.listen(this.m_port, () => {
            console.log(`API started at http://localhost:${this.m_port}. Date: [${new Date().toString()}]`);
        });

        this.m_server = server;

        // Once at startup, not once per lookup. `fetchBookData` used to log
        // "Missing GOOGLE_BOOKS_API_KEY" on every single ISBN scanned, which
        // buried the fact that it is a deployment step nobody took - and told
        // the operator nothing at the one moment they are reading the log.
        if (!this.m_googleApiKey) {
            const notice =
                "GOOGLE_BOOKS_API_KEY is not set - ISBN lookups will use only the BnF catalogue " +
                "and Open Library, which means no cover images and thinner metadata for most books.";
            console.warn(notice);
            this.m_logger.warn(notice);
        }

        // Log server start
        this.m_logger.info(`Server running on port ${this.m_port};`);
    }

    /** Get Express application instance */
    public getApp(): Express {
        return this.m_app;
    }

    /** Get server port */
    public getPort(): number {
        return this.m_port;
    }

    /** Get HTTP server instance */
    public getServer(): Server<any, any> | null {
        return this.m_server;
    }

    /** Get JWT secret */
    public getJwtSecret(): string {
        return this.m_jwtSecret;
    }

    /** Get the configured Google Books API key (undefined falls back to Open Library, see BooksRoute.ts). */
    public getGoogleApiKey(): string | undefined {
        return this.m_googleApiKey;
    }

    /** Max size (in MB) accepted for a library import CSV, see ImportRoute.ts and GET /app/policy. */
    public getMaxImportFileSizeMb(): number {
        return this.m_maxImportFileSizeMb;
    }

    /** Get session expiration time */
    public getSessionTime(): number {
        return this.m_sessionTime;
    }

    /** Get database connection pool */
    public getDatabasePool(): pg.Pool {
        return this.m_databasePool;
    }

    /**
     * Print the startup ASCII banner to the console.
     * @private
     */
    private static __printBanner() {
        const banner = `
██╗   ██╗ █████╗ ██╗   ██╗██╗  ████████╗██╗███████╗███████╗███████╗
██║   ██║██╔══██╗██║   ██║██║  ╚══██╔══╝██║██╔════╝██╔════╝██╔════╝
██║   ██║███████║██║   ██║██║     ██║   ██║███████╗███████╗█████╗
╚██╗ ██╔╝██╔══██║██║   ██║██║     ██║   ██║╚════██║╚════██║██╔══╝
 ╚████╔╝ ██║  ██║╚██████╔╝███████╗██║   ██║███████║███████║███████╗
  ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝   ╚═╝╚══════╝╚══════╝╚══════╝
`;
        console.log(banner);
        console.log("  This project is open source — contributions and issues welcome!");
        console.log("  https://github.com/AlbertAmat/vaultisse");
        console.log("");
    }

    /**
     * Load application routes
     * @private
     */
    private __loadRoutes() {
        console.log("");
        console.log("Routes:");

        const consoleRoutesArr = ["/"]; // Array to display registered routes

        // Root route for authentication/session handling
        this.m_app.use("/", AuthRoute);

        // Register all routes with API prefix
        for (const route in routes) {
            const fullRoute = AppService.ROUTE_PREFIX + route;
            this.m_app.use(fullRoute, routes[route]);
            consoleRoutesArr.push(fullRoute);
        }

        console.table(consoleRoutesArr); // Display routes in console
    }

    /** Get instance of logger */
    public getLogger(): Logger {
        return this.m_logger;
    }

    /** Check if development authentication is allowed */
    public allowDevAuth(): boolean {
        return this.m_allowDevAuth;
    }

    /**
     * Get user ID from session cookie
     * @param request Express request
     */
    public getSessionUser(req: Request) {
        const token = req.cookies.token;
        if (!token) {
            throw Error("No session");
        }

        let decoded: jwt.JwtPayload;
        try {
            decoded = jwt.verify(token, this.getJwtSecret(), {
                algorithms: ["HS256"],
                audience: "vaultisse",
                issuer: "vaultisse.com",
            }) as { user_id: number; exp: number };
        } catch (_err) {
            throw new Error("Error while getting session user");
        }

        return decoded.user_id;
    }

    /**
     * Create a signed JWT session token. tokenVersion must match the user's
     * current users.token_version at verification time (see requireAuth) -
     * bumping the DB column invalidates every previously issued token for
     * that user, e.g. on password change. sessionKey identifies the
     * specific `user_sessions` row this token belongs to (its `session_key`
     * column, see utils/UserSessions.ts) - carried as the `sid` claim so
     * requireAuth can look up that one session (device/IP, revocation)
     * instead of just the account as a whole.
     * @param userId
     * @param tokenVersion
     * @param sessionKey
     */
    public createSessionToken(userId: number, tokenVersion: number, sessionKey: string): string {
        return jwt.sign({ user_id: userId, token_version: tokenVersion, sid: sessionKey }, this.getJwtSecret(), {
            expiresIn: Math.floor(this.getSessionTime() / 1000),
            audience: "vaultisse",
            issuer: "vaultisse.com",
        });
    }

    /**
     * Create a short-lived pending-2FA token: proves the caller already
     * passed the password check for `userId`, but is NOT a session token -
     * it carries no `token_version` claim and uses a distinct `audience`,
     * so even if it ended up in the `token` cookie by mistake, requireAuth
     * (which checks for audience "vaultisse") would reject it. Kept in a
     * separate `pending_2fa_token` cookie, never `token` (see AuthRoute.ts).
     * @param userId
     */
    public createPending2faToken(userId: number): string {
        return jwt.sign({ user_id: userId }, this.getJwtSecret(), {
            expiresIn: 5 * 60, // 5 minutes - just long enough to type a code
            audience: "vaultisse-2fa-pending",
            issuer: "vaultisse.com",
        });
    }

    /**
     * Verifies a pending-2FA token (see `createPending2faToken`).
     * @param token
     * @returns The user id it was issued for, or `null` if missing/invalid/expired.
     */
    public verifyPending2faToken(token: string | undefined): number | null {
        if (!token) {
            return null;
        }

        try {
            const decoded = jwt.verify(token, this.getJwtSecret(), {
                algorithms: ["HS256"],
                audience: "vaultisse-2fa-pending",
                issuer: "vaultisse.com",
            }) as { user_id: number };
            return decoded.user_id;
        } catch {
            return null;
        }
    }

    /**
     * Hash a plain text password.
     *
     * Bun's own bcrypt rather than the `bcrypt` package: same algorithm, same
     * cost, same `$2b$` output, but built into the runtime - which removes the
     * project's only native addon and with it node-gyp, python3 and a C
     * toolchain from the Docker build.
     *
     * The cost stays 12 and the algorithm stays bcrypt deliberately. Argon2id
     * would be the better choice for a greenfield deployment, but every
     * password already in the database is bcrypt, and changing algorithm means
     * re-hashing on next login rather than a one-line swap.
     *
     * @param plainPassword User's password
     */
    public hashPassword(plainPassword: string): Promise<string> {
        const cost = 12; // good balance between security and speed
        return Bun.password.hash(plainPassword, { algorithm: "bcrypt", cost });
    }

    /**
     * Compare a plain text password with a hashed password.
     *
     * `Bun.password.verify` reads the algorithm from the hash prefix, so the
     * `$2b$` hashes written by the previous `bcrypt` implementation keep
     * verifying unchanged - see test/utils/PasswordHashing.test.ts, which
     * pins a hash minted before the swap.
     *
     * @param plainPassword Plain text password
     * @param hashedPassword Hashed password from DB
     */
    public async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
        return Bun.password.verify(plainPassword, hashedPassword);
    }
}

// Export singleton instance of AppService
export const appService = new AppService();
