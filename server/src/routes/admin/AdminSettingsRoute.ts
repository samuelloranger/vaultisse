/**
 * =============================================================================
 * AdminSettingsRoute
 * =============================================================================
 * Mounted at `/api/rest/admin/settings`. The single-row `app_settings` table,
 * read and written by an admin.
 *
 * WHY THIS FILE EXISTS AT ALL. The one setting it started with - lending - used
 * to be `PATCH /user/leasing`, behind `requireAuth`. It was never a user
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
import { Router, Request, Response } from "express";
import { appService } from "../../AppService";
import { requireAdmin } from "../../middlewares/AdminMiddleware";
import { recordActivity, ActivityAction } from "../../utils/ActivityLog";
import { isValidRegion } from "../../utils/Regions";

const router = Router();

/** `entity_type` written to `activity_log` for every change made here. */
const ENTITY_TYPE = "app_settings";
/** `app_settings` has exactly one row and its id is pinned to 1 by a CHECK. */
const SETTINGS_ID = 1;

const VALID_THEMES = ["beige", "library"];

/**
 * The settings as the admin panel reads them. `registration_requires_approval`
 * is the only column that is nullable, and it is resolved here rather than
 * handed to the client raw - see {@link readSettings}.
 */
const SETTINGS_COLUMNS = `
    leasing_enabled                AS "leasingEnabled",
    registration_requires_approval AS "registrationRequiresApproval",
    default_language               AS "defaultLanguage",
    default_region                 AS "defaultRegion",
    default_theme                  AS "defaultTheme"
`;

/**
 * Whether registration is gated when nobody has set the column - the legacy
 * `.env` flag, which is what every instance upgraded from before this table
 * had these columns is still running on.
 */
export function registrationApprovalFromEnv(): boolean {
    return process.env.REGISTRATION_REQUIRES_APPROVAL === "true";
}

/**
 * Reads the row and resolves the one tri-state into the boolean the client
 * needs, plus a flag saying where that boolean came from.
 *
 * `registration_requires_approval IS NULL` means "no admin has decided yet,
 * keep obeying REGISTRATION_REQUIRES_APPROVAL". The panel needs to be able to
 * say so out loud: an admin looking at a toggle that reads "on" deserves to
 * know whether turning it off will survive the next container restart, and on
 * an instance still inheriting from the env var the honest answer is "yes,
 * from the moment you touch it". Reporting only the effective boolean would
 * hide a value the operator set somewhere this screen cannot see.
 */
async function readSettings(): Promise<Record<string, any>> {
    const pool = appService.getDatabasePool();
    const result = await pool.query(`SELECT ${SETTINGS_COLUMNS} FROM app_settings`);
    const row = result.rows[0];
    const inherited = row.registrationRequiresApproval === null;

    return {
        ...row,
        registrationRequiresApproval: inherited ? registrationApprovalFromEnv() : row.registrationRequiresApproval,
        registrationApprovalFromEnv: inherited,
    };
}

