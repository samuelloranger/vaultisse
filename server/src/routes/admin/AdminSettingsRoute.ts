/**
 * =============================================================================
 * AdminSettingsRoute
 * =============================================================================
 * Mounted at `/api/rest/admin/settings`. The single-row `app_settings` table,
 * read and written by an admin.
 *
 * WHY THIS FILE EXISTS AT ALL. The one setting it starts with - lending - used
 * to be `PATCH /user/leasing` behind `requireAuth`. It was never a user
 * setting: it is `app_settings.leasing_enabled`, one row for the whole
 * instance, and flipping it adds or removes the Loans and Customers nav entries
 * for *every* account. Any member could change the app for everybody else, and
 * that route's own comment said gating it belonged with the admin panel. The
 * panel exists now, so the route moved here rather than growing a middleware in
 * place: living under `/user` is what made an instance setting look personal
 * every time anybody read the code.
 *
 * Every route here is behind `requireAdmin` (middlewares/AdminMiddleware.ts),
 * which answers 401 for a dead session and a plain 403 for a valid session that
 * simply is not an admin - so a logged-in member who reaches it is told no
 * rather than bounced to /login. The values themselves are NOT admin-only to
 * *read*: `leasingEnabled` still ships to every account inside GET
 * /app/policy's user object, because the nav cannot be drawn without it. Only
 * the write is gated.
 *
 * WHAT IS DELIBERATELY NOT HERE: `app_settings.is_public_institution`. It gates
 * a post-login security notice (AppRoute.ts), and the React client has no
 * dialog for that notice - it was never ported from the Vue client. A toggle
 * for it would be a control whose only possible effect is a screen that cannot
 * render, which is worse than no control: it would read as broken. It stays a
 * column with no writer until the dialog lands.
 */
import {Router, Request, Response} from "express";
import {appService} from "../../AppService";
import {requireAdmin} from "../../middlewares/AdminMiddleware";
import {recordActivity, ActivityAction} from "../../utils/ActivityLog";

const router = Router();

/** `entity_type` written to `activity_log` for every change made here. */
const ENTITY_TYPE = "app_settings";
/** `app_settings` has exactly one row and its id is pinned to 1 by a CHECK. */
const SETTINGS_ID = 1;

/** The settings as the admin panel reads them. */
const SETTINGS_COLUMNS = `
    leasing_enabled AS "leasingEnabled"
`;

async function readSettings(): Promise<Record<string, any>> {
    const pool = appService.getDatabasePool();
    const result = await pool.query(`SELECT ${SETTINGS_COLUMNS} FROM app_settings`);

    return result.rows[0];
}

/**
 * GET /admin/settings
 * ---------------------
 * The instance settings an admin can change.
 *
 * Auth: admin required.
 *
 * Example response (200): { "leasingEnabled": false }
 */
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
    try {
        res.status(200).json(await readSettings());
    } catch (err: any) {
        appService.getLogger().error("Error reading instance settings: " + err);
        res.status(500).json({message: "Internal server error"});
    }
});

/**
 * PATCH /admin/settings
 * -----------------------
 * Change one or more instance settings. Every field is optional; at least one
 * must be present. Anything not sent is left alone.
 *
 * Auth: admin required.
 * Body: { "leasingEnabled": true }  // Loans + Customers, for everyone
 *
 * Example response (200): the settings, same shape as GET.
 *
 * Responses: 400 empty body or an invalid value | 401/403 see requireAdmin |
 *            500 server error.
 */
router.patch("/", requireAdmin, async (req: Request, res: Response) => {
    const pool = appService.getDatabasePool();
    const callerId = appService.getSessionUser(req);
    const {leasingEnabled} = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    /** What actually changed, for the audit row. */
    const changed: Record<string, unknown> = {};

    function set(column: string, field: string, value: unknown): void {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
        changed[field] = value;
    }

    if (leasingEnabled !== undefined) {
        if (typeof leasingEnabled !== "boolean") {
            return res.status(400).json({message: "Invalid leasingEnabled"});
        }
        set("leasing_enabled", "leasingEnabled", leasingEnabled);
    }

    if (updates.length === 0) {
        return res.status(400).json({message: "Nothing to update - send at least one setting."});
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        values.push(SETTINGS_ID);
        await client.query(
            `UPDATE app_settings SET ${updates.join(", ")} WHERE id = $${values.length}`,
            values
        );

        // These change the app for every account on the instance, which is the
        // whole reason the write is admin-only. An instance-wide change with no
        // trace of who made it is exactly the hole this route was opened to
        // close, so it leaves one.
        await recordActivity(client, callerId, ActivityAction.INSTANCE_SETTINGS_CHANGED, {
            entityType: ENTITY_TYPE,
            entityId: SETTINGS_ID,
            metadata: {ip: req.ip, ...changed},
        });

        await client.query("COMMIT");

        res.status(200).json(await readSettings());
    } catch (err: any) {
        await client.query("ROLLBACK").catch(() => undefined);
        appService.getLogger().error("Error updating instance settings: " + err);
        res.status(500).json({message: "Internal server error"});
    } finally {
        client.release();
    }
});

export default router;
