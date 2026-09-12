-- Upgrade to v1.3.0 (1 of 1) - schema changes made on 2026-09-12.
-- Brings an already-installed database in line with the v1.3.0 databaseSchema.sql.
-- (New installs should use databaseSchema.sql directly and skip this file.)
--
-- WHY THIS IS 1.3.0 AND NOT A THIRD FILE UNDER 1.2.0, where the table it alters
-- was created: 1.2.0 has shipped and been applied. Applying is manual and
-- per-file - there is no runner recording what ran, so the instruction in
-- upgrade/README.md is "skip any file whose changes your database already has".
-- An operator who has finished 1.2.0 will never look inside that folder again,
-- so a file added to it after the fact is a file nobody runs.
--
-- REGISTRATION DEFAULTS BECOME INSTANCE SETTINGS.
-- 1.2.0/1.sql created `app_settings` for the two flags that describe the
-- collection rather than a person. This adds the four that describe *the next
-- account to register*, so an admin can set them from the admin panel instead
-- of an operator editing .env and restarting the container:
--
--   registration_requires_approval  was REGISTRATION_REQUIRES_APPROVAL (.env)
--   default_language                was the users.language column DEFAULT
--   default_region                  was the users.region column DEFAULT
--   default_theme                   was the users.theme column DEFAULT
--
-- The three column DEFAULTs on `users` are deliberately left exactly where they
-- are. They are the floor for any INSERT that doesn't name those columns (an
-- import, a psql session); POST /register now names them, reading this table.
--
-- Run this AFTER 1.2.0/1.sql, which is what creates the table altered here.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run twice.
-- ---------------------------------------------------------------------------
-- Nothing below is destructive, but a second pass would fail halfway through on
-- a duplicate column and leave the operator reading a Postgres error instead of
-- a sentence. Same up-front detection as the two 1.2.0 files, for consistency.
DO $$
BEGIN
    IF EXISTS (SELECT 1
                 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'app_settings'
                  AND column_name = 'default_theme') THEN
        RAISE EXCEPTION
            'assets/db/upgrade/1.2.0/3.sql has already been applied to this database (app_settings.default_theme exists). Nothing to do.';
    END IF;
END
$$;


-- ===========================================================================
-- 1. The registration defaults.
-- ===========================================================================
-- registration_requires_approval is the one column here that is NULLABLE, and
-- the NULL is load-bearing: it means "no admin has decided yet, keep obeying
-- REGISTRATION_REQUIRES_APPROVAL". Without it, this upgrade would silently
-- switch off approval on every instance that was relying on the env var -
-- a security regression shipped by a migration, which is the worst place to
-- ship one. POST /register reads
-- `COALESCE(app_settings.registration_requires_approval, <env var>)`, so an
-- existing deployment keeps behaving exactly as it does today until an admin
-- flips the toggle, and from that moment the database is the only authority.
--
-- The other three are NOT NULL with the same defaults the `users` columns
-- already carry, so an upgraded instance and a fresh install create identical
-- accounts.
ALTER TABLE app_settings
    ADD COLUMN registration_requires_approval BOOLEAN,
    -- FK with no ON DELETE clause, i.e. RESTRICT: `users.language` can afford
    -- ON DELETE SET NULL because a user with no language falls back at read
    -- time, but this column is NOT NULL and is the fallback. Deleting the
    -- language the instance hands to new accounts has to be refused, not
    -- silently applied.
    ADD COLUMN default_language CHAR(2)   NOT NULL DEFAULT 'en' REFERENCES app_languages (code),
    ADD COLUMN default_region   CHAR(2)   NOT NULL DEFAULT 'US',
    -- Same spellings and the same CHECK as users.theme: 'beige' is the light
    -- theme, 'library' the dark one (see client-react/src/theme/palette.ts).
    ADD COLUMN default_theme  VARCHAR(10) NOT NULL DEFAULT 'beige' CHECK (default_theme IN ('beige', 'library'));

COMMIT;
