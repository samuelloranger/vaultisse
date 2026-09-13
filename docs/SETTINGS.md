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
- [Instance settings (admin only)](#instance-settings-admin-only)
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
`UI_LANGUAGES`, which is the five *UI* locales and deliberately not the policy's
22-entry *book* language list), and changing it updates what's on screen
immediately: the React client applies the policy's `labels` map after the
profile update. The selected region is applied to date and number formatting at
the same time. A missing label has an explicit English fallback; a catalogue
code is never shown to the user. Québec French is a draft pending the
row-by-row review in [FR-CA-TRANSLATION-REVIEW.md](FR-CA-TRANSLATION-REVIEW.md).

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

## Instance settings (admin only)

Everything above is a per-account preference. The settings in this section are
**not**: they live in the single-row `app_settings` table and describe the
shared collection, so changing one changes the app for every account on the
instance. `leasingEnabled` also remains in every authenticated account's
`GET /app/policy` payload because the client needs it to draw the shared nav;
the settings endpoint itself is an admin-only read and write.

**`GET /api/rest/admin/settings`** returns them; **`PATCH
/api/rest/admin/settings`** changes any subset. Both are behind `requireAdmin`
(see [AUTHENTICATION.md](AUTHENTICATION.md#roles-and-the-admin-panel)), so a
valid session that is not an admin gets a plain `403` - not a `401`, and not a
bounce to `/login`. Every successful `PATCH` writes an
`instance_settings_changed` row to `activity_log` naming the admin and the
fields they changed.

| Field | Meaning |
|---|---|
| `leasingEnabled` | Whether the Loans and Borrowers pages (and their nav items) exist. Off by default: plenty of households just track a collection and never lend books to anyone. |
| `registrationRequiresApproval` | Whether a new account is created `disabled` and has to be enabled by an admin before it can log in. |
| `defaultLanguage` | `users.language` for the next account to register. Must be a row in `app_languages`. |
| `defaultRegion` | `users.region` for the next account to register. Two uppercase letters. |
| `defaultTheme` | `users.theme` for the next account to register - `beige` (light) or `library` (dark). |

The last four describe **the next account to register** and nothing else.
Changing a default never rewrites an account that already exists: somebody who
picked their own language six months ago must not have it changed underneath
them because an admin set a different default today.

### `registrationRequiresApproval` used to be an environment variable

It was `REGISTRATION_REQUIRES_APPROVAL` in `.env`, so turning it on meant
editing a file and restarting the container, and there was no UI for it at all.
It is now `app_settings.registration_requires_approval`.

That column is **nullable**, and the NULL is load-bearing: it means "no admin
has decided yet, keep obeying the env var". `POST /register` reads
`COALESCE(registration_requires_approval, <env var>)`, so an instance upgraded
from before the column existed keeps behaving exactly as it did - a migration
that silently switched approval *off* on every such instance would be a
security regression shipped by a schema change. Writing the toggle from the
panel always writes a concrete boolean, and from that moment the database is
the only authority. `GET /admin/settings` reports
`registrationApprovalFromEnv: true` while the value is still inherited, so the
panel can say so rather than quietly showing a value it does not own.

The first account on an instance is exempt from approval either way, and is
always created as an enabled `admin`. Approval means "an admin has to enable
you", and when there is no admin yet that leaves an instance nobody can ever
log into. See `POST /register` in `AuthRoute.ts`.

### The leasing toggle was a user setting, and should not have been

Until v1.2.0 this was `PATCH /user/leasing` behind `requireAuth`, and it was
rendered on the Settings page next to the theme picker. That was wrong in a way
worth recording: the value was **already** `app_settings.leasing_enabled` -
one row for the whole instance - so any member could add or remove the Loans
and Borrowers nav entries for everybody else, from a screen that looked like it
only changed their own account.

Moving it to `/admin/settings` and moving the control into the admin panel's
**Library** tab are the same fix in two halves. Gating the endpoint alone would
have left a card that 403s for most of the people looking at it; moving the
card alone would have hidden a control the API still handed out.

The value is still served to *every* account inside `GET /app/policy`'s `user`
object - the nav cannot be drawn without it - so nothing that reads it had to
change. Only the write moved. See
[CUSTOMERS.md](CUSTOMERS.md#leasing-is-opt-in) for the nav-item and
route-guard behavior it controls.

`app_settings.is_public_institution` is the other column in that table and is
deliberately **not** in the list above: it gates a post-login security notice
that the React client has no dialog for (see below), so a toggle for it could
only ever turn on a screen that does not render. It has no endpoint at all
until that dialog is ported.

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
| Profile, preferences, account deletion, security notice | `server/src/routes/UserRoute.ts` |
| Session list/revoke, password change, 2FA | `server/src/routes/UserRoute.ts` - see [AUTHENTICATION.md](AUTHENTICATION.md) instead |
| Instance settings (admin only) | `server/src/routes/admin/AdminSettingsRoute.ts` |
| `users` and `app_settings` schema | `assets/db/databaseSchema.sql` |
| Client: `/user` HTTP client | `client-react/src/api/user.ts` |
| Client: `/admin` HTTP client | `client-react/src/api/admin.ts` |
| Client: query hooks + cache keys | `client-react/src/queries/user.ts`, `client-react/src/queries/admin.ts` |
| Client: profile route | `client-react/src/routes/_app/profile.tsx` (`settings.tsx` redirects to it) |
| Client: profile page UI | `client-react/src/features/settings/SettingsScreen.tsx`, `ProfileCard.tsx`, `AppearanceCard.tsx`, `SettingsControls.tsx`, `DeleteAccountDialog.tsx` |
| Client: admin page UI | `client-react/src/features/admin/AdminScreen.tsx` and the tabs beside it |
| Client: theme definitions | `client-react/src/theme/palette.ts`, `client-react/src/theme/tamagui.config.ts`, `client-react/src/theme/ThemeProvider.tsx` |
