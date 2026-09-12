# Task 1183 — Borrowers terminology report

## Visible copy and documentation changed

- Navigation now labels `/customers` as **Borrowers**.
- The `/customers` route document title is **Borrowers**; the screen heading,
  tab group accessibility label, and group heading are **Borrowers** and
  **Borrower groups**.
- The Loans empty state directs users to the **Borrowers** screen.
- Admin's lending-setting copy now says it adds the Loans and **Borrowers**
  sections. Dashboard, query, API, and feature comments describe the visible
  domain as borrowers.
- Updated the borrower-facing feature wording in `README.md`,
  `docs/CUSTOMERS.md`, `docs/LOANS.md`, and `docs/SETTINGS.md` while retaining
  their technical endpoint/schema references.

## Deliberately retained identifiers

- URL and generated route identity: `/customers`, `/_app/customers`, and the
  `customers` route filename/directory.
- API endpoints and payloads: `/customer`, `customers`, `customer_id`,
  `customer_groups`, and `total_customers`.
- TypeScript API/query identifiers: `Customer*`, `getCustomers`,
  `useCustomers`, `customerKeys`, and their imports.
- Test IDs, file names, database names, and server names containing `customer`.

## RED / GREEN

- RED: the new navigation, customer-screen accessibility/group-heading, and
  Admin copy expectations failed in 3 focused test files because the old
  **Customers** copy remained.
- RED: the route-title expectation failed with received title **Customers**.
- GREEN: the same focused expectations passed after the UI changes (33 tests),
  and the route-title test passed.

## Verification

- Impeccable detector: `[]` for all changed UI targets.
- Focused navigation/customer/loan/dashboard/admin suite: 7 files, 54 tests
  passed.
- Client lint and type-check passed.
- Full client suite: 22 files, 162 tests passed.
- Client production build exited 0.

## Commit

Path-scoped commit: `chore(client): rename customers to borrowers`.

## Concerns

The successful build continues to emit existing Tamagui static-extraction
diagnostics (`fileExists` / `Must provide components`), and Vitest emits jsdom
`scrollTo`/canvas notices. Neither failed its command. No server/API/database
or route-identifier renames were made.
