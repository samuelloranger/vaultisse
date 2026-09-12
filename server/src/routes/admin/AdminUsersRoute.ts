/**
 * =============================================================================
 * AdminUsersRoute
 * =============================================================================
 * Mounted at `/api/rest/admin/users`. Account administration for an instance:
 * list every account, approve/disable one, promote/demote it, delete it.
 *
 * Every route is behind `requireAdmin` (middlewares/AdminMiddleware.ts) - a
 * valid session that isn't `users.role = 'admin'` gets 403, not 401, so a
 * legitimately logged-in non-admin isn't bounced to `/login` for asking.
 *
 * This resource replaces the hand-written SQL that DEPLOYMENT.md used to
 * document as the only way to approve a registration
 * (`UPDATE users SET disabled = FALSE ...`).
 *
 * Three invariants are enforced *here*, in the server, not by the UI hiding
 * buttons - a hidden button is a cosmetic preference, and this is the whole
 * access-control model of the instance:
 *
 *  1. **An admin cannot demote, disable or delete themselves.** Not because it
 *     would be unsafe for the instance (rule 2 covers that) but because it is
 *     almost always a misclick, and the account doing it is the one that can't
 *     undo it afterwards.
 *  2. **The instance can never reach zero admins.** Nothing may take away the
 *     last account that is both `role = 'admin'` and enabled - that state has
 *     no in-app exit, only the psql session this feature exists to remove.
 *  3. **Losing access is immediate.** Disabling or deleting an account kills
 *     its live sessions on their very next request, rather than letting an
 *     already-issued JWT keep working until it expires.
 *
 * Attribution survives deletion: the ten library tables reference
 * `created_by ... ON DELETE SET NULL` (see assets/db/upgrade/1.2.0/1.sql), so
 * removing a member leaves the household's books exactly where they were.
 */
import {Router, Request, Response} from "express";
import {appService} from "../../AppService";
import {requireAdmin, ADMIN_ROLE} from "../../middlewares/AdminMiddleware";
import {recordActivity, ActivityAction} from "../../utils/ActivityLog";
import {AdvisoryLock} from "../../utils/AdvisoryLocks";
import {PoolClient} from "pg";

const router = Router();

const USER_ROLE = "user";
const VALID_ROLES = [ADMIN_ROLE, USER_ROLE];

/** `entity_type` written to `activity_log` for every action in this file. */
const ENTITY_TYPE = "user";

/**
 * The account shape returned to the admin panel. Deliberately enumerated
 * column by column rather than `SELECT *`: `users` also holds the bcrypt
 * password hash, the TOTP secret, and the profile image blob, none of which
 * has any business leaving the server here. (Backup codes live in their own
 * table and are never touched by this file at all.)
 */
const ACCOUNT_COLUMNS = `
    id,
    code,
    name,
    email,
    role,
    disabled,
    created_date    AS "createdDate",
    last_login_date AS "lastLoginDate"
`;

/** Shapes one account row for the client, flagging the caller's own account. */
function toAccount(row: Record<string, any>, callerId: number) {
    return {...row, isSelf: row.id === callerId};
}

interface ITargetAccount {
    id: number;
    role: string;
    disabled: boolean;
    code: string;
}

/** A refusal to report to the caller, produced by the guard rails below. */
interface IRejection {
    status: number;
    message: string;
}

/**
 * Loads the account `:id` points at and counts how many *other* accounts
 * would still be usable admins afterwards ("usable" = `role = 'admin'` and
 * not disabled - a disabled admin cannot log in, so it is not an admin the
 * instance can actually rely on).
 *
 * Must be called inside a transaction that already holds
 * `AdvisoryLock.ADMIN_SET`, which is what makes the count a decision two
 * concurrent requests can't both act on.
 */
async function loadTarget(client: PoolClient, targetId: number): Promise<{
    target: ITargetAccount | null;
    otherUsableAdmins: number;
}> {
    const targetResult = await client.query(
        "SELECT id, role, disabled, code FROM users WHERE id = $1",
        [targetId]
    );

    const adminResult = await client.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = $1 AND disabled = FALSE AND id <> $2",
        [ADMIN_ROLE, targetId]
    );

    return {
        target: targetResult.rows[0] ?? null,
        otherUsableAdmins: adminResult.rows[0].count,
    };
}

/**
 * Invalidates every live session of `userId`, the way the rest of the app
 * already does it (see docs/AUTHENTICATION.md) rather than inventing a
 * mechanism:
 *
 *  - bumping `users.token_version` makes `requireAuth` reject every JWT
 *    already issued for that account on its next request, even though the
 *    signature is still perfectly valid and the cookie hasn't expired;
 *  - revoking the `user_sessions` rows makes that visible immediately in
 *    Settings > Active sessions instead of waiting for each device to notice.
 *
 * The `token_version` bump is the part that matters for a *disabled* account:
 * `requireAuth` already refuses a disabled user, but if an admin later
 * re-enables them, the tokens they were holding at the moment of disabling
 * must not simply start working again.
 */
