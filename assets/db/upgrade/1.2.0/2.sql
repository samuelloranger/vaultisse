-- Upgrade to v1.2.0 (2 of 2) - schema changes made on 2026-09-11.
-- Brings an already-installed database in line with the v1.2.0 databaseSchema.sql.
-- (New installs should use databaseSchema.sql directly and skip this file.)
--
-- APPLICATION-LEVEL ADMIN ROLE.
-- Upstream has no concept of an admin: every account is equal, and the
-- REGISTRATION_REQUIRES_APPROVAL flow is documented as "flip users.disabled by
-- hand in psql" because there is nobody in the app allowed to do it. This adds
-- users.role ('admin' | 'user'), which gates the new /api/rest/admin/users
-- resource behind requireAdmin (see
-- docs/superpowers/specs/2026-09-11-shared-library-admin-mobile-design.md).
--
-- There are deliberately no library-level roles. With a single shared library
-- (see 1.sql) the application role is the only axis that exists - every account
-- that can log in can add, edit, lend and return books.
--
-- Run this AFTER 1.sql. It is independent of it in practice (different tables),
-- but the numbering is the order the upgrade README tells operators to follow.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run twice.
-- ---------------------------------------------------------------------------
-- Section 2 below promotes exactly one account, chosen by "lowest id". That is
-- a decision, not an idempotent statement: on a second pass an operator may
-- since have demoted that very account on purpose, and re-running would quietly
-- put it back. So detect the applied state up front and abort the whole
-- transaction rather than half-guard each statement.
DO $$
BEGIN
    IF EXISTS (SELECT 1
                 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'users'
                  AND column_name = 'role') THEN
        RAISE EXCEPTION
            'assets/db/upgrade/1.2.0/2.sql has already been applied to this database (users.role exists). Nothing to do.';
    END IF;
END
$$;


-- ===========================================================================
-- 1. users.role
-- ===========================================================================
-- Same shape as users.theme just above it in databaseSchema.sql: a short
-- VARCHAR pinned by a CHECK rather than a Postgres ENUM type, which would need
-- an ALTER TYPE (and a pg_dump-visible type object) every time the set changes.
--
-- DEFAULT 'user' and NOT NULL, so every existing row is backfilled as a plain
-- account by the ALTER itself and no later INSERT can leave the column empty.
-- The constraint is left to Postgres to name (users_role_check) because that is
-- exactly what the identical inline CHECK in databaseSchema.sql produces - an
-- upgraded database and a fresh install must come out byte-identical under
-- pg_dump --schema-only.
--
-- Added last, after sidebar_rail, for the same reason: ALTER TABLE ADD COLUMN
-- appends, so databaseSchema.sql declares it last too and the column order of
-- the two paths matches.
ALTER TABLE users
    ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'));


-- ===========================================================================
-- 2. Promote the founding account, so an upgraded instance has an admin.
-- ===========================================================================
-- Section 1 backfilled every existing row to 'user'. On a fresh install that is
-- right - the first account to register is promoted by POST /register itself
-- (AuthRoute.ts), race-safely, under an advisory lock.
--
-- An already-populated database has no such moment left to hook: every account
-- it will ever have may already exist. Left as-is it would come out of this
-- upgrade with zero admins, the admin panel unreachable for everybody, and the
-- only way to make one being the hand-written UPDATE this whole feature exists
-- to replace. So the upgrade has to pick someone.
--
-- Lowest id = whoever registered first = the person who stood the instance up,
-- which is the same account POST /register would have promoted had the feature
-- existed then. Picking the *newest* account, or every account, would hand
-- admin to people who never had it; picking nobody bricks the panel.
--
-- Only one account is promoted, not all of them: an admin can promote the
-- others from the panel afterwards, and that is a decision someone makes rather
-- than something a migration does silently.
--
-- No-op on an empty users table (a database that was created but never
-- registered against) - there, POST /register's bootstrap does the job instead.
UPDATE users
   SET role = 'admin'
 WHERE id = (SELECT MIN(id) FROM users);

COMMIT;