/**
 * GET /admin/settings
 * ---------------------
 * The instance settings an admin can change.
 *
 * Auth: admin required.
 *
 * Example response (200):
 *  { "leasingEnabled": false, "registrationRequiresApproval": false,
 *    "registrationApprovalFromEnv": true, "defaultLanguage": "en",
 *    "defaultRegion": "US", "defaultTheme": "beige" }
 *
 * `registrationApprovalFromEnv` is true while no admin has ever set the
 * toggle and `REGISTRATION_REQUIRES_APPROVAL` is still deciding.
 */
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
    try {
        res.status(200).json(await readSettings());
    } catch (err: any) {
        appService.getLogger().error("Error reading instance settings: " + err);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * PATCH /admin/settings
 * -----------------------
 * Change one or more instance settings. Every field is optional; at least one
 * must be present. Anything not sent is left alone.
 *
 * Auth: admin required.
 * Body: any subset of
 *  { "leasingEnabled": true,               // Loans + Customers, for everyone
 *    "registrationRequiresApproval": true, // new accounts start disabled
 *    "defaultLanguage": "es",              // must exist in app_languages
 *    "defaultRegion": "CA",                // two uppercase letters
 *    "defaultTheme": "library" }           // 'beige' | 'library'
 *
 * Example response (200): the settings, same shape as GET.
 *
 * Responses: 400 empty body or an invalid value | 401/403 see requireAdmin |
 *            500 server error.
 *
 * The four registration fields only ever describe the NEXT account to
 * register. Nothing here rewrites an existing account: someone who picked
 * their own language six months ago must not have it changed underneath them
 * because an admin set a different default today.
 */
router.patch("/", requireAdmin, async (req: Request, res: Response) => {
    const pool = appService.getDatabasePool();
    const callerId = appService.getSessionUser(req);
    const { leasingEnabled, registrationRequiresApproval, defaultLanguage, defaultRegion, defaultTheme } = req.body;

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
            return res.status(400).json({ message: "Invalid leasingEnabled" });
        }
        set("leasing_enabled", "leasingEnabled", leasingEnabled);
    }

    if (registrationRequiresApproval !== undefined) {
        if (typeof registrationRequiresApproval !== "boolean") {
            return res.status(400).json({ message: "Invalid registrationRequiresApproval" });
        }
        // Always a concrete boolean, never back to NULL: once an admin has
        // made this decision in the app, the .env flag stops being consulted
        // for good. Handing the instance back to an environment variable
        // nobody can see from here would be a setting that silently un-sets
        // itself on the next deploy.
        set("registration_requires_approval", "registrationRequiresApproval", registrationRequiresApproval);
    }

    if (defaultLanguage !== undefined) {
        if (typeof defaultLanguage !== "string" || !(await isKnownLanguage(defaultLanguage))) {
            return res.status(400).json({ message: "Invalid defaultLanguage" });
        }
        set("default_language", "defaultLanguage", defaultLanguage);
    }

    if (defaultRegion !== undefined) {
        if (!isValidRegion(defaultRegion)) {
            return res.status(400).json({ message: "Invalid defaultRegion" });
        }
        set("default_region", "defaultRegion", defaultRegion);
    }

    if (defaultTheme !== undefined) {
        if (typeof defaultTheme !== "string" || !VALID_THEMES.includes(defaultTheme)) {
            return res.status(400).json({ message: "Invalid defaultTheme" });
        }
        set("default_theme", "defaultTheme", defaultTheme);
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: "Nothing to update - send at least one setting." });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        values.push(SETTINGS_ID);
        await client.query(`UPDATE app_settings SET ${updates.join(", ")} WHERE id = $${values.length}`, values);

        // These change the app for every account on the instance, which is the
        // whole reason the write is admin-only. An instance-wide change with no
        // trace of who made it is exactly the hole this route was opened to
        // close, so it leaves one.
        await recordActivity(client, callerId, ActivityAction.INSTANCE_SETTINGS_CHANGED, {
            entityType: ENTITY_TYPE,
            entityId: SETTINGS_ID,
            metadata: { ip: req.ip, ...changed },
        });

        await client.query("COMMIT");

        res.status(200).json(await readSettings());
    } catch (err: any) {
        await client.query("ROLLBACK").catch(() => undefined);
        appService.getLogger().error("Error updating instance settings: " + err);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        client.release();
    }
});

/**
 * Whether `code` is a row in `app_languages`. Checked against the table rather
 * than a list in this file: the column carries a foreign key to it, so a value
 * this function accepted but the table did not would surface as a 500 from a
 * constraint violation instead of the 400 it is.
 */
async function isKnownLanguage(code: string): Promise<boolean> {
    const pool = appService.getDatabasePool();
    const result = await pool.query("SELECT 1 FROM app_languages WHERE code = $1", [code]);

    return result.rows.length > 0;
}

export default router;