async function revokeAllSessions(client: PoolClient, userId: number): Promise<void> {
    await client.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [userId]);
    await client.query(
        "UPDATE user_sessions SET revoked_date = NOW() WHERE user_id = $1 AND revoked_date IS NULL",
        [userId]
    );
}

/**
 * GET /admin/users
 * ------------------
 * List every account on the instance, oldest first.
 *
 * Auth: admin required.
 *
 * Example response (200):
 *  [{ "id": 1, "code": "jdoe", "name": "Jane Doe", "email": "jane@example.com",
 *     "role": "admin", "disabled": false,
 *     "createdDate": "2026-09-01T10:00:00.000Z",
 *     "lastLoginDate": "2026-09-11T08:12:00.000Z", "isSelf": true }]
 *
 * `isSelf` is included so the panel can grey out the actions the server would
 * refuse anyway (see this file's invariant 1) - the policy payload doesn't
 * expose the caller's user id, and it shouldn't need to.
 *
 * Never returns `password`, `totp_secret` or anything else secret - see
 * ACCOUNT_COLUMNS.
 */
router.get("/", requireAdmin, async (req: Request, res: Response) => {
    const pool = appService.getDatabasePool();
    const callerId = appService.getSessionUser(req);

    try {
        const result = await pool.query(`SELECT ${ACCOUNT_COLUMNS} FROM users ORDER BY id`);

        res.status(200).json(result.rows.map((row) => toAccount(row, callerId)));
    } catch (err: any) {
        appService.getLogger().error("Error listing accounts: " + err);
        res.status(500).json({message: "Internal server error"});
    }
});

/**
 * PATCH /admin/users/:id
 * ------------------------
 * Enable/disable an account and/or change its role. Both fields are optional;
 * at least one must be present. Anything not sent is left alone.
 *
 * Enabling is how a registration gets approved when
 * `REGISTRATION_REQUIRES_APPROVAL=true` - that account exists with
 * `disabled = TRUE` and simply can't authenticate until this flips it.
 *
 * Disabling immediately kills the account's live sessions (see
 * `revokeAllSessions`): a disabled user holding a valid cookie stops working
 * on their very next request, not when their JWT eventually expires.
 *
 * Auth: admin required.
 * Body: { "disabled": true } | { "role": "admin" } | both.
 *
 * Example response (200): the updated account, same shape as GET.
 *
 * Responses: 400 invalid id/body | 403 refused by a guard rail (demoting or
 *            disabling yourself, or removing the last usable admin) |
 *            404 no such account | 500 server error.
 */
