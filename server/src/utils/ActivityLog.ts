/**
 * Bookkeeping for `activity_log` - a generic, append-only security/audit
 * log. Only auth events are written today (see AuthRoute.ts and
 * UserRoute.ts); `entityType`/`entityId` exist so future data-change
 * logging (books, loans, ...) can reuse this same table instead of
 * growing a new one per feature.
 */
import {Pool, PoolClient} from "pg";

/**
 * Every event written to `activity_log`. The `action` DB column itself is a
 * plain VARCHAR with no CHECK constraint, so this enum is the only place the
 * vocabulary is defined.
 *
 * Two groups, deliberately kept in one enum (one table, one vocabulary, one
 * writer) but read back separately:
 *
 *  - **Auth events** - things an account did to its own session. Surfaced to
 *    that account in Settings > Recent logins via `GET /user/activity`, which
 *    filters on `AUTH_ACTIVITY_ACTIONS` below rather than duplicating the list.
 *  - **Admin events** - things an admin did to *someone else's* account from
 *    `/api/rest/admin/users` (AdminUsersRoute.ts). These carry
 *    `entity_type = 'user'` / `entity_id = <target account>`, which is exactly
 *    what those two generic columns were reserved for. They are excluded from
 *    Settings > Recent logins: that list is "what happened to my session",
 *    and an admin's actions on other people's accounts are neither auth events
 *    nor something the *target* should learn about through their own feed.
 */
export enum ActivityAction {
    LOGIN = "login",
    LOGIN_FAILED = "login_failed",
    LOGOUT = "logout",
    PASSWORD_CHANGED = "password_changed",
    USER_ENABLED = "user_enabled",
    USER_DISABLED = "user_disabled",
    USER_ROLE_CHANGED = "user_role_changed",
    USER_DELETED = "user_deleted",
}

/**
 * The subset of {@link ActivityAction} that describes the actor's *own*
 * session - what Settings > Recent logins shows (`GET /user/activity`).
 *
 * Spelled out rather than derived by excluding the admin ones, so adding a new
 * action is a conscious decision about whether a user should see it in their
 * own security feed instead of silently opting in.
 */
export const AUTH_ACTIVITY_ACTIONS: ActivityAction[] = [
    ActivityAction.LOGIN,
    ActivityAction.LOGIN_FAILED,
    ActivityAction.LOGOUT,
    ActivityAction.PASSWORD_CHANGED,
];

export interface RecordActivityOptions {
    entityType?: string | null;
    entityId?: number | null;
    metadata?: Record<string, unknown>;
}

/**
 * Append one row to `activity_log`.
 * @param db Pool or client to run the query on.
 * @param actorId The user the action is attributed to, or `null` when
 *                there isn't one yet (e.g. a failed login for a username
 *                that doesn't match any account - see `metadata` instead).
 * @param action Which event this is, e.g. `ActivityAction.LOGIN`.
 */
export async function recordActivity(
    db: Pool | PoolClient,
    actorId: number | null,
    action: ActivityAction,
    options: RecordActivityOptions = {}
): Promise<void> {
    await db.query(
        `INSERT INTO activity_log (actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [actorId, action, options.entityType ?? null, options.entityId ?? null, options.metadata ?? {}]
    );
}
