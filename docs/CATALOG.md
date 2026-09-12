# Catalog reference data

Categories, authors, languages, and formats - the small lookup tables every
book references. Individually trivial (each is close to the simplest CRUD
possible); documented together because they share one pattern and one
delivery mechanism: the app-policy bootstrap.

## Contents

- [Two kinds of reference data](#two-kinds-of-reference-data)
- [Categories](#categories)
- [Authors](#authors)
- [Languages & formats](#languages--formats)
- [The policy bootstrap](#the-policy-bootstrap)
- [Where this lives in code](#where-this-lives-in-code)

## Two kinds of reference data

- **Shared** (`categories`, `authors`): one list for the whole instance,
  full CRUD, editable by any account. Names are unique instance-wide
  (`unique_category_name`, `unique_author_name`), so two members each adding
  "Fantasy" - or "Ursula K. Le Guin" - land on the same row rather than
  creating parallel ones the books then split across. `created_by` records
  who added it and is never filtered on; see
  [the shared-library design](superpowers/specs/2026-09-11-shared-library-admin-mobile-design.md).
- **Global** (`languages`, `formats`): one shared table for the whole
  deployment, read-only from the client's perspective - there's no
  `POST`/`PUT`/`DELETE` for either in the REST API today. New language rows
  are created implicitly by the [ISBN lookup](BOOKS.md#isbn-auto-lookup)
  (`ensureLanguage()`) when a book's detected language isn't already present.

## Categories

Straight CRUD at `/category` ([`CategoriesRoute.ts`](../server/src/routes/CategoriesRoute.ts)):
`GET`/`POST`/`PUT /:id`/`DELETE /:id`, each row just `{id, name}`. Used to
group books by genre/shelving section (`books.category_id`) and referenced
throughout search (`GET /book/search?category_id=`) and the
[dashboard's category shelves](DASHBOARD.md).

Deleting a category doesn't cascade to books - `books.category_id` is
nullable, so a book left without its category just becomes uncategorized
rather than being deleted itself (verify against the schema before relying
on this if you're changing the FK).

## Authors

Same CRUD shape at `/author`
([`AuthorRoute.ts`](../server/src/routes/AuthorRoute.ts)), plus one extra:

- **`POST /author/search`** - case-insensitive substring match on `name`,
  used by the author picker/autocomplete when editing a book
  (`{ "query": "tolk" }` → any author whose name contains "tolk").

The book-to-author relationship is many-to-many via `book_authors`, resolved
on `PUT /book/:id` by diffing the submitted author id list against the
existing associations (see [BOOKS.md](BOOKS.md)) - this route never touches
`book_authors` itself, only the `authors` table's own rows.

## Languages & formats

Both are flat `{code/id, name}` tables with no per-user data, fetched as
part of the [policy bootstrap](#the-policy-bootstrap) rather than through
their own dedicated list endpoints. `languages.code` is a `CHAR(2)` (ISO
639-1); `formats` is an arbitrary short id/name pair (e.g. "Paperback",
"Hardcover", "Electronic" - the client matches a book's `format_id` against
the name `"Electronic"` to decide it's an ebook edition, see
`ELECTRONIC_FORMAT` in
[`BookScreen.tsx`](../client-react/src/features/book/BookScreen.tsx)).

## The policy bootstrap

All four of these lists - plus the current user's profile and UI label
translations - are delivered together in one payload, fetched once right
after login:

**`GET /app/policy`** ([`AppRoute.ts`](../server/src/routes/AppRoute.ts))
returns `{ user, categories, languages, formats, locations, customers, labels }`.
Each section is fetched independently and defaults to `[]`/`{}` on its own
failure (a try/catch per section) - one failing sub-query (say, a locations
table hiccup) degrades that one dropdown instead of blocking login entirely.

On the client the payload is a single TanStack Query
([`queries/app.ts`](../client-react/src/queries/app.ts)), not a singleton
service. The authenticated layout's route loader awaits it before any screen
renders, so `usePolicy()` resolves from cache everywhere; `staleTime` is 5
minutes and it refetches on window focus, which is what keeps one member's new
category from being invisible to another until a full reload. Any mutation that
changes a reference list invalidates `policyKeys.all` rather than editing a
local copy. See
[CLIENT-ARCHITECTURE.md](CLIENT-ARCHITECTURE.md#the-policy-bootstrap)
for how that fits into app startup.

The `labels` map is fetched with the rest of the payload but nothing reads it
yet — the React client's strings are hardcoded English until the label lookup
replacing `vue-i18n` lands.

## Where this lives in code

| Concern | File |
|---|---|
| Category CRUD | `server/src/routes/CategoriesRoute.ts` |
| Author CRUD + search | `server/src/routes/AuthorRoute.ts` |
| Policy bootstrap (languages, formats, locations, customers, labels, user) | `server/src/routes/AppRoute.ts` |
| `categories`/`authors`/`book_authors`/`languages`/`formats` schema | `assets/db/databaseSchema.sql` |
| Client: `/category`, `/author` HTTP clients | `client-react/src/api/category.ts`, `client-react/src/api/author.ts` |
| Client: query hooks + cache keys | `client-react/src/queries/category.ts`, `client-react/src/queries/author.ts`, `client-react/src/queries/keys.ts` |
| Client: `/app/policy` as a query (no singleton) | `client-react/src/api/app.ts`, `client-react/src/queries/app.ts` |
| Client: categories/authors routes | `client-react/src/routes/_app/categories.tsx`, `client-react/src/routes/_app/authors.tsx` |
| Client: categories/authors page UI | `client-react/src/features/categories/CategoriesScreen.tsx`, `client-react/src/features/authors/AuthorsScreen.tsx`, `client-react/src/features/entityList/` |
