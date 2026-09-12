/**
 * Express middleware that gates every authenticated route.
 *
 * Flow: read the `token` httpOnly cookie -> verify its JWT signature/claims
 * -> look up the user and compare `token_version` (a DB counter bumped on
 * password change, so old tokens can be revoked even though JWTs are
 * otherwise stateless) -> look up the specific `user_sessions` row the
 * token's `sid` claim identifies and reject if it's been individually
 * revoked (see "Log out this device" in Settings) -> if valid and about to
 * expire, silently reissue a fresh cookie -> call `next()`.
 *
 * In development (`ALLOW_DEV_AUTH=true`), it skips real auth entirely and
 * fakes a session for user id 1 - never enable this in production. The fake
 * token's `sid` is a sentinel that never matches a real `user_sessions` row
 * (there was never a real login to create one), so the per-session check
 * below is skipped for it too.
 *
 * Two variants share this same resolution logic (see `resolveSession`),
 * differing only in how they fail:
 *  - `requireAuth` - for `/api/rest/*` JSON endpoints. Usage:
 *    `router.get('/foo', requireAuth, handler)`. Failure responses: 401
 *    `{message: "Unauthorized", sessionExpired: true}` (missing/invalid/
 *    expired/revoked token) - `sessionExpired` is what the client's axios
 *    interceptor (axiosInstance.ts) keys off of to redirect to `/login`,
 *    as opposed to a 401 from actual in-page logic (a wrong current
 *    password, say) that has no reason to force a redirect.
 *  - `requireAuthPage` - for the server-rendered `/app` and `/app/*` HTML
 *    routes (AuthRoute.ts). Failure: redirects to `/login` either way,
 *    since there's no SPA yet on screen to show a JSON error in.
 */
import {Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";
import {appService} from "../AppService";

/** Sentinel `sid` for the fake ALLOW_DEV_AUTH token - never matches a real `user_sessions` row. Exported so handlers reissuing a token (e.g. password change) can fall back to it when `req.sessionKey` is unset. */
export const DEV_SESSION_KEY = "dev";

export type SessionResolution = "ok" | "no-token" | "unauthorized";

/**
 * Does the actual work: resolves (and, on success, attaches to `req`/
 * refreshes the cookie on) the caller's session, without deciding how a
 * failure should be reported - that's each exported middleware's job.
 *
 * Exported so other gates can be layered on top of the *same* validation
 * (see `requireAdmin` in AdminMiddleware.ts, which needs a valid session but
 * fails differently from both variants below). Nothing outside this file
 * should re-derive a session from the cookie by hand.
 */
export async function resolveSession(req: Request, res: Response): Promise<SessionResolution> {
    const pool = appService.getDatabasePool();

    // only development
    if (appService.allowDevAuth()) {
        appService.getLogger().info("Serving DEVELOPMENT token")

        // Look up the real current token_version for the fake user so the
        // check below (identical for dev and real tokens) accepts it.
        const devUser = await pool.query(
            "SELECT token_version FROM users WHERE id = 1 AND disabled = FALSE"
        );
        const devTokenVersion = devUser.rows[0]?.token_version ?? 0;

        // Fake decoded token for dev
        req.cookies.token = appService.createSessionToken(1, devTokenVersion, DEV_SESSION_KEY); // fake user ID
    }

    const token = req.cookies.token;
    if (!token) {
        return "no-token";
    }

    let decoded: jwt.JwtPayload;
    try {
        decoded = jwt.verify(token, appService.getJwtSecret(), {
            algorithms: ["HS256"],
            audience: "vaultisse",
            issuer: "vaultisse.com"
        }) as { user_id: number; token_version: number; sid: string; exp: number };
    } catch (err: any) {
        appService.getLogger().error(err.toString());
        return "unauthorized";
    }

    /*
     * One round trip, not two. Validating a session needs both the account
     * (does it exist, is it disabled, does token_version still match) and the
     * session row (does this specific login still exist un-revoked) - and
     * every authenticated request pays for it, so they are fetched together.
     *
     * LEFT JOIN rather than INNER: the two failures have to stay
     * distinguishable. No rows means no such account, or a disabled one. One
     * row with a null session_id means the account is fine but this
     * particular login was revoked - which is the case the dev sentinel below
     * is allowed to skip, and an inner join would have collapsed the two into
     * the same empty result.
     */
    const result = await pool.query({
        name: "session-prep-stmt",
        text: `SELECT u.id,
                      u.token_version,
                      s.id AS session_id
               FROM users u
               LEFT JOIN user_sessions s
                      ON s.session_key = $2
                     AND s.user_id = u.id
                     AND s.revoked_date IS NULL
               WHERE u.id = $1 AND u.disabled = FALSE`,
        values: [decoded.user_id, decoded.sid]
    });

    if (result.rowCount === 0) {
        return "unauthorized";
    }

    const currentTokenVersion = result.rows[0].token_version;

    // Tokens issued before a password change (or any other event that bumps
    // token_version) no longer match - reject them even though the JWT
    // signature itself is still valid. This is what makes logout-elsewhere /
    // password-change session revocation possible with stateless JWTs.
    if (decoded.token_version !== currentTokenVersion) {
        return "unauthorized";
    }

    if (decoded.sid !== DEV_SESSION_KEY) {
        const sessionId = result.rows[0].session_id;

        // The join found no live row for this sid: logged out from this
        // device, or revoked wholesale by a password change.
        if (sessionId === null || sessionId === undefined) {
            return "unauthorized";
        }

        req.sessionId = sessionId;
        req.sessionKey = decoded.sid;

        // Best-effort and throttled (only writes once the row is more than
        // a minute stale) - keeps "Active sessions" reasonably fresh
        // without a DB write on every single authenticated request.
        pool.query(
            "UPDATE user_sessions SET last_seen_date = NOW() WHERE id = $1 AND last_seen_date < NOW() - INTERVAL '1 minute'",
            [req.sessionId]
        ).catch((err) => appService.getLogger().error("Error updating session last_seen_date: " + err));
    }

    // Check if token is near expiry (e.g., less than 5 minutes left)
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = (decoded.exp ?? 0) - now;

    if (timeLeft < 5 * 60) {
        // Issue new token with extended expiration
        const newToken = appService.createSessionToken(decoded.user_id, currentTokenVersion, decoded.sid);

        res.cookie("token", newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: appService.getSessionTime()
        });
    }

    return "ok";
}

/** Gate for `/api/rest/*` JSON endpoints - see this file's top comment. */
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const resolution = await resolveSession(req, res);

    if (resolution === "no-token") {
        return res.redirect("/login");
    }
    if (resolution === "unauthorized") {
        return res.status(401).json({message: "Unauthorized", sessionExpired: true});
    }

    next();
};

/** Gate for the server-rendered `/app`/`/app/*` HTML routes - see this file's top comment. */
export const requireAuthPage = async (req: Request, res: Response, next: NextFunction) => {
    const resolution = await resolveSession(req, res);

    if (resolution === "no-token" || resolution === "unauthorized") {
        return res.redirect("/login");
    }

    next();
};
