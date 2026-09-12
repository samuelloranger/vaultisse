# Task 1187A report — locale foundation and real region behavior

## Status

Complete. The implementation is committed in the task-owned client/server seams and does not add translation rows or migrations.

## Interface contract

- `LocaleProvider` receives the policy user's `language`, `region`, and `labels` map at the authenticated `_app` boundary.
- `useLocale()` exposes `locale`, `t(code, englishFallback, values)`, `tPlural(code, count, oneFallback, otherFallback, values)`, `formatDate`, and `formatNumber`.
- `buildLocale` canonicalizes two stored two-letter codes into BCP-47 (`fr-CA`) and falls back to `en-US` for malformed values. `Intl` remains the source of locale support/fallback behavior.
- Missing labels always use the explicit English fallback. Interpolation replaces `{name}`-style parameters without evaluating code. Plural lookup uses `Intl.PluralRules`, checking `${code}.${category}` then `.other`.
- Date-only values are formatted at UTC noon with UTC as the default display zone, preventing a calendar-day shift. Timestamp values retain the viewer's locale timezone behavior.

## Changed call sites

- Authenticated app layout wraps `AppShell` and all routes in `LocaleProvider`; policy invalidation/refetch therefore updates language, region, labels, and formatting live.
- Removed the Profile message claiming language changes require a new sign-in.
- Book published dates and ebook file dates use `useLocale().formatDate`.
- Loan cards, loan reports/CSV, session/activity timestamps, and dashboard month labels use the stored locale. Existing pure helpers retain an `en-US` default for isolated callers/tests.
- Added `server/src/utils/Regions.ts` with the exact 16 Profile selector regions. `PUT /user` rejects unsupported/malformed values; admin registration defaults use the same allow-list.
- ISBN create, single refresh, and bulk refresh resolve the requesting user's validated region and pass it through to Google Books as `country`; BnF/Open Library calls are unchanged.

## TDD evidence

- RED: `bunx vitest run src/locale/LocaleProvider.test.tsx` failed to resolve the intentionally absent `./LocaleProvider` module.
- GREEN: the same command passed 3 locale tests (later expanded with number formatting).
- RED: with `TEST_DB_NAME=vaultisse_task1187a_red`, server UserRoute/provider tests failed as expected: invalid `ZZ` returned 200 and Google URL lacked `country=CA`.
- GREEN: with `TEST_DB_NAME=vaultisse_task1187a_green`, focused UserRoute and BookMetadata tests passed 39/39; BooksRoute route test later proved CA reaches Google.

## Verification

- Client: `bun run type-check` passed; `bun run lint` passed; `bunx vitest run` passed 25 files / 172 tests; `bun run build` passed.
- Server: `bun run build` passed; root `bun run lint` passed; isolated `TEST_DB_NAME=vaultisse_task1187a_books bun test test/routes/BooksRoute.test.ts` passed 55/55; focused UserRoute/provider tests passed 39/39.
- Client build still prints pre-existing Tamagui extractor/config warnings (`Must provide components`, `fileExists`) while completing successfully.

## Commit

`ababed2` — `feat(locale): add regional formatting seam`

## Concerns

- The general string/translation sweep remains intentionally out of scope; callers must supply explicit English fallbacks as they migrate.
- Existing database rows with an invalid region are safely treated as `US` for provider requests, while new profile writes and admin defaults are constrained to the 16 supported codes.

## Round 1/5 fix evidence

- RED: the new timezone regression reproduced `4/30/1974` for PostgreSQL's `1974-05-01T04:00:00.000Z` in `America/Los_Angeles`; inherited-label coverage returned `inherited` for `constructor`.
- GREEN: `formatDate(..., {dateOnly: true})` now normalizes date-column payloads to the UTC calendar date, and label/plural lookup requires own properties. The focused suite passes 11/11, including rendered BookScreen output `5/1/1974`.
- Round verification: client lint and type-check pass; focused locale/BookScreen tests pass. No server code changed in this round.
