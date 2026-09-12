# Borrowers & lending

Who a book is currently lent to, and how borrowers are organized into
groups. This - along with [LOCATIONS.md](LOCATIONS.md) and
[LOANS.md](LOANS.md) - is part of the opt-in "leasing" feature set (see
[below](#leasing-is-opt-in)); most solo collectors never turn it on.

## Contents

- [Mental model](#mental-model)
- [Borrower groups](#borrower-groups)
- [Lending and returning books](#lending-and-returning-books)
- [Leasing is opt-in](#leasing-is-opt-in)
- [Where this lives in code](#where-this-lives-in-code)

## Mental model

A `customers` row is a borrower - a person (or, loosely, any named
borrower) a book can be lent to. There's no login, email, or account behind
a borrower; it's just a name the household tracks. Borrowers, groups and
loans are shared like the rest of the library: any account can add a
borrower, lend a copy out, and take it back, and everyone sees the same
outstanding loans. `customers.created_by` is attribution only.

"Currently has a book on loan" isn't a column on `customers` - it's derived
from `book_stocks`: a stock is on loan to a borrower exactly when its
`status = 2` (`BOOKED`, see [BOOKS.md](BOOKS.md#the-stock-lifecycle)) and
`customer_id` points at them. There's no separate "loan" table for the
*current* state - `loan_history` (see [LOANS.md](LOANS.md)) is a parallel,
append-only log of the same events, kept for reporting, not the source of
truth for "who has what right now."

## Borrower groups

`customer_groups` is a simple, optional way to organize borrowers - e.g. a
school library might group borrowers by class ("Class 4B"). CRUD lives at
`/customer/group` (`GET`/`POST`/`PUT`/`DELETE`), plus two endpoints to move
a borrower in and out of a group:

- **`PUT /customer/:id/group/:groupId`** - assign.
- **`DELETE /customer/:id/group`** - unassign (sets `group_id` to `NULL`).

Deleting a group (`DELETE /customer/group/:id`) does **not** delete its
members - their `customers.group_id` just goes back to `NULL` (an `ON DELETE
SET NULL` foreign key), so removing a group is safe to do even with active
members in it.

Group names are unique **instance-wide** (`unique_customer_group_name UNIQUE
(name)`), not per account - the library is shared, so two members each creating
"Class 4B" would otherwise split the same group in two. `POST`/`PUT` surface the
Postgres unique violation (`error.code === '23505'`) as a 409 rather than a
generic 500.

`GET /customer/group` returns each group with a `total_customers` count
(a `LEFT JOIN` + `COUNT`, not a stored counter, cast `::int` server-side), shown
on each group row in
[`CustomersScreen.tsx`](../client-react/src/features/customers/CustomersScreen.tsx).
Expanding a group opens
[`CustomerGroupMembersPanel.tsx`](../client-react/src/features/customers/CustomerGroupMembersPanel.tsx),
which replaces the old client's HTML5 drag-and-drop assignment — that fired no
events on touch, so it was never usable on a phone.

## Lending and returning books

Three ways a book ends up on loan or comes back, all in
[`CustomerRoute.ts`](../server/src/routes/CustomerRoute.ts) or
[`BooksRoute.ts`](../server/src/routes/BooksRoute.ts):

| Action | Endpoint | What it does |
|---|---|---|
| Lend a batch to a borrower | `POST /customer/:id/add/books` | For each scanned/typed stock code: `book_stocks.status = 2`, `customer_id = <id>`, `loaned_at = NOW()`. Also writes a `loan_history` row per book (`recordLoan`). |
| List what a borrower currently holds | `GET /customer/:id/books` | Joins `book_stocks`/`books` on `customer_id`. |
| Return one book | `DELETE /customer/:id/book/:bookStockCode` | Clears `customer_id`, `status → 0`, `loaned_at → NULL`. Closes the matching `loan_history` row (`recordReturn`). |
| Bulk-return several books | `POST /book/return` (BooksRoute.ts) | Same as above, by stock code, not scoped to one borrower - used when a borrower brings back several books from different loans at once. |

The lending flow is stock-code-driven end to end: the UI takes a stock `code`
(see [Stock-code entry](BOOKS.md#stock-code-entry)), looks it up with
`GET /book/:bookCode/add/md` to show what's about to be added, then submits
the batch. Nothing here requires knowing a book's catalog id - the stock code
is the only identifier the physical workflow needs.

Every lend/return here writes to `loan_history` via the shared
[`recordLoan`/`recordReturn`](../server/src/utils/LoanHistory.ts) helpers -
see [LOANS.md](LOANS.md) for why that table exists separately from
`book_stocks` and what reads it.

## Leasing is opt-in

Lending is off by default - plenty of households just track a collection and
never lend anything out. An administrator toggles it in **Admin > Library**
([`AdminLibraryTab.tsx`](../client-react/src/features/admin/AdminLibraryTab.tsx))
through `PATCH /admin/settings` with `leasingEnabled`.

This is an *instance* setting, not a per-account one: with one shared library, a
member who turned lending off while another had it on would just be hiding
shared loan data from themselves. It persists to `app_settings.leasing_enabled`
(see [SETTINGS.md](SETTINGS.md#the-leasing-toggle)) and applies to everyone.
`PATCH /user/leasing` is the retired compatibility name; the React client does
not expose it.

The flag was never an authorization boundary - the loan endpoints stay reachable
to any authenticated account regardless of it. In the React client it is a
navigation boundary: it hides the **Borrowers** and **Loans** nav items and the
`/customers` and `/loans` routes redirect to the dashboard while lending is off.
It also controls whether a borrower is shown against a copy on the book detail page
([`BookStocksCard.tsx`](../client-react/src/features/book/BookStocksCard.tsx)).

## Where this lives in code

| Concern | File |
|---|---|
| Borrower/group CRUD, lend/return endpoints | `server/src/routes/CustomerRoute.ts` |
| `loan_history` bookkeeping | `server/src/utils/LoanHistory.ts` |
| `customers`/`customer_groups` schema | `assets/db/databaseSchema.sql` |
| Client: `/customer` HTTP client | `client-react/src/api/customer.ts` |
| Client: query hooks + cache keys | `client-react/src/queries/customer.ts` |
| Client: borrowers route | `client-react/src/routes/_app/customers.tsx` |
| Client: borrowers page UI | `client-react/src/features/customers/CustomersScreen.tsx`, `CustomerControls.tsx`, `CustomerBooksPanel.tsx`, `CustomerGroupMembersPanel.tsx`, `CustomerLendBooksDialog.tsx`, `CustomerMoveToGroupDialog.tsx` |
| Client: leasing feature toggle | `client-react/src/features/admin/AdminLibraryTab.tsx`, `client-react/src/api/admin.ts` |
