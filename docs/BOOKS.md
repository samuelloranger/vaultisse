# Books: catalog & stock

The catalog module - how a book's metadata is different from a physical copy
of it, how a copy moves through its lifecycle, and how ISBN lookup fills in
metadata automatically. If you're touching anything under "Library" in the
UI, or `BooksRoute.ts` on the server, start here.

## Contents

- [Mental model: a book vs. a stock](#mental-model-a-book-vs-a-stock)
- [Creating a book](#creating-a-book)
- [ISBN auto-lookup](#isbn-auto-lookup)
- [The stock lifecycle](#the-stock-lifecycle)
- [Cover images](#cover-images)
- [Ebook file backups](#ebook-file-backups)
- [Search, counters, and filters](#search-counters-and-filters)
- [Stock-code entry](#stock-code-entry)
- [Printing labels](#printing-labels)
- [Where this lives in code](#where-this-lives-in-code)

## Mental model: a book vs. a stock

There is exactly one library and it is the instance: every account sees the
same catalog and can add, edit, lend and delete anything in it. No request in
this module filters by the caller. `books.created_by` records who added a
title ("added by Camille") and is nullable - deleting an account leaves its
contributions in place rather than taking the household's books with it. See
[the shared-library design](superpowers/specs/2026-09-11-shared-library-admin-mobile-design.md)
for why, including the `ON DELETE SET NULL` reasoning.

`books_isbn_unique` is instance-wide, so a title is entered once: a second
member entering the same ISBN is told it's already on the shelf (manual
`POST /book`) or handed the existing book (`POST /book/isbn/:isbn`
find-or-create).

Two distinct concepts, both under "Library" in the UI:

- **A `books` row** is catalog metadata: title, description, cover, ISBN,
  category, author(s), language, publisher, page count, format. It's
  singular - "The Hobbit" is one `books` row no matter how many copies you own.
- **A `book_stocks` row** is one physical copy of that book: it has its own
  scannable `code`, a `status` (available / not available / booked / damaged),
  a `location_id` (which shelf it's on), and, when loaned out, a `customer_id`.

A book can have zero, one, or many stocks. A brand-new school library might
own five copies of the same title - one `books` row, five `book_stocks` rows,
each independently trackable and independently loanable.

```mermaid
erDiagram
    books ||--o{ book_stocks : "has copies"
    books ||--o{ book_authors : ""
    authors ||--o{ book_authors : ""
    books ||--o{ book_files : "backup files (1/type)"
    book_stocks }o--o| locations : "stored at"
    book_stocks }o--o| customers : "loaned to"
```

## Creating a book

Two ways in, both in [`BooksRoute.ts`](../server/src/routes/BooksRoute.ts):

- **`POST /book`** - manual entry: name (required), description, ISBN, cover
  image upload. Duplicate ISBNs for the same user are rejected with 404.
- **`POST /book/isbn/:isbn`** - [auto-lookup](#isbn-auto-lookup) from an ISBN.

Both end with the same convenience: **`__automaticallyAddBookToLocation()`**
checks whether the user has *exactly one* location and, if so, silently
creates one "available" stock there. With only one shelf in the whole
library there's nothing to choose, so the app skips asking. Once a second
location exists, this stops firing and stock placement becomes explicit
(passed as `location` in the ISBN-lookup body, or added by hand afterward).

## ISBN auto-lookup

`POST /book/isbn/:isbn` turns a barcode scan into a fully-populated book
without any typing:

```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Google as Google Books API
    participant BnF as BnF SRU catalogue
    participant OL as Open Library
    participant RB as Renaud-Bray (optional)

    Client->>Server: POST /book/isbn/9782824627151
    Server->>Server: normalizeAndValidateIsbn() - reject malformed input
    Server->>Google: GET /volumes?q=isbn:...&key=GOOGLE_BOOKS_API_KEY
    Google-->>Server: title, authors, description, cover... (or nothing)
    alt still missing fields, and a French-group ISBN (978-2 / 979-10)
        Server->>BnF: GET /api/SRU?query=bib.isbn all "..."&recordSchema=unimarcxchange
        BnF-->>Server: publisher, page count, subject heading, French blurb
    end
    alt still missing fields
        Server->>OL: GET /search.json?isbn=...
        OL-->>Server: title, authors, subjects, publisher... (metadata only)
    end
    alt still incomplete or no cover, and SEARXNG_URL + FLARESOLVERR_URL are configured
        Server->>RB: Search exact quoted ISBN on renaud-bray.com via SearXNG
        RB-->>Server: Select exact ISBN product page, then read it via FlareSolverr
        RB-->>Server: Explicit product fields and validated cover (or nothing)
    end
    Server->>OL: GET /b/isbn/....-M.jpg (cover, only if no source gave one)
    Server->>Server: ensureLanguage / __ensureCategory / __getOrCreateBook / __ensureAuthors (one transaction)
    Server-->>Client: book id
```

The lookup itself lives in `server/src/utils/BookMetadata.ts`
(`lookupBookMetadata`); the BnF's UNIMARC parsing is in
`server/src/utils/BnfUnimarc.ts`.

### Three sources, merged rather than chained

It used to be a two-step fallback: Google Books, and on *any* failure, Open
Library. That is the wrong shape for what the providers actually return.
Measured on `9782824627151` (*Le boyfriend*, City roman, 2025) with a working
Google key:

| field | Google Books | Open Library | BnF |
|---|---|---|---|
| title / authors | yes | - | yes |
| description | yes | never any | yes (French blurb) |
| cover | yes | - | never any |
| language | `fr` | - | `fre` |
| publisher | **missing** | - | `City roman` |
| categories | **missing** | - | sometimes (`606$a`) |
| page count | **`0`** | - | `391` |

Open Library has nothing at all for it (`numFound: 0`), and its French trade
coverage is poor in general rather than transient. Google *finds* the book but
returns it full of holes - so a chain that only falls back when the primary
comes up empty would never have asked anyone else, and would have written
`pages = 0` and no publisher into the database.

So every provider is normalized into one `IBookMetadata` shape and merged
field by field, first writer wins (`mergeBookMetadata`).

### Renaud-Bray: final gap filler

Renaud-Bray is an optional final provider in the same `lookupBookMetadata`
chain. It runs after Google Books, the BnF and Open Library, and only when
those sources leave core metadata incomplete or provide no cover. The same
chain is used by the ISBN auto-add route (`POST /book/isbn/:isbn`) and by both
metadata refresh routes (`POST /book/:id/refresh` and admin-only bulk
`POST /book/refresh`), so there is no separate refresh-specific lookup path.

It is enabled only when both `SEARXNG_URL` and `FLARESOLVERR_URL` are set
(the homelab defaults are `http://searxng:8080` and
`http://flaresolverr:8191`). SearXNG searches for the exact quoted ISBN,
restricted to `renaud-bray.com`; only a result on `renaud-bray.com` or
`www.renaud-bray.com` with path `/Livres_Produit.aspx` is fetched. FlareSolverr
reads that selected page, which is accepted only when its JSON-LD `sku` or
`og:isbn` exactly matches the normalized requested ISBN.

Only explicit product fields are mapped: title, author, description, category,
publisher, publication date, page count and cover. Missing fields remain
missing; no category, language, format or cover is guessed. First-writer-wins
merging preserves values already supplied by earlier providers. A direct cover
from `images.renaud-bray.com` is used only when no earlier provider supplied a
cover, and only after a successful image check; Renaud-Bray's `404RB.gif`
placeholder is rejected. Missing configuration skips this optional provider;
bad responses, timeouts, invalid search results and ISBN mismatches are
provider failures or empty results and do not block the other sources.

### Order, and not paying for what you don't need

**Google Books -> BnF (French ISBNs) -> Open Library.**

- **Google leads** even for French books, despite being the weakest of the
  three on them, because it is the only one of the three that returns a
  **cover**, and it answers in ~200ms. Leading with the BnF would mean either
  stopping there and losing the cover, or calling Google straight afterwards
  anyway - no request saved and a worse result.
- **The BnF is second for a French-group ISBN** (`978-2`, which is French *as
  a language* - France, Belgium, Québec, Romandy - or `979-10`, France only),
  where it is strong and Open Library is empty. For any other ISBN it is
  skipped entirely unless nothing was found at all: its `bib.isbn` index is
  built from French legal deposit and returns zero records for `978-0` and
  `978-3` ISBNs, so a round trip there is latency for nothing - and Scan mode
  fires these back-to-back.
- **A provider is skipped once there is nothing left to fill**
  (`isBookMetadataComplete`). A book Google has whole costs exactly one
  request. `categories` and the cover are deliberately *not* part of
  "complete": two of the three sources never return either, so requiring them
  would run the whole chain every time and still come up short.

Details worth knowing:

- **Google Books needs `GOOGLE_BOOKS_API_KEY`** (see the root README's
  Prerequisites). Without it the server warns **once at startup** - not once
  per scan - and runs the lookup on the BnF and Open Library alone, which in
  practice means no cover images and thinner metadata for most books.
- **429 and 5xx from Google are retried**, up to 3 attempts. A 429 backs off
  in whole seconds (the quota needs time); a 5xx backs off in 300ms steps (it
  does not, and a scan is waiting). Google returns `503 Service temporarily
  unavailable` often enough to matter, and a 503 used to fall straight through
  to the fallback - turning a book Google has into a book nobody has.
- **`pageCount: 0` means "unknown", not "a book with no pages".** Google
  returns it for most French titles. It is collapsed to `null` at the edge, so
  the merge can be a plain `??` and the BnF's `391` wins.
- **The BnF returns no cover.** `856$u` holds an internal image id, not a URL.
  Covers come from whichever provider gave one, else Open Library's covers
  API - which for a French trade title often has none either. Uploading one by
  hand is the intended answer.
- **UNIMARC, not Dublin Core.** The same endpoint serves `dublincore`, which
  glues the cataloguing statement of responsibility onto everything
  (`"Le boyfriend / Freida McFadden ; traduit de l\'anglais par Karine
  Xaragai"`). UNIMARC keeps title, author and translator in separate
  subfields. **No XML dependency was added**: the payload is flat, generated
  marcxchange, and a scanner that simply matches fewer fields on a malformed
  body degrades better here than a strict parser that throws on one.
- **Translators are not authors.** `7XX$4` is a relator code - `070` author,
  `730` translator, `340` scholarly editor, `205` collaborator - and only an
  author allowlist is imported. Where a record carries no role code at all,
  the tag decides (`700`/`701` are authors, `702` is "secondary
  responsibility"), and an unqualified `702` is accepted only when nothing
  else in the record qualified. That last rule is what keeps Freida McFadden
  on *L'intruse*, whose BnF record files her under `702` with no role beside a
  `702` translator marked `$c Traducteur`.
- **Page counts are parsed defensively.** `215$a` is free text
  (`"1 vol. (391 p.)"`, `"1 volume 362 p"`, `"2 vol. (823, 846 p.)"`,
  `"1 vol. (non paginé)"`). Anything that does not pin down a single figure -
  more than one volume, more than one page figure, an explicit "non paginé" -
  yields `null` rather than a wrong number.
- **Find-or-create everywhere**: category (`__ensureCategory`), author(s)
  (`__ensureAuthors`), and the book itself (`__getOrCreateBook`, matched by
  ISBN) are all find-or-create rather than blind inserts - re-scanning the
  same ISBN twice reuses the existing rows instead of creating duplicates.
- **Field truncation** (`truncate()`) protects against `VARCHAR` overflow -
  external metadata is free text with no length guarantee, so title/publisher/
  category/author names are all silently clipped to fit their columns rather
  than failing the whole insert.
- **`language_code` is normalized** to a bare 2-letter code
  (`normalizeLanguageCode`). Both the BnF (`101$a`) and Open Library
  (`language: ["eng"]`) emit **ISO 639-2/B**, the *bibliographic* variant
  whose codes come from the English or French name of the language - `fre`
  not `fra`, `ger` not `deu`, `dut` not `nld`. Those are mapped now; three-
  letter codes used to be dropped outright, which quietly cost every
  BnF-sourced and Open-Library-sourced book its language. Anything still
  unrecognised is dropped rather than overflowing `languages.code` (`CHAR(2)`).
- The whole DB side (language/category/book/authors/location) runs in **one
  transaction** - a partial book (e.g. authors linked but the book row
  missing) can't happen.

### When nothing is found

A missing API key and a genuine data gap used to be indistinguishable: both
arrived as a bare `404 "Book not found"`, and an operator who had never set
`GOOGLE_BOOKS_API_KEY` saw "No metadata found for this ISBN" with no way to
learn that the strongest source was never asked.

The status codes are unchanged - `404`, or `502` when every source that ran
failed outright - but the body now says which case it is:

```json
{
  "error": "source_not_configured",
  "message": "No metadata found, and these sources are not configured: google-books",
  "isbn": "9782824627151",
  "sourcesTried": [],
  "unconfiguredSources": ["google-books"],
  "failedSources": []
}
```

`error` is one of `no_metadata` (every configured source was asked and none
has this ISBN), `source_not_configured` (nothing found *and* a source was
skipped for want of configuration - an operator problem, not a data gap) or
`source_unavailable` (every source that ran failed; `502`, because trying
again may well work).

The client keys on the status code alone today, so this is purely additive.
To use it, `client-react` would read `ApiError.body.error` and, on
`source_not_configured`, say so instead of the current "No metadata found for
this ISBN. Add it manually instead." (`AddBookIsbnDialog`'s `OUTCOME_TEXT`,
`useScanQueue`'s 404 branch and `ScanSummary`).

## The stock lifecycle

`book_stocks.status` (`BookStockStatusEnum`, mirrored identically on client
and server):

| Value | Name | Meaning |
|---|---|---|
| `0` | `AVAILABLE` | On a shelf, not lent out or damaged. |
| `1` | `NOT_AVAILABLE` | Withdrawn from circulation. |
| `2` | `BOOKED` | Currently lent/checked out to a customer. |
| `3` | `DAMAGE` | Marked as damaged. |

A stock is created with **`POST /book/:id/stock`** - one required
`location_id`, an optional `customer_id`, and a status that may *not* be `2`
(`BOOKED`) at creation time (406 if you try) - lending happens through the
loan flow below, not by hand-crafting an already-loaned stock.

**`PUT /book/:id/stock/:stock_id`** is how status/location/customer actually
change, and it's the one place that has to reconcile three related concerns
in a single statement:

- **`loaned_at`** is set only on the transition *into* `BOOKED` (not already
  `2`) and cleared on any transition *out* of it - a `CASE` expression keyed
  off both the new and previous status, so re-saving an already-booked stock
  (e.g. just moving its shelf) doesn't reset its loan date.
- **`loan_history`** gets a matching row via `recordLoan`/`recordReturn` (see
  [`LoanHistory.ts`](../server/src/utils/LoanHistory.ts)) whenever the
  transition crosses in or out of `BOOKED` - this is what the [Loans
  report](LOANS.md) reads from, since `book_stocks` itself only remembers
  the *current* loan.

The **customer- and location-facing "add books" flows**
(`POST /customer/:id/add/books`, `POST /location/:id/add/books`, and the bulk
`POST /book/return`) are thin wrappers around the same `book_stocks` update -
see [CUSTOMERS.md](CUSTOMERS.md) and [LOCATIONS.md](LOCATIONS.md) for those.

Deleting a stock (`DELETE /book/:id/stock/:stock_id`) just removes the row -
there's no soft-delete or history entry for a stock that's discarded outright
(as opposed to returned).

## Cover images

`books.image_url` holds either:

- a **`data:image/png;base64,...` / `data:image/jpeg;base64,...` URI** - our
  own uploads, via `POST /book/:id/image` (multer, 4MB cap, PNG/JPEG only) or
  the manual-create form; stored inline, no external file storage/CDN, or
- an **external URL** from the ISBN lookup (`books.google.com`,
  `covers.openlibrary.org`, or the validated `images.renaud-bray.com` host).

`isAllowedImageUrl()` enforces that allowlist on every write to
`image_url` - accepting an arbitrary URL here would turn the book cover
`<img>` into a tracking-pixel/IP-disclosure vector and make the CSP `imgSrc`
allowlist in [`AppService.ts`](../server/src/AppService.ts) pointless. The
two are kept in sync deliberately; changing one without the other reopens
the gap.

## Ebook file backups

Independent of the cover image: a book can optionally have **one backed-up
file per type** - epub, pdf, and mobi (also used for `.azw3` Kindle files,
which share the same MOBI/KF8 container) - in `book_files`, which has a
`UNIQUE (book_id, file_type)` constraint. Uploading a file replaces any
existing file of that *same* type (`ON CONFLICT (book_id, file_type) DO
UPDATE`) but leaves the other types alone, so a book can carry an epub, a
pdf and a mobi backup at once.

- **`POST /book/:id/file`** - a single upload endpoint for all three types;
  the type is inferred from the file name's extension
  (`fileTypeFromName()`). Multer accepts files by extension
  (`.epub`/`.pdf`/`.mobi`/`.azw3`) up to `MAX_EBOOK_FILE_SIZE_MB` (default
  10MB, see `.env.example`), but the *bytes* are then checked against the
  real file signature (`isValidEpub`/`isValidPdf`/`isValidMobi` in
  [`FileSignature.ts`](../server/src/utils/FileSignature.ts)) before
  anything is persisted - extension-only checks are trivially spoofed by
  renaming any file.
  - A file over `MAX_EBOOK_FILE_SIZE_MB`, or a rejected `fileFilter` case,
    is turned into a clean `413`/`400` response by `handleUploadError()`
    (see [`UploadErrorMiddleware.ts`](../server/src/middlewares/UploadErrorMiddleware.ts))
    placed right after `fileUpload.single("file")` - without it, multer's
    error would fall through to Express's default handler as a bare 500,
    since this app registers no app-wide error middleware. The same helper
    also covers the cover-image and profile-picture uploads.
  - PDF: does the buffer contain the `%PDF-` header within the first 1KB.
  - EPUB: is it a zip whose *first* entry is an uncompressed file literally
    named `mimetype` containing `application/epub+zip` (the EPUB OCF spec) -
    stronger than just checking the zip signature, since that alone would
    accept a `.docx`/`.jar`/plain zip renamed to `.epub`.
  - MOBI/AZW3: does the buffer carry the `BOOKMOBI` identifier at byte
    offset 60 - the PalmDOC/MOBI header both formats share (AZW3 still
    wraps a MOBI6 header for backward compatibility).
- **`GET /book/:id/file/:fileId/download`** streams one file's raw bytes
  back with `Content-Disposition: attachment`.
- **`DELETE /book/:id/file/:fileId`** removes one file.

On the client,
[`BookFilesCard.tsx`](../client-react/src/features/book/BookFilesCard.tsx)
renders every uploaded file as a row (type, name, size/date) with download and
delete actions and an "add file" control. The old client's in-browser preview
(`epubjs`) is **not** ported: the rewrite design keeps `epubjs` but defers it,
and a reader is its own screen. Download is the only way to open a file today.

## Search, counters, and filters

- **`GET /book/search`** - paginated (50/page), filterable by free-text
  `query` (matches name or ISBN), `category_id` (one or more), a date range,
  and `sort` (`SortType`: `NAME_ASC` default, `NAME_DESC`, `DATE_NEWEST`,
  `DATE_OLDEST`).
- **`filters`** (comma-separated `SearchFilter` values) layer on top:

  | Filter | Meaning |
  |---|---|
  | `NO_STOCK` | Books with zero stock entries. |
  | `HAS_STOCK` | Books with at least one stock entry. |
  | `ON_LOAN` | Books with at least one stock currently `BOOKED`. |
  | `RECENT` | Added in the last 30 days. |

- **`GET /book/counters`** - four cheap counts (`total`, `recent`, `onLoan`,
  `noStock`) summarising the library - deliberately separate from `/search` so
  showing them doesn't need a full paginated query on every page load. The
  React client reads them on the dashboard
  ([`CounterTiles.tsx`](../client-react/src/features/dashboard/CounterTiles.tsx));
  the search screen's own controls map onto the `filters` above, see
  [`searchParams.ts`](../client-react/src/features/search/searchParams.ts).

## Stock-code entry

`GET /book/:bookCode/add/md` is the lookup that turns a *stock code* (not an
ISBN) into a book + single stock, used by the "add to customer/location" flows
so the UI can show what was just entered before committing the add.

The old client fronted every one of those fields with `BarcodeScanner.vue`, a
camera scanner built on `html5-qrcode`. **The React client has no scanner**: the
rewrite design replaces `html5-qrcode` with `BarcodeDetector` plus a
`@zxing/browser` fallback, and that has not landed. Typed entry is what exists,
and it was always the path a denied camera permission, a laptop without one, or
a scuffed barcode had to fall back to - so a scanner returning will be an
addition to these fields, not a replacement for them. The relevant dialogs each
carry a note saying so.

## Printing labels

Each stock's `code` is meant to be printable as a barcode label - the old client
rendered one `<canvas>` per label with `jsbarcode`, laid the sheet out into a PDF
with `jsPDF`, and never involved the server.

**Not ported to the React client.** Neither dependency is installed, and the
print queue is its own screen rather than a control on the book page (see the
note in
[`BookStocksCard.tsx`](../client-react/src/features/book/BookStocksCard.tsx)).
`book_stocks.code` is unchanged and still globally unique, so nothing about the
data blocks this coming back.

## Where this lives in code

| Concern | File |
|---|---|
| All book/stock endpoints, ISBN lookup, image/file upload | `server/src/routes/BooksRoute.ts` |
| ISBN checksum validation | `server/src/utils/IsbnVerification.ts` |
| Epub/PDF content sniffing | `server/src/utils/FileSignature.ts` |
| `loan_history` bookkeeping | `server/src/utils/LoanHistory.ts` |
| `books`/`book_stocks`/`book_authors`/`book_files` schema | `assets/db/databaseSchema.sql` |
| Client: `/book` and `/book/search` HTTP clients | `client-react/src/api/book.ts`, `client-react/src/api/search.ts` |
| Client: query hooks + cache keys | `client-react/src/queries/book.ts`, `client-react/src/queries/search.ts` |
| Client: routes | `client-react/src/routes/_app/book.$book_id.tsx`, `client-react/src/routes/_app/library.search.tsx` |
| Client: catalog search page | `client-react/src/features/search/SearchScreen.tsx`, `SearchControls.tsx`, `BookGrid.tsx`, `searchParams.ts`, `AddBookIsbnDialog.tsx`, `AddBookManuallyDialog.tsx` |
| Client: ISBN checksum (client-side pre-check) | `client-react/src/features/search/isbn.ts` |
| Client: book detail + stock UI | `client-react/src/features/book/BookScreen.tsx`, `BookMetaCard.tsx`, `BookFields.tsx`, `BookCover.tsx`, `BookStocksCard.tsx`, `StockDialog.tsx`, `BookFilesCard.tsx`, `AuthorPicker.tsx` |
| Client: camera barcode scanner | *not ported* - see [Stock-code entry](#stock-code-entry) |
| Client: label printing | *not ported* - see [Printing labels](#printing-labels) |
