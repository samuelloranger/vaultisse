# Shared library, admin panel, and mobile pass

Fork-only design. Upstream Vaultisse gives every account a private, fully
isolated library. This fork turns the instance into **one shared collection**
that every account co-manages, adds an application-level admin role, and fixes
the mobile UI.

## Contents

- [Why](#why)
- [1. One shared library](#1-one-shared-library)
- [2. Admin panel and roles](#2-admin-panel-and-roles)
- [3. Mobile and design pass](#3-mobile-and-design-pass)
- [4. Upstream security report](#4-upstream-security-report)
- [Out of scope](#out-of-scope)

## Why

The deployment is a household. One physical bookshelf, several people. Upstream's
model — where Alice and Bob each see a different library — is the wrong shape for
that: the same book gets entered twice, and nobody can see what anyone else
borrowed.

Upstream tracks the general version of this as roadmap #7 ("Library sharing"),
which proposes N libraries with membership. This fork deliberately does **not**
build that. There is exactly one library, it is the instance, and membership is
"has an account here". That removes the `libraries` table, the membership table,
the library switcher, and the per-request library resolution that the general
version would need.

## 1. One shared library

### Schema

Ten tables carry `user_id` as a tenancy key: `books`, `book_stocks`,
`book_authors`, `book_files`, `authors`, `categories`, `locations`, `customers`,
`customer_groups`, `loan_history`.

The column is renamed `created_by` and keeps working as **attribution** ("added
by Camille") rather than tenancy. No query filters on it any more.

Five tables keep `user_id` as a genuine per-account key and are not touched:
`user_sessions`, `user_backup_codes`, `user_security_notice_acknowledgements`,
`user_terms_of_service_acknowledgements`, and `activity_log.actor_id`.

### The cascade trap

Every one of those ten FKs is `ON DELETE CASCADE` today. That is correct when a
row belongs to one person — deleting the account should take their private
library with it.

Under a shared library it is a data-loss bug: **deleting any account would delete
every book that person ever added**, plus the stocks, files, and loan history
hanging off them, out of the collection everyone shares. Deleting a member must
not delete the household's books.

So `created_by` becomes nullable and every one of those FKs becomes
`ON DELETE SET NULL`. A row whose creator is gone renders as "added by a removed
account", not as a missing row.

### Unique constraints

Four constraints are keyed on the owner and mean "unique per person":

| Constraint | Becomes |
|---|---|
| `books_isbn_user_unique (isbn, user_id)` | `UNIQUE (isbn)` |
| `unique_user_author (user_id, name)` | `UNIQUE (name)` |
| `unique_user_category (user_id, name)` | `UNIQUE (name)` |
| `unique_user_customer_group (user_id, name)` | `UNIQUE (name)` |

Without this, two members each adding "Ursula K. Le Guin" produce two author
rows and the books split across them. The find-or-create helpers that rely on
these as lookup keys (`__getOrCreateBook`, `__ensureAuthors`, `__ensureCategory`,
and their `ImportRoute` twins) re-scope accordingly.

The covering index `idx_loan_history_user_loaned_at (user_id, loaned_at DESC)`
is rebuilt on `loaned_at` alone.

`book_stocks.code` is already globally unique and needs no change — scanning a
code in a shared library already resolves correctly.

### Server

49 `getSessionUser` call sites across 10 files scope library data. They drop the
`user_id = $n` predicate. `getSessionUser` stays for two things: stamping
`created_by` on INSERT, and the account routes in `UserRoute.ts`/`AuthRoute.ts`,
which are unchanged.

This makes the isolation bugs found during the audit
([below](#4-upstream-security-report)) unreachable by construction — there is no
longer a boundary to cross. They are still real upstream and still get reported.

### Instance settings

`users.leasing_enabled` and `users.is_public_institution` describe the
collection, not a person. With one shared library, one member toggling lending
would otherwise change the nav for themselves alone while the shared loan data
stays visible to everyone.

They move to a single-row `app_settings` table, readable by any account and
writable by an admin. The client reads them from the policy payload as it does
today, so the router guard and menu gating keep working unchanged.

### Client cache invalidation

`ApplicationService` fetches the policy once on mount, stores categories,
locations and customers in singleton fields, and never refetches. Views then
mutate those singletons locally and `splice()` deletes optimistically.

Under one writer that is fine. Under several it is wrong: a category Bob adds is
invisible to Alice until a full reload, and concurrent edits silently clobber.

Minimum fix for this pass: refetch the policy after any mutation that changes a
reference list, and on window focus. Full optimistic-concurrency handling
(ETags, conflict resolution) is out of scope.

## 2. Admin panel and roles

`users.role` is `admin` or `user`. The **first account to register becomes
admin**; without that there is no way to bootstrap one except by hand in SQL,
which is exactly what this replaces.

A `requireAdmin` middleware gates a new `/api/rest/admin/users` resource, and
`/app/admin` provides: list accounts, approve pending registrations (the
`REGISTRATION_REQUIRES_APPROVAL` flow, which today is documented as "flip the
column in psql"), enable/disable, delete, and promote/demote.

There are no library-level roles. With a single shared library, application role
is the only axis that exists. Every account that can log in can add, edit, lend,
and return books.

Deleting an account from the admin panel leaves its contributions in place — see
[the cascade trap](#the-cascade-trap).

## 3. Mobile and design pass

An audit of the 64-component client produced 38 findings. They reduce to six
root causes, fixed in this order so that the admin panel from section 2 is built
on a shell that already works on a phone:

1. **`App.vue` shell height.** `html, body { height: 100vh; overflow: hidden
   !important }`. On mobile browsers `100vh` is the *large* viewport, so the
   shell is 60-100px taller than what is visible and `overflow: hidden` means it
   can never be scrolled into view. Everything below the fold is unreachable.
   → `100dvh` with a `100vh` fallback.

2. **`PageComponent` toolbar.** `.page-toolbar` is capped at `height: 52px
   !important` (twice, including `.v-toolbar__content`) while the comment
   directly below it explains that the row is *meant* to wrap on a phone. The cap
   wins, so a wrapped second row and any button taller than 52px overflow the
   header box. Its `padding: 0 24px` also does not line up with the gutter of the
   `v-container` beneath it. → drop the cap, reconcile the gutters.

3. **Input sizing.** The server-rendered login and register pages use 15px
   inputs. iOS Safari zooms the viewport on focus for anything under 16px. 16px
   is the floor everywhere, and short fields get a real minimum height.

4. **Touch targets.** `PageComponent` forces `:deep(.v-btn) { height: 32px
   !important }` at every width, and row actions across six screens are bare
   clickable `<v-icon>`s. Measured on the book view: 14 of 14 controls under
   44px, two at 21x21.
   → scope the 32px override above `sm`; promote icons to real buttons.
   On phones, per-row edit/delete/expand collapse into one overflow menu — three
   competing controls in a 390px row is the underlying problem, not just their
   size.

5. **Dialogs.** Of ~21 `v-dialog` instances, one can go fullscreen and only via a
   manual toggle that defaults off. Combined with hard card heights (`600px` in
   `BookStockCodesDialog`, `520px` in `BookFilePreview`) this makes several
   dialogs uncompletable in landscape or on a short phone — the action row lands
   off-screen. → `:fullscreen="smAndDown"`, drop the fixed heights.

6. **Pointer-only interactions.** The book-cover upload affordance is
   `v-if="isHovering"`, so it never renders on touch. Customer-to-group
   assignment is HTML5 drag-and-drop, which fires no events on touch. Three icon
   buttons are labelled only by tooltip. → touch equivalents for each.

Alongside those, two mechanical sweeps: form input metadata (`autocomplete`,
`inputmode`, `type="email"` — currently **zero** occurrences in the client) and
Vuetify 2 residue (25 bare `small` attributes, `append-icon` instead of
`append-inner-icon`, a `<v-btn>` nested inside a `<v-btn>`).

### Design judgments

Beyond defect-fixing, three deliberate changes:

- **List rows go title-first and full-width**, with metadata on a second line.
  Today a wrapped 3-line name competes horizontally with a count chip and three
  buttons inside 390px.
- **The legal footer leaves the mobile layout** and moves into the nav drawer. It
  is `app`-positioned and always visible, costing ~90px of a short viewport on
  every screen including the barcode scanner.
- **Delete stops being permanently red** in list rows. Destructive styling on a
  resting row, adjacent to edit, invites misfires on touch.

## 4. Upstream security report

The audit found a verified cross-account leak in upstream `main` (= v1.1.4).
`BooksRoute.ts` builds `WHERE` clauses in an array joined with `' AND '`, but the
free-text clause contains a bare `OR` and nothing is parenthesised:

```sql
WHERE books.user_id = $1 AND LOWER(books.name) ILIKE $2 OR LOWER(books.isbn) ILIKE $3
```

`AND` binds tighter, so the ISBN branch carries no ownership predicate. Any
authenticated account can enumerate every book in the instance. Reproduced
against a clean dev database. The `total` count query has the same bug.

Three more, same file: `POST /book/:id/stock` never checks that `bookId` belongs
to the caller; `GET /book/:id` scopes one of six joins; `PUT /book/:id` accepts
`category_id` and `format_id` from the body without ownership checks.

This fork makes all four unreachable, but they remain live upstream. SECURITY.md
asks for private disclosure. A report with patches is prepared and **sent only on
the maintainer's explicit go-ahead from this repo's owner** — not automatically.

## Out of scope

- Multiple libraries or membership (upstream roadmap #7). One library, by design.
- Library-level roles, including a read-only viewer.
- Invitations (roadmap #6). Registration stays open or approval-gated.
- Optimistic-concurrency conflict resolution beyond refetching.
- SSO, email verification, email notifications.
