-- Upgrade to v1.2.0 (1 of 2) - schema changes made on 2026-09-11.
-- Brings an already-installed database in line with the v1.2.0 databaseSchema.sql.
-- (New installs should use databaseSchema.sql directly and skip this file.)
--
-- ONE SHARED LIBRARY.
-- Upstream gives every account its own fully isolated library. This fork turns
-- the instance into a single shared collection that every account co-manages
-- (see docs/superpowers/specs/2026-09-11-shared-library-admin-mobile-design.md).
-- Ten tables carry user_id purely as a tenancy key; here it becomes created_by,
-- which is attribution ("added by Camille") and nothing else - no query filters
-- on it any more.
--
-- Five tables keep user_id as a genuine per-account key and are deliberately
-- NOT touched: user_sessions, user_backup_codes,
-- user_security_notice_acknowledgements, user_terms_of_service_acknowledgements,
-- and activity_log.actor_id.
--
-- THE WHOLE FILE RUNS IN ONE TRANSACTION. Unlike the earlier upgrade files
-- (which only append labels/columns), this one merges rows and rewrites foreign
-- keys. Half-applying it would leave the library in a state no version of the
-- app understands, so it either lands completely or not at all. Postgres DDL is
-- transactional, so this costs nothing but an ACCESS EXCLUSIVE lock for the
-- duration - take the instance down for the minute it takes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Refuse to run twice.
-- ---------------------------------------------------------------------------
-- The row merges below are not idempotent (they are guarded by uniqueness that
-- only exists *after* this file runs), so re-running is not "a no-op", it is a
-- second merge pass over already-merged data. Rather than half-guard every
-- statement, detect the applied state up front and abort the transaction.
DO $$
BEGIN
    IF EXISTS (SELECT 1
                 FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'books'
                  AND column_name = 'created_by') THEN
        RAISE EXCEPTION
            'assets/db/upgrade/1.2.0/1.sql has already been applied to this database (books.created_by exists). Nothing to do.';
    END IF;
END
$$;


-- ===========================================================================
-- 1. De-duplicate, so the new instance-wide unique constraints can be added.
-- ===========================================================================
-- Four constraints are keyed on the owner and mean "unique per person":
--
--   books_isbn_user_unique      (isbn, user_id)  ->  UNIQUE (isbn)
--   unique_user_author          (user_id, name)  ->  UNIQUE (name)
--   unique_user_category        (user_id, name)  ->  UNIQUE (name)
--   unique_user_customer_group  (user_id, name)  ->  UNIQUE (name)
--
-- Existing data legitimately violates the new versions: two members each having
-- added "Ursula K. Le Guin" is exactly the duplication this change exists to
-- stop, and it is sitting in the table right now. So every duplicate set is
-- merged onto its survivor - always the LOWEST id, i.e. whoever entered it
-- first - and everything that pointed at a loser is repointed at the survivor
-- BEFORE any row is deleted. Nothing is ever dropped while something still
-- references it.
--
-- All four merge maps are built first, in temp tables, because book_authors is
-- affected by two of them at once (its book_id by the ISBN merge, its author_id
-- by the author merge) and has a PRIMARY KEY (book_id, author_id) that a
-- two-pass UPDATE could collide with mid-flight.

-- Duplicate books, keyed on ISBN. NULL isbn is not a duplicate of anything
-- (UNIQUE lets NULLs repeat), so books without one are left completely alone.
CREATE TEMP TABLE book_merge ON COMMIT DROP AS
SELECT b.id AS dup_id, k.keep_id
  FROM books b
  JOIN (SELECT isbn, MIN(id) AS keep_id
          FROM books
         WHERE isbn IS NOT NULL
         GROUP BY isbn) k ON k.isbn = b.isbn
 WHERE b.id <> k.keep_id;

CREATE TEMP TABLE author_merge ON COMMIT DROP AS
SELECT a.id AS dup_id, k.keep_id
  FROM authors a
  JOIN (SELECT name, MIN(id) AS keep_id FROM authors GROUP BY name) k ON k.name = a.name
 WHERE a.id <> k.keep_id;

CREATE TEMP TABLE category_merge ON COMMIT DROP AS
SELECT c.id AS dup_id, k.keep_id
  FROM categories c
  JOIN (SELECT name, MIN(id) AS keep_id FROM categories GROUP BY name) k ON k.name = c.name
 WHERE c.id <> k.keep_id;

CREATE TEMP TABLE group_merge ON COMMIT DROP AS
SELECT g.id AS dup_id, k.keep_id
  FROM customer_groups g
  JOIN (SELECT name, MIN(id) AS keep_id FROM customer_groups GROUP BY name) k ON k.name = g.name
 WHERE g.id <> k.keep_id;


