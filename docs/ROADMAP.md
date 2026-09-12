# Roadmap

Ideas for where Vaultisse could go next. Nothing here is scheduled or assigned —
these are open invitations for contributors to pick up, discuss, and design. If
you'd like to work on one, open an issue first to align on approach before
sending a pull request (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

Have an idea that isn't listed? Open an issue — see
[Suggesting features](CONTRIBUTING.md#suggesting-features).

> **This is a fork.** The list below is upstream
> [AlbertAmat/vaultisse](https://github.com/AlbertAmat/vaultisse)'s roadmap, kept
> as upstream maintains it — the checkboxes track *upstream*, not this fork, and
> are deliberately left unticked. Three of the items are already implemented
> here:
>
> - **#7 Library sharing** — implemented, but not as described. Upstream proposes
>   N libraries with membership; this fork has exactly one library per instance,
>   which *is* the instance, with membership being "has an account here". That
>   removes the `libraries` table, the membership table, the library switcher and
>   per-request library resolution the general version would need, so this is a
>   different feature that solves the same household problem — not a head start
>   on upstream's.
> - **#8 Admin panel** — implemented. `users.role` is `admin` or `user`, the
>   first account to register becomes admin, and `/app/admin` lists accounts and
>   can approve, enable/disable, promote/demote and delete them. There are no
>   library-level roles, because with one shared library there is no second axis.
> - **#12 Disable new users by default** — implemented as
>   `REGISTRATION_REQUIRES_APPROVAL` (off by default), with the admin panel above
>   as the approval UI. The first account is exempt, since otherwise nobody could
>   approve it.
>
> See [AUTHENTICATION.md](AUTHENTICATION.md#roles-and-the-admin-panel) and
> [the shared-library design](superpowers/specs/2026-09-11-shared-library-admin-mobile-design.md)
> for the details, and the same spec's "Out of scope" for what was deliberately
> *not* built: multiple libraries, library-level roles, and invitations (#6).

## Integrations

- [ ] **Kindle and Kobo integration** ([#1](https://github.com/AlbertAmat/vaultisse/issues/1))
  — sync with the most common e-reader platforms. Automatically mark a book as
  read once it's finished on the device, and surface e-books that exist on the
  device but haven't been added to Vaultisse yet, so they can be imported with
  one click.
- [ ] **OPDS feed support** ([#14](https://github.com/AlbertAmat/vaultisse/issues/14))
  — serve the library as an OPDS feed so it can be read in other apps and
  e-readers.
- [ ] **Webhooks/API for automation** ([#15](https://github.com/AlbertAmat/vaultisse/issues/15))
  — webhooks and/or a machine-to-machine API to enable automation.

## Security & accounts

- [ ] **Security review** ([#2](https://github.com/AlbertAmat/vaultisse/issues/2))
  — an independent pass by a security-minded contributor to audit
  authentication, session handling, and the REST API for vulnerabilities, and
  harden anything that's found. See [SECURITY.md](../SECURITY.md) for how to
  report anything found privately rather than as a public issue.
- [ ] **Single sign-on (SSO)** ([#3](https://github.com/AlbertAmat/vaultisse/issues/3))
  — log in with Google or GitHub as an alternative to email/password.
- [ ] **Email verification** ([#4](https://github.com/AlbertAmat/vaultisse/issues/4))
  — confirm a user's email address on registration.
- [ ] **Email notifications** ([#5](https://github.com/AlbertAmat/vaultisse/issues/5))
  — notify users by email for account events, such as confirming an account
  action completed successfully or confirming account deletion.
- [ ] **Disable new users by default** ([#12](https://github.com/AlbertAmat/vaultisse/issues/12))
  — new registrations are created disabled until an administrator activates
  them.
- [ ] **Registration activation email** ([#11](https://github.com/AlbertAmat/vaultisse/issues/11))
  — notify a new registrant that admin activation is required before they can
  log in.

## Collaboration

- [ ] **Account invitations** ([#6](https://github.com/AlbertAmat/vaultisse/issues/6))
  — let an existing user invite someone else to the app by email.
- [ ] **Library sharing** ([#7](https://github.com/AlbertAmat/vaultisse/issues/7))
  — let multiple accounts manage the same collection of books together.
  Example: a family shares one book repository for the home, and every family
  member can add, borrow, and manage books in it.

## Library management

- [ ] **CSV import/export** ([#17](https://github.com/AlbertAmat/vaultisse/issues/17))
  — import and export the library via CSV.
- [ ] **Audiobook support** ([#16](https://github.com/AlbertAmat/vaultisse/issues/16))
  — playback, variable speed, sleep timer, and chapter navigation.
- [ ] **Duplicate detection** ([#13](https://github.com/AlbertAmat/vaultisse/issues/13))
  — detect and surface duplicate items across the library.

## Admin

- [ ] **Admin panel** ([#8](https://github.com/AlbertAmat/vaultisse/issues/8))
  — a UI for managing users and app-wide settings without going through the
  database directly.

## Internationalization

- [ ] **German translation** ([#9](https://github.com/AlbertAmat/vaultisse/issues/9))
- [ ] **French translation** ([#10](https://github.com/AlbertAmat/vaultisse/issues/10))

  See [Adding a new language](CONTRIBUTING.md#adding-a-new-language) for how
  translations work.
