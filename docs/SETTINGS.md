# Settings

Self-service account management: profile, UI preferences, and the two
feature toggles that change what the rest of the app shows. This document
covers everything under `/user` **except** sessions, password, and
two-factor auth - those are security-critical enough to have their own
write-up in [AUTHENTICATION.md](AUTHENTICATION.md); this one is the rest of
`UserRoute.ts`.

## Contents

- [Profile](#profile)
- [UI preferences](#ui-preferences)
- [The leasing toggle](#the-leasing-toggle)
- [Deleting an account](#deleting-an-account)
- [Security notice acknowledgement](#security-notice-acknowledgement)
- [Where this lives in code](#where-this-lives-in-code)

## Profile

| Endpoint | Purpose |
|---|---|
| `PUT /user` | Update `name`, `email`, `language`, `region`. |
| `POST /user/image` | Upload/replace the profile picture (multer, 2MB cap, PNG/JPEG only), stored as raw bytes in `users.image`. |
| `DELETE /user/image` | Clear it (`users.image = NULL`). |

`users.image` is converted to a `data:image/png;base64,...` URL on read
(`getUser()` in [`AppRoute.ts`](../server/src/routes/AppRoute.ts), part of
the [policy bootstrap](CATALOG.md#the-policy-bootstrap)) - the client never
deals with raw bytes.

`language` is stored and offered in the picker
([`ProfileCard.tsx`](../client-react/src/features/settings/ProfileCard.tsx)'s
`UI_LANGUAGES`, which is the four *UI* locales and deliberately not the policy's
22-entry *book* language list), but changing it does not change what's on screen
yet: the React client fetches the policy's `labels` map and doesn't render from
it. See the root README's
[Internationalization](../README.md#internationalization) section.

## UI preferences

Two small per-user toggles, each its own `PATCH` endpoint so the client can
persist an instant, optimistic UI change independently of the rest of the
profile form:

- **`PATCH /user/theme`** - `"beige"` or `"library"` (400 on anything else).
  The names carried over exactly: `beige` *is* the React client's light theme
  and `library` *is* its dark one, both ported in
  [`theme/palette.ts`](../client-react/src/theme/palette.ts). The picker offers a
  third choice, "System", which has no column value - it persists whichever of
  the two is currently resolved
  ([`AppearanceCard.tsx`](../client-react/src/features/settings/AppearanceCard.tsx)).
- **`PATCH /user/sidebar-rail`** - boolean; whether the left nav collapses
  to icon-only "rail" mode instead of staying fully expanded. **Nothing reads
  it in the React client**: the shell is a `Sheet` on phones and a persistent
  sidebar from `sm`, with no third state (see the note in
  [`AppShell.tsx`](../client-react/src/components/AppShell.tsx)). The endpoint
  and column are still there for it to come back to.

Theme is applied client-side immediately for instant feedback, then persisted in
the background purely so a new device starts out right - it doesn't block on the
request completing, and the locally chosen value wins if the two disagree.

## The leasing toggle

**`PATCH /user/leasing`** - `{ "leasingEnabled": true | false }`. Off by
default: plenty of households just track a collection and never lend books
to anyone.

Despite living under `/user` (and being served to the client inside the
policy payload's `user` object, so nothing consuming it had to change), this is
**not** a per-account preference. It's persisted as
`app_settings.leasing_enabled` in a single-row table, and flipping it changes
what every account sees - which is the point, since the loan data itself is
shared. Same for `app_settings.is_public_institution`.

Flipping this on/off changes what the rest of the app shows, not just a
Settings checkbox - see
[CUSTOMERS.md](CUSTOMERS.md#leasing-is-opt-in) for the nav-item and
route-guard behavior this controls.

## Deleting an account

**`DELETE /user`** removes the `users` row outright and redirects to
`/login`. There's no soft-delete, export prompt, or confirmation step at the
API level (the client is expected to confirm before calling this).

**It does not delete the account's contributions.** The account's own data -
sessions, backup codes, acknowledgements - cascades away with it, but the ten
library tables reference it through a nullable `created_by` with
`ON DELETE SET NULL`, so its books, stocks, files, locations, customers and
loan history stay in the shared library and simply lose their attribution.
Under one shared collection the alternative would mean removing a member
empties the household's shelves - see
[the shared-library design](superpowers/specs/2026-09-11-shared-library-admin-mobile-design.md#the-cascade-trap).

## Security notice acknowledgement

**`POST /user/security-notice/accept`** - idempotent acknowledgement of the
security-measures notice shown after login when the instance is flagged as a
public institution (`app_settings.is_public_institution`). `GET /app/policy` reports
whether it's still pending as `user.securityNoticeAccepted`; see `AppRoute.ts`'s
`getUser()`/`recordSecurityNoticeSent()` for how the "first time shown"
timestamp is recorded (once, via `ON CONFLICT DO NOTHING`). The React client
carries the flag through its policy type but has no dialog for it yet, so the
notice isn't shown and the endpoint isn't called.

## Where this lives in code

| Concern | File |
|---|---|
| Profile, preferences, leasing toggle, account deletion, security notice | `server/src/routes/UserRoute.ts` |
| Session list/revoke, password change, 2FA | `server/src/routes/UserRoute.ts` - see [AUTHENTICATION.md](AUTHENTICATION.md) instead |
| `users` schema | `assets/db/databaseSchema.sql` |
| Client: `/user` HTTP client | `client-react/src/api/user.ts` |
| Client: query hooks + cache keys | `client-react/src/queries/user.ts` |
| Client: settings route | `client-react/src/routes/_app/settings.tsx` |
| Client: settings page UI | `client-react/src/features/settings/SettingsScreen.tsx`, `ProfileCard.tsx`, `AppearanceCard.tsx`, `LendingCard.tsx`, `SettingsControls.tsx`, `DeleteAccountDialog.tsx` |
| Client: theme definitions | `client-react/src/theme/palette.ts`, `client-react/src/theme/tamagui.config.ts`, `client-react/src/theme/ThemeProvider.tsx` |