-- --- book_authors: rewritten wholesale, both maps applied at once. ---------
-- A plain UPDATE can't do this safely: collapsing (bookA, author9) and
-- (bookA, author11) onto the same surviving author would violate
-- PRIMARY KEY (book_id, author_id) inside a single statement. Projecting the
-- desired post-merge set with a GROUP BY and swapping it in sidesteps the
-- ordering problem entirely. The table is a narrow join table, so a full
-- rewrite is cheap. created_by (still user_id at this point) keeps the lowest
-- contributor id of the rows being collapsed - an arbitrary but stable pick,
-- and attribution only, since nothing filters on it any more.
CREATE TEMP TABLE book_authors_merged ON COMMIT DROP AS
SELECT COALESCE(bm.keep_id, ba.book_id)   AS book_id,
       COALESCE(am.keep_id, ba.author_id) AS author_id,
       MIN(ba.user_id)                    AS user_id
  FROM book_authors ba
  LEFT JOIN book_merge bm   ON bm.dup_id = ba.book_id
  LEFT JOIN author_merge am ON am.dup_id = ba.author_id
 GROUP BY COALESCE(bm.keep_id, ba.book_id), COALESCE(am.keep_id, ba.author_id);

DELETE FROM book_authors;
INSERT INTO book_authors (book_id, author_id, user_id)
SELECT book_id, author_id, user_id FROM book_authors_merged;


-- --- book_files: UNIQUE (book_id, file_type) - one file per type survives. ---
-- Repointing a loser's EPUB onto a book that already has an EPUB would violate
-- that constraint. The two files are two people's backups of the same title, so
-- dropping the extra loses nothing the keeper doesn't already have.
--
-- Ranked rather than "delete the ones that collide with the keeper", because
-- the collision isn't only against the keeper: two *losers* can each carry an
-- EPUB for a title the keeper has no file for at all, and repointing both in
-- one UPDATE would violate the constraint just the same. Ranking every row by
-- where it will land settles both cases at once. The ORDER BY keeps the
-- keeper's own file when there is one, then falls back to the oldest.
DELETE FROM book_files bf
 USING (
     SELECT bf2.id,
            ROW_NUMBER() OVER (
                PARTITION BY COALESCE(bm.keep_id, bf2.book_id), bf2.file_type
                ORDER BY (bm.keep_id IS NULL) DESC, bf2.id
            ) AS rn
       FROM book_files bf2
       LEFT JOIN book_merge bm ON bm.dup_id = bf2.book_id
 ) ranked
 WHERE bf.id = ranked.id
   AND ranked.rn > 1;

UPDATE book_files bf SET book_id = bm.keep_id
  FROM book_merge bm WHERE bf.book_id = bm.dup_id;

-- --- Everything else pointing at a merged row. No uniqueness in the way. ---
-- book_stocks.code is already globally unique, so physical copies just move
-- over to the surviving book - both members' copies end up on one title, which
-- is the point.
UPDATE book_stocks bs SET book_id = bm.keep_id
  FROM book_merge bm WHERE bs.book_id = bm.dup_id;

UPDATE loan_history lh SET book_id = bm.keep_id
  FROM book_merge bm WHERE lh.book_id = bm.dup_id;

UPDATE books b SET category_id = cm.keep_id
  FROM category_merge cm WHERE b.category_id = cm.dup_id;

UPDATE customers c SET group_id = gm.keep_id
  FROM group_merge gm WHERE c.group_id = gm.dup_id;

UPDATE loan_history lh SET group_id = gm.keep_id
  FROM group_merge gm WHERE lh.group_id = gm.dup_id;

-- --- Now, and only now, drop the losers. -----------------------------------
DELETE FROM books b            USING book_merge bm     WHERE b.id = bm.dup_id;
DELETE FROM authors a          USING author_merge am   WHERE a.id = am.dup_id;
DELETE FROM categories c       USING category_merge cm WHERE c.id = cm.dup_id;
DELETE FROM customer_groups g  USING group_merge gm    WHERE g.id = gm.dup_id;


