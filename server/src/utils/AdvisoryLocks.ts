/**
 * Postgres advisory-lock keys, all declared here so two features can never
 * pick the same number by accident (the keys are a single flat namespace for
 * the whole database - Postgres has no idea what any of them mean).
 *
 * These are all taken with `pg_advisory_xact_lock`, i.e. held by a
 * transaction and released automatically when it commits or rolls back -
 * never `pg_advisory_lock`, which leaks a lock into the pooled connection if
 * anything throws before the matching unlock.
 *
 * Why advisory locks at all: both cases below are "count some rows, then
 * decide" invariants, and row locks can't protect a count of rows that don't
 * exist yet (`REGISTRATION_BOOTSTRAP`) or that aren't the rows being written
 * (`ADMIN_SET`). Under READ COMMITTED, two concurrent transactions each read
 * a snapshot taken before the other's write and both conclude they're allowed
 * to proceed. Serializing the whole decision is the simple, obviously-correct
 * fix.
 *
 * Deadlock safety: each transaction takes at most ONE of these, as its first
 * statement, before touching any row. There is no ordering between them to
 * get wrong, and no transaction holds a row lock while waiting for one.
 */
export enum AdvisoryLock {
    /**
     * "Is this the very first account on the instance?" - POST /register
     * (AuthRoute.ts). Without it, two simultaneous first registrations each
     * see an empty `users` table (neither sees the other's uncommitted row)
     * and both become admin.
     */
    REGISTRATION_BOOTSTRAP = 4210001,

    /**
     * "Would this leave the instance with zero admins?" - the mutations in
     * routes/admin/AdminUsersRoute.ts. Without it, two admins demoting each
     * other at the same moment each count the other as the remaining admin,
     * and the instance ends up with none.
     */
    ADMIN_SET = 4210002,
}
