# Task 1196 report — distinguish metadata failures in the client

## Response shapes covered

The client now parses the structured body returned by `POST /book/isbn/:isbn` only for its expected status codes:

- `404 { error: "source_not_configured", unconfiguredSources, sourcesTried, failedSources }`: the lookup did not produce a book because the server-reported source(s) are not configured.
- `404 { error: "no_metadata", unconfiguredSources: [], sourcesTried, failedSources }`: the ISBN was checked and no catalogue returned usable metadata.
- `502 { error: "source_unavailable", ... }` remains the provider-unavailable/retry path. Unknown or malformed bodies continue through the existing generic handling.

Source arrays are treated as untrusted response data. Copy names only the non-empty source strings in `unconfiguredSources`; no provider is inferred from status, `sourcesTried`, or client assumptions.

## Copy decisions

- Config gap: `Metadata source unavailable: <reported source(s)> is/are not configured on this server. Ask an administrator to configure it, or add the book manually.`
- Catalogue gap: `This ISBN was checked, but no catalogue returned metadata. Add it manually instead.`
- Scan entries retain `notFound` for the existing summary/status contract but carry the structured kind and message. Scan toast titles and summary lines now surface the distinction.
- Malformed ISBN, duplicate/copy confirmation, provider 502 retry, and generic network failures retain their prior handling.

## RED/GREEN evidence

- RED: added two dialog behavior tests and two scan queue behavior tests first; before the implementation, all four failed because the dialog/queue used the generic `No metadata found` behavior (the dialog’s second case initially also exposed a test sheet interaction timing issue).
- GREEN: after adding the focused parser/copy helper and threading messages through both flows, focused tests pass: **2 files, 18 tests passed**.

## Verification

- `npm run lint` — passed.
- `npm run type-check` — passed.
- `npm test` — passed: **23 files, 166 tests**.
- `npm run build` — completed successfully and emitted `dist`; the existing Tamagui extraction warnings (`Cannot read properties of undefined (reading 'fileExists')` / `Must provide components`) remain noisy but non-fatal.
- `git diff --check` — passed.

## Commit

`4ec6335` — `fix(client): distinguish ISBN metadata failures`

## Concerns

The production build continues to print pre-existing Tamagui static-extraction warnings while succeeding. No server files were changed; this client assumes the task 1194 response contract documented above.
