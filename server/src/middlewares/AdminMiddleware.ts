/**
 * Express middleware gating the admin-only surface (`/api/rest/admin/*`,
 * see routes/admin/AdminUsersRoute.ts).
 *
 * It is a thin layer *on top of* the ordinary session validation, not a
 * second implementation of it: the whole JWT -> token_version ->
 * user_sessions chain is `resolveSession` from AuthMiddleware.ts, unchanged
 * and unduplicated (see docs/AUTHENTICATION.md). All this adds is one more
 * question afterwards - is this account `users.role = 'admin'`?
 *
 * The role is read from the database on every request rather than carried in
 * the JWT. A demotion has to take effect immediately, and a claim baked into
 * a token issued an hour ago would keep saying "admin" until it expired.
 *
 * Failure codes are deliberately different from each other, and one of them
 * is deliberately different from `requireAuth`:
 *
 *  - **401** `{message, sessionExpired: true}` - no session, or a session
 *    that no longer validates. Same shape and same meaning as `requireAuth`,
 *    so the client's axios interceptor (axiosInstance.ts) hard-redirects to
 *    `/login`, which is the right thing when the session really is gone.
 *    Note `requireAuth` *redirects* (302 -> /login) when there's no cookie at
 *    all; this returns the JSON 401 for that case too, since every consumer
 *    of `/api/rest/admin/*` is an XHR that can do nothing useful with an HTML
 *    login page.
 *  - **403** `{message: "Forbidden"}`, with **no** `sessionExpired` flag - a
 *    perfectly valid session belonging to a non-admin. Answering 401 here
 *    would bounce a legitimately logged-in user to `/login` and, once they
 *    logged back in, do it again: their session was never the problem. 403
 *    lets the client show "you don't have access" and stay put.
 */
import {Request, Response, NextFunction} from "express";
import {appService} from "../AppService";
import {resolveSession} from "./AuthMiddleware";

/** The value of `users.role` that unlocks the admin surface. */
export const ADMIN_ROLE = "admin";

/**
 * Looks up `users.role` for an already-validated session.
 * Returns false if the row vanished between the two queries (deleted account,
 * racing an admin's DELETE) - fail closed.
 */
export async function isAdminUser(userId: number): Promise<boolean> {
    const pool = appService.getDatabasePool();
    const result = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);

    return result.rows[0]?.role === ADMIN_ROLE;
}

/** Gate for `/api/rest/admin/*` - see this file's top comment. */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    const resolution = await resolveSession(req, res);

    if (resolution !== "ok") {
        return res.status(401).json({message: "Unauthorized", sessionExpired: true});
    }

    try {
        if (!(await isAdminUser(appService.getSessionUser(req)))) {
            return res.status(403).json({message: "Forbidden"});
        }
    } catch (err: any) {
        appService.getLogger().error("Error resolving admin role: " + err);
        return res.status(500).json({message: "Internal server error"});
    }

    next();
};
