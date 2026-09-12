# Task 1195 report — dashboard stock status

## UI choice

Added a compact `Copy status` card to the dashboard beneath the books-added
trend. Each status returned by `GET /dashboard` is rendered as a text-first tile
with its existing label and a singular/plural copy count. The tile row uses
Reading Room surface, border, radius, text, and display tokens and wraps at
narrow widths, including 390px. Status is never conveyed by colour alone.

The empty response keeps the card but renders the quiet message `No copies to
classify yet.` and no status tiles. No zero-valued categories are synthesized.

The existing stock-status label catalogue was extracted to
`features/book/stockStatus.ts` and reused by the book stock dialog/card and the
dashboard, leaving one shared lookup ready for a future locale hook.

## Edge cases

- Multiple statuses render only the statuses in the response.
- `1` renders `1 copy`; every other count renders `N copies`.
- An empty `stockStatus` array renders the honest empty state with no category
  tiles.
- Unknown enum values retain the existing `Unknown` fallback.

## RED/GREEN evidence

- RED: `bun run test -- src/features/dashboard/StockStatusSummary.test.tsx`
  failed before implementation because `./StockStatusSummary` did not exist.
- GREEN: the same focused command passed with 2/2 tests after implementation.
- Focused dashboard suite: 8/8 tests passed.

### Round 1 fix

- RED: the new label-wrapping regression test failed against the clamped
  component because Tamagui emitted `_ox-hidden`, `_textOverflow-ellipsis`, and
  `_ws-nowrap` for the status label.
- GREEN: removed `numberOfLines={1}` so localized labels wrap naturally; the
  focused `StockStatusSummary` suite passed 3/3 tests.
- The round-1 wording correction keeps the shared-label claim scoped to the
  dashboard and book stock dialog/card; `LocationBooksPanel` remains outside
  this task.

## Verification

- Impeccable detector (one manual pass over changed UI paths): no findings (`[]`).
- `bun run lint`: passed.
- `bun run type-check`: passed.
- `bun run test`: 24 files, 168 tests passed. Existing jsdom notices for
  `scrollTo` and canvas `getContext` remain non-failing.
- `bun run build`: passed with exit 0. Existing Tamagui extraction warnings
  (`Cannot read properties of undefined (reading 'fileExists')` / `Must provide
  components`) were emitted, but Vite completed the production build.
- `git diff --check`: passed.
- Round-1 focused verification: `bun run test --
  src/features/dashboard/StockStatusSummary.test.tsx`, `bun run lint`, and
  `bun run type-check` all passed.

## Commit

Task commit: `c436369` (`feat(client): show dashboard stock status`); round-1
fix commit pending.

## Concerns

The production build still emits the repository's existing Tamagui extractor
warnings; they are unrelated to this status card and do not fail the build.
The pre-existing modification to `task-1196-report.md` was preserved and is
not part of this task's commit.
