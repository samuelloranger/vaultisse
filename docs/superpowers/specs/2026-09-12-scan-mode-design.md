# Scan mode

A continuous barcode-scanning mode for adding physical books. The camera stays
open, each recognised ISBN that is new to the shared library is added
automatically, a small toast confirms what landed, and scanning continues — so a
stack of books is a sweep of the phone rather than twenty round trips through a
dialog.

The single exception is a book the library already has, which stops and asks
before writing anything.

## Contents

- [Why this shape](#why-this-shape)
- [The flow](#the-flow)
- [Decoding](#decoding)
- [The add pipeline](#the-add-pipeline)
- [Duplicates](#duplicates)
- [Undo](#undo)
- [Failure states](#failure-states)
- [Where it lives](#where-it-lives)
- [Testing](#testing)
- [Out of scope](#out-of-scope)

## Why this shape

The old Vue client had a camera scanner (`html5-qrcode`) and it was not ported
to the React client. Rather than port it as it was, the owner asked for
something more natural: *"enter Scan mode that automatically adds to library,
shows a small toast with book name + cover and continues for quick add multiple
books."*

The old scanner filled a text field. That is the wrong unit of work. Cataloguing
a shelf is one continuous physical motion — pick up book, point, hear the beep,
put it on the done pile — and any design that makes you look at the screen and
tap between books breaks the rhythm. Scan mode is built around the motion, not
around the form.

`AddBookIsbnDialog` stays exactly as it is. It is the typed path, it is the
fallback when there is no camera or permission is refused, and it is the only
path on a desktop without a webcam. **The scanner is an addition to it, never a
replacement** — the same rule the existing dialog's doc comment already states.

## The flow

1. On the Library screen, a **Scan** control sits next to "Add by ISBN". It is
   rendered only when a camera is plausibly available (`navigator.mediaDevices
   ?.getUserMedia` exists). On a desktop with no camera it is absent, not
   disabled-with-a-tooltip — tooltips never open on touch, and a control that
   cannot ever work is noise.

2. Tapping it opens a **full-screen scan view**. Before the camera starts, if
   the library has more than one location, it asks **where these copies go**.
   That question cannot be asked per-book mid-scan without destroying the
   rhythm, so it is asked once, up front, and shown persistently in the scan
   view's header so it can be changed between books. With exactly one location,
   the server's auto-assign rule already handles it and the question is skipped.

3. The camera preview fills the screen. Overlaid:
   - a **reticle** framing where the barcode should sit,
   - a **running count** of what this session has added,
   - the **target location**, tappable to change,
   - a **torch toggle**, when the track reports `torch` support (book spines are
     read in badly-lit rooms),
   - **Done**, which closes the view and returns to the library.

4. Each successful decode fires the add pipeline. A book **not already in the
   library** is added with no interruption and raises a **toast**: the cover
   thumbnail, the title, and an **Undo**. The camera never stops. Toasts stack
   to at most three and auto-dismiss.

   A book that **is** already in the library stops and asks — see
   [Duplicates](#duplicates). That is the one interruption in the flow, and it
   is deliberate.

5. **Done** closes the view and shows a session summary — what was added, in
   order, each still undoable. Landing back in the library with no record of
   what just happened is how a mis-scan becomes a mystery next week.

## Decoding

Two implementations behind one interface, chosen at runtime:

| | |
|---|---|
| Primary | the platform `BarcodeDetector` API |
| Fallback | `@zxing/browser` |

`BarcodeDetector` is native, fast and free of a WASM download, but as of writing
it ships in Chrome/Edge on Android and desktop and **not** in Safari — which is
the owner's device and the single most likely phone for this feature. So the
fallback is not a nicety; it is the path that will actually run. Both must be
tested.

Detect with `'BarcodeDetector' in window` **and** a successful
`BarcodeDetector.getSupportedFormats()` check that includes `ean_13` — the
constructor exists in some builds where the format set is empty.

Formats: `ean_13` is the real target (a book's barcode is an EAN-13 whose digits
*are* the ISBN-13). Also accept `ean_8` and `upc_a` so a decode is not silently
dropped, then reject them at validation with a clear message rather than
pretending nothing was seen.

Every decode passes through `features/search/isbn.ts` — `normaliseIsbn` then
`isValidIsbn` — before anything is sent. The checksum catches a misread barcode
before it costs a rate-limited round trip to Google Books. A decode that fails
the checksum is ignored silently; camera noise is constant and surfacing it
would make the screen unusable.

`getUserMedia` requires a secure context. `localhost` qualifies for development;
production is behind Caddy TLS, so this is satisfied — but the failure message
must say so plainly if it ever is not, because "camera doesn't work" with no
explanation is unfixable by the person holding the phone.

Request the rear camera: `{ video: { facingMode: { ideal: 'environment' } } }`.
Release every track on unmount — a camera left running behind a closed view is
the bug users notice as a hot phone and a live indicator light.

## The add pipeline

A decode does not directly become a request. Decodes arrive many times per
second and the lookup behind each one is rate-limited, so:

1. **Debounce by code.** The same ISBN seen again within a cooldown window is
   ignored. See [Duplicates](#duplicates).
2. **Enqueue.** One serial queue, one request in flight at a time, with the same
   `DELAY_BETWEEN_LOOKUPS_MS = 1500` courtesy `AddBookIsbnDialog` already
   applies to Google Books / Open Library. The camera keeps decoding while the
   queue drains; scanning is never blocked on the network.
3. **Check the library first.** `GET /book/search?query=<isbn>`, then
   **exact-compare** `book.isbn === code` on the results — the server matches
   with `ILIKE '%…%'`, so a partial match is possible and the raw result set
   cannot be trusted as "this exact book". This is a local database query with
   no external lookup behind it, so it is cheap enough to run before every add.
   - **No match** → step 4.
   - **Match** → pause scanning and raise the duplicate confirmation. See
     [Duplicates](#duplicates). Nothing is written until the user answers.
4. **`POST /book/isbn/:isbn`** with the chosen location. Returns the book id.
5. **`GET /book/:id`** for the title and cover the toast needs. The create
   endpoint returns only an id, so this second call is what makes the toast
   possible. It is small and cached by TanStack Query.
6. **Invalidate** the same keys `useCreateBookFromIsbn` already invalidates — a
   book created from an ISBN also creates authors, a category and a stock, so
   the search, counters, policy, author, category and location keys are all
   affected. Reuse the existing mutation rather than writing a second pipeline
   with its own idea of what to invalidate.

The check in step 3 puts one extra round trip in front of the common path. It is
a single indexed lookup against the local Postgres, it happens while the camera
keeps decoding, and it is what makes the duplicate question answerable *before*
a copy is written rather than after.

## Duplicates

The server's `POST /book/isbn/:isbn` is **find-or-create on the book** and then
**always adds a stock**. So the endpoint has no "already have this" outcome to
report: it either adds a first copy or silently adds a second, and the caller
cannot tell which from the id it gets back. That is why the library check in
step 3 of the pipeline exists — it is the only place the difference is knowable
*before* something is written.

**A scanned book already in the library raises a confirmation, and nothing is
written until it is answered.**

The confirmation is a `ResponsiveDialog` (Sheet on phones, Dialog on desktop —
the pattern the client already uses), showing:

- the existing book's cover and title,
- **how many copies are already recorded**, and where they are shelved,
- two actions: **Add another copy** and **Skip**.

`Skip` is the default-weighted action. The premise of the whole mode is fast
unattended adding, and the one thing it must not do unattended is quietly
duplicate a book someone already catalogued.

The copy count needs the book's stock list, which the search endpoint does not
return — fetch `GET /book/:id` for the matched id. It is a second local query on
the duplicate path only, which is the rare one.

### Scanning pauses while the dialog is open

The decoder is stopped, not merely ignored, for as long as the confirmation is
up. A camera that keeps decoding behind a modal stacks a second question behind
the first, and the user answers one dialog while a queue of them builds
invisibly. Scanning resumes on either answer.

### Cooldown

Independently of the dialog, a code that has been **handled** — added, or
skipped — is ignored for **5 seconds**. The camera fires many times a second and
the book stays in frame after it is dealt with; without this, putting a book
down slowly would re-raise the question that was just answered.

Five seconds, not forever, because a deliberate re-scan is how someone records a
genuine third copy. Re-asking after the cooldown costs one tap and writes
nothing on its own — the dialog is the gate, so the conservative choice here is
to ask again rather than to silently refuse.

### Toast copy

- First copy of a new book: **"Added"**.
- A copy added through the confirmation: **"Second copy added"** (third, fourth,
  …), from the stock count after the add.

Silently recording a copy the user did not mean to add is the failure mode this
feature is most likely to produce. The confirmation prevents it; the toast
wording makes it visible when it does happen.

## Undo

Every toast carries **Undo**, and the session summary keeps every entry undoable
until the view is closed.

Undo semantics follow what the add actually did:

- If the add **created the book**, undo deletes the book (`DELETE /book/:id`),
  which takes its stock with it.
- If the add only **added a stock** to a book that already existed, undo deletes
  that stock (`DELETE /book/:id/stock/:stock_id`) and leaves the book alone.

Which of the two happened must therefore be known. The create endpoint returns
only an id, so determine it from the book's state before the add: if the id is
already in the search cache or the fetched book's `date_created` matches this
session, it was a find. If that proves unreliable in practice, prefer a
conservative rule — undo the stock only, and say so in the toast — over deleting
a book that was already in the library. **Undo must never be able to delete
something the user did not add in this session.**

## Failure states

Each one keeps the camera running. Nothing here stops a scan session.

| Condition | Behaviour |
|---|---|
| Book already in the library | Not a failure — the confirmation in [Duplicates](#duplicates). Scanning pauses; nothing is written until answered. |
| The library check itself fails | Treat it as "unknown", not as "not present". Raise the confirmation with the title unknown and the count unstated rather than silently adding a copy on the strength of a failed query. |
| Camera permission denied | Leave scan mode, explain plainly, offer the typed ISBN dialog. Do not retry `getUserMedia` in a loop — the browser will not re-prompt and the result is an invisible hang. |
| No camera / `getUserMedia` missing | The Scan control is never rendered. |
| Decode fails the ISBN checksum | Ignored silently. |
| Non-book barcode (`ean_8`, `upc_a`) | Toast: not a book barcode. |
| `404` from the server | Toast: no metadata found for this ISBN, with a **tap to add manually** action that opens the manual dialog pre-filled with the code. This is the common case for older and self-published books and must not feel like an error. |
| `502` (Google/Open Library down) | Toast: lookup service unavailable. The queue keeps the code and retries once; a second failure surfaces it in the session summary so nothing is lost. |
| Network offline | Codes stay queued and the count reflects pending rather than added. Never report a book as added before the server has said so. |

## Where it lives

```
client-react/src/
  features/scan/
    ScanScreen.tsx          the full-screen view, camera lifecycle, overlay
    useBarcodeScanner.ts    BarcodeDetector / zxing behind one hook
    useScanQueue.ts         debounce, serial queue, library check, add
                            pipeline, undo records
    ScanDuplicateDialog.tsx the "already in the library — add anyway?" confirm
    ScanToast.tsx           the per-add toast
    ScanSummary.tsx         the on-exit session summary
  components/
    Toast.tsx             a shared toast host — there is none today
```

`components/Toast.tsx` is a general component, not a scan-specific one. The
client currently has no toast at all, which is why every screen reports outcomes
as inline text. Scan mode needs a transient confirmation that does not move the
layout, and the rest of the app will want the same thing; it belongs in
`components/`.

New dependency: `@zxing/browser` (plus its `@zxing/library` peer). This replaces
the spec'd-but-never-installed `html5-qrcode` line from the rewrite spec's
feature-library table — that table already names `BarcodeDetector` with a
`@zxing/browser` fallback as the decision, so this implements it rather than
changing it.

## Testing

The camera cannot be driven in jsdom, so the seam is the decoder interface:

- `useBarcodeScanner` is tested against a **fake decoder** that emits a
  scripted sequence of codes. Both real implementations sit behind the same
  interface so the queue logic is tested once.
- `useScanQueue` gets the cases that matter and are invisible by eye: a code
  not in the library is added with no dialog; a code already in the library
  raises the dialog and **writes nothing** until it is answered; `Skip` writes
  nothing at all; `Add another copy` writes exactly one stock; the same code
  twice inside the cooldown asks once; a search result that merely *contains*
  the code as a substring is not treated as a match; a checksum failure adds
  nothing; a `404` does not stop the queue; undo of a created book deletes the
  book, undo of an added copy deletes only the stock.
- Playwright drives the real view at a 390px viewport with a fake camera
  (`--use-fake-device-for-media-stream --use-file-for-fake-video-capture=…`) to
  prove the view mounts, the overlay lays out, and the tracks are released on
  exit.

The 44px touch floor and 16px input floor apply to every control here as
everywhere else.

## Out of scope

- Scanning anything but book barcodes (no QR, no shelf-location codes).
- Offline queueing that survives a reload.
- Batch editing what was scanned. The session summary lists and undoes; editing
  happens on the book's own screen.
- Any server change. Scan mode is built entirely on endpoints that already
  exist.