-- ===========================================================================
-- 2. user_id -> created_by, nullable, and ON DELETE CASCADE -> SET NULL.
-- ===========================================================================
-- This is the important half of the whole change.
--
-- All ten of these foreign keys are ON DELETE CASCADE today. That is correct
-- when a row belongs to one person: deleting the account should take their
-- private library with it.
--
-- Under a shared library it is a data-loss bug. Deleting ANY account would
-- delete every book that person ever added - plus its stocks, files and loan
-- history - out of the collection everyone else shares. Removing a member must
-- not empty the household's shelves.
--
-- So created_by becomes NULLABLE and every one of these becomes
-- ON DELETE SET NULL. A row whose creator is gone renders as "added by a
-- removed account"; it does not disappear.
--
-- Driven by a loop rather than 40 hand-written statements so no table can be
-- quietly missed, and so the old constraint is found by what it *does* (an FK
-- on this column into users) rather than by a name an older install might spell
-- differently. The new constraints are named explicitly - <table>_created_by_fkey -
-- to match exactly what a fresh databaseSchema.sql install produces.
DO $$
DECLARE
    target_table TEXT;
    old_fk       TEXT;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'books', 'book_stocks', 'book_authors', 'book_files', 'authors',
        'categories', 'locations', 'customers', 'customer_groups', 'loan_history'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I RENAME COLUMN user_id TO created_by', target_table);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN created_by DROP NOT NULL', target_table);

        SELECT c.conname INTO old_fk
          FROM pg_constraint c
         WHERE c.conrelid = target_table::regclass
           AND c.contype = 'f'
           AND c.confrelid = 'users'::regclass
           AND c.conkey = ARRAY[(SELECT a.attnum
                                   FROM pg_attribute a
                                  WHERE a.attrelid = c.conrelid
                                    AND a.attname = 'created_by')]::smallint[];

        IF old_fk IS NULL THEN
            RAISE EXCEPTION 'No users foreign key found on %.created_by - schema is not what this upgrade expects, aborting.', target_table;
        END IF;

        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', target_table, old_fk);
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL',
            target_table, target_table || '_created_by_fkey');
    END LOOP;
END
$$;


-- ===========================================================================
-- 3. Re-key the four unique constraints off the owner.
-- ===========================================================================
-- Safe now that section 1 has merged every duplicate. Without these, two
-- members each adding "Ursula K. Le Guin" produce two author rows and the books
-- split across them; the find-or-create helpers (__ensureAuthors,
-- __ensureCategory, __getOrCreateBook and their ImportRoute twins) look rows up
-- by exactly these keys.
ALTER TABLE books DROP CONSTRAINT books_isbn_user_unique;
ALTER TABLE books ADD CONSTRAINT books_isbn_unique UNIQUE (isbn);

ALTER TABLE authors DROP CONSTRAINT unique_user_author;
ALTER TABLE authors ADD CONSTRAINT unique_author_name UNIQUE (name);

ALTER TABLE categories DROP CONSTRAINT unique_user_category;
ALTER TABLE categories ADD CONSTRAINT unique_category_name UNIQUE (name);

ALTER TABLE customer_groups DROP CONSTRAINT unique_user_customer_group;
ALTER TABLE customer_groups ADD CONSTRAINT unique_customer_group_name UNIQUE (name);

-- book_stocks.code is already globally unique and needs no change - scanning a
-- code in a shared library already resolves to exactly one copy.


-- ===========================================================================
-- 4. Rebuild the loan-history covering index without the owner column.
-- ===========================================================================
-- (user_id, loaned_at DESC) only covered "this user's loans, newest first",
-- which is no longer a query anyone runs - GET /loans/report now filters on
-- loaned_at and orders by it. Renamed as well as rebuilt: a name still claiming
-- "user" would misdescribe what it indexes.
DROP INDEX idx_loan_history_user_loaned_at;
CREATE INDEX idx_loan_history_loaned_at ON loan_history (loaned_at DESC);


-- ===========================================================================
-- 5. Instance settings move out of the users table.
-- ===========================================================================
-- users.leasing_enabled and users.is_public_institution describe the
-- collection, not a person. With one shared library, one member toggling
-- lending would otherwise change the nav for themselves alone while the shared
-- loan data stays visible to everyone.
--
-- Single-row table: id is pinned to 1 by a CHECK so a second settings row
-- cannot be inserted even by hand, and every reader can just say
-- "SELECT ... FROM app_settings" without a WHERE.
CREATE TABLE app_settings
(
    id                    INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    leasing_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    is_public_institution BOOLEAN NOT NULL DEFAULT FALSE
);

-- Seeding rule: the instance flag is the OR of what its members had.
--
-- Picking one account's values (the first to register, say) would silently
-- take something away: if account #1 had leasing off and account #2 had it on,
-- #2's loans and customers - now shared data belonging to everyone - would
-- become unreachable in the UI with no way to notice. Same argument, more
-- strongly, for is_public_institution, which gates a security notice: turning
-- it ON when any account had it on is the fail-safe direction.
--
-- So: enabled if anybody had it enabled. An admin can turn either back off
-- afterwards; nobody loses access to data or a notice they were relying on in
-- the meantime. COALESCE covers an instance with no accounts at all.
INSERT INTO app_settings (id, leasing_enabled, is_public_institution)
SELECT 1,
       COALESCE((SELECT bool_or(leasing_enabled) FROM users), FALSE),
       COALESCE((SELECT bool_or(is_public_institution) FROM users), FALSE);

ALTER TABLE users DROP COLUMN leasing_enabled;
ALTER TABLE users DROP COLUMN is_public_institution;

COMMIT;
