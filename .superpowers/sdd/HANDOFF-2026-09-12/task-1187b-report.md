# Task 1187B report

Status: `DONE_PENDING_HUMAN_TRANSLATION_REVIEW`

## Scope delivered

- Routed the React client’s visible labels through the existing `LocaleProvider`:
  navigation, headings, fields, buttons, dialogs, loading/empty/error/success
  states, accessibility text, chart summaries, document titles, scan/camera
  errors, metadata messages, and account-security copy.
- Kept the Borrowers compatibility boundary intact. API/database identifiers
  remain `customer`/`customers`; Québec French user-facing copy uses
  `emprunteur`/`emprunteurs`. `client`, `lecteur`, and `membre` are not used as
  borrower synonyms (`membre` remains valid for an account role).
- Reused the existing `LocaleProvider` fallback behavior: each client label
  supplies English text, and a missing key never renders the raw catalogue code.
- Added Québec French as `fr`, combined with `CA` as `fr-CA` for Intl date and
  number formatting. The row-by-row draft is in
  [FR-CA-TRANSLATION-REVIEW.md](../../../docs/FR-CA-TRANSLATION-REVIEW.md).

## Catalogue and migration

- Existing English catalogue: 281 rows.
- Current English catalogue: 850 rows, including 569 client-authored additions.
- Québec French: 850 rows in `databaseSchema.sql`, the migration, and the
  review document.
- Italian gap closed: `RETURN_BOOKS` and `RETURN` (2 rows).
- Migration: `assets/db/upgrade/1.3.0/2.sql`; one transaction, upfront repeat
  guard, one `fr` language row, 569 English rows, 2 Italian rows, and 850
  French rows. No `ON CONFLICT` or production/deployment action was used.
- Schema totals after the change: `en` 850, `ca` 281, `es` 281, `it` 282,
  `fr` 850.

## Test-first record

Representative client and catalogue checks were established RED before the
label wiring/catalogue was complete, then GREEN after implementation. The
focused client locale suite is now 4/4, and the catalogue migration suite is
5/5.

## Verification

- Client lint: pass (`biome check src`, 158 files).
- Client type-check: pass.
- Client focused locale tests: 4 passed.
- Client full suite: 26 files, 178 tests passed.
- Client production build: exits 0. The repository’s existing Tamagui
  extractor emits `Must provide components`/config-bundling warnings but the
  Vite build completes and writes the expected bundles.
- Server catalogue test: 5 passed, 3,068 expectations.
- Server full suite: 20 files, 252 tests passed.
- Server TypeScript build: pass.
- Root server lint: pass (72 files).
- `git diff --check`: pass.
- Impeccable detector ran over changed UI files; no deterministic design
  issues were reported.

## Limits and required follow-up

- French wording is explicitly a draft. A fluent Québec French owner must
  review every row in the review document before approval or deployment.
- This run did not execute the SQL against a throwaway database because the
  workspace has no `psql` client/isolated migration harness. Static checks
  cover transaction ordering, repeat guard, row uniqueness, coverage, and
  placeholder parity.
- A real 390px authenticated browser pass was not available in the client
  harness. Existing responsive structure and 44px action floors remain in
  place; this should be checked manually with the French draft before release.
- No production deployment was performed. `AddBookIsbnDialog.test.tsx` was
  not changed by this task.

Implementation commit: `4dc845c` (`feat(locale): sweep client labels and add
fr-ca`). This report is included in that commit.

Exact review path:
`/home/samuelloranger/sites/vaultisse/docs/FR-CA-TRANSLATION-REVIEW.md`