router.patch("/:id", requireAdmin, async (req: Request, res: Response) => {
    const pool = appService.getDatabasePool();
    const callerId = appService.getSessionUser(req);
    const targetId = Number(req.params.id);
    const {role, disabled} = req.body;

    if (!Number.isInteger(targetId)) {
        return res.status(400).json({message: "Invalid account id"});
    }
    if (role === undefined && disabled === undefined) {
        return res.status(400).json({message: "Nothing to update - send `role` and/or `disabled`."});
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
        return res.status(400).json({message: "Invalid role"});
    }
    if (disabled !== undefined && typeof disabled !== "boolean") {
        return res.status(400).json({message: "Invalid disabled"});
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        // Taken first, before reading anything: the guard rails below are a
        // count-then-decide, which two concurrent requests would otherwise
        // both pass. See utils/AdvisoryLocks.ts.
        await client.query("SELECT pg_advisory_xact_lock($1)", [AdvisoryLock.ADMIN_SET]);

        const {target, otherUsableAdmins} = await loadTarget(client, targetId);

        if (!target) {
            await client.query("ROLLBACK");
            return res.status(404).json({message: "Account not found"});
        }

        const nextRole: string = role ?? target.role;
        const nextDisabled: boolean = disabled ?? target.disabled;
        const wasUsableAdmin = target.role === ADMIN_ROLE && !target.disabled;
        const willBeUsableAdmin = nextRole === ADMIN_ROLE && !nextDisabled;

        let rejection: IRejection | null = null;

        // Checked before the self-rule, so the "last admin" case reports what
        // actually makes it impossible. When there IS only one admin, they're
        // necessarily the caller, and this message is the useful one.
        if (wasUsableAdmin && !willBeUsableAdmin && otherUsableAdmins === 0) {
            rejection = {
                status: 403,
                message: "This is the only administrator left - promote another account first."
            };
        } else if (targetId === callerId && nextRole !== target.role) {
            rejection = {status: 403, message: "You cannot change your own role."};
        } else if (targetId === callerId && nextDisabled && !target.disabled) {
            rejection = {status: 403, message: "You cannot disable your own account."};
        }

        if (rejection) {
            await client.query("ROLLBACK");
            return res.status(rejection.status).json({message: rejection.message});
        }

        const updated = await client.query(
            `UPDATE users SET role = $1, disabled = $2 WHERE id = $3 RETURNING ${ACCOUNT_COLUMNS}`,
            [nextRole, nextDisabled, targetId]
        );

        // Only on the transition into disabled - re-disabling an already
        // disabled account has no sessions to kill, and bumping token_version
        // again would be noise in an audit of that column.
        if (nextDisabled && !target.disabled) {
            await revokeAllSessions(client, targetId);
        }

        if (nextRole !== target.role) {
            await recordActivity(client, callerId, ActivityAction.USER_ROLE_CHANGED, {
                entityType: ENTITY_TYPE,
                entityId: targetId,
                metadata: {ip: req.ip, targetCode: target.code, from: target.role, to: nextRole}
            });
        }

        if (nextDisabled !== target.disabled) {
            await recordActivity(
                client,
                callerId,
                nextDisabled ? ActivityAction.USER_DISABLED : ActivityAction.USER_ENABLED,
                {
                    entityType: ENTITY_TYPE,
                    entityId: targetId,
                    metadata: {ip: req.ip, targetCode: target.code}
                }
            );
        }

        await client.query("COMMIT");

        res.status(200).json(toAccount(updated.rows[0], callerId));
    } catch (err: any) {
        await client.query("ROLLBACK").catch(() => undefined);
        appService.getLogger().error("Error updating account: " + err);
        res.status(500).json({message: "Internal server error"});
    } finally {
        client.release();
    }
});

/**
 * DELETE /admin/users/:id
 * -------------------------
 * Permanently delete an account.
 *
 * What it does NOT delete: anything that account contributed to the shared
 * library. All ten library foreign keys are `created_by ... ON DELETE SET
 * NULL`, so the books, stocks, files and loan history stay exactly where they
 * were and simply lose their "added by" attribution. `user_sessions` and
 * `user_backup_codes` DO cascade - those are genuinely per-account - and
 * `activity_log.actor_id` is set to NULL so the audit trail outlives the
 * account it describes.
 *
 * The deleted account's sessions die on their next request for free:
 * `requireAuth` looks the user up by id and finds nothing.
 *
 * Auth: admin required.
 *
 * Responses: 200 {"message": "Account deleted"} | 400 invalid id |
 *            403 refused by a guard rail (yourself, or the last usable admin) |
 *            404 no such account | 500 server error.
 */
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
    const pool = appService.getDatabasePool();
    const callerId = appService.getSessionUser(req);
    const targetId = Number(req.params.id);

    if (!Number.isInteger(targetId)) {
        return res.status(400).json({message: "Invalid account id"});
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1)", [AdvisoryLock.ADMIN_SET]);

        const {target, otherUsableAdmins} = await loadTarget(client, targetId);

        if (!target) {
            await client.query("ROLLBACK");
            return res.status(404).json({message: "Account not found"});
        }

        let rejection: IRejection | null = null;

        if (target.role === ADMIN_ROLE && !target.disabled && otherUsableAdmins === 0) {
            rejection = {
                status: 403,
                message: "This is the only administrator left - promote another account first."
            };
        } else if (targetId === callerId) {
            rejection = {
                status: 403,
                message: "You cannot delete your own account here - use Settings > Delete account."
            };
        }

        if (rejection) {
            await client.query("ROLLBACK");
            return res.status(rejection.status).json({message: rejection.message});
        }

        await client.query("DELETE FROM users WHERE id = $1", [targetId]);

        // Written after the row is gone, and carrying the account's code in
        // metadata: entity_id will shortly point at an id that no longer
        // resolves to anything (activity_log is generic - there is no FK on
        // entity_id), so the code is what keeps the entry readable later.
        await recordActivity(client, callerId, ActivityAction.USER_DELETED, {
            entityType: ENTITY_TYPE,
            entityId: targetId,
            metadata: {ip: req.ip, targetCode: target.code}
        });

        await client.query("COMMIT");

        res.status(200).json({message: "Account deleted"});
    } catch (err: any) {
        await client.query("ROLLBACK").catch(() => undefined);
        appService.getLogger().error("Error deleting account: " + err);
        res.status(500).json({message: "Internal server error"});
    } finally {
        client.release();
    }
});

export default router;
