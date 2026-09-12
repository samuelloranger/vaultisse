/**
 * An ISO timestamp as a date a person reads, in their own locale.
 *
 * `toLocaleDateString` with no explicit locale, deliberately: the library's
 * labels come from the database per user language, but a *date* should follow
 * the device, which is what the reader's calendar app and lock screen use. A
 * hardcoded `en-US` would print 09/11/2026 to a québécois household that writes
 * it the other way round.
 *
 * Returns an em dash for the two values the API can legitimately send in a date
 * slot — `null` for a copy marked on loan with no `loaned_at`, and anything
 * unparseable — rather than the literal "Invalid Date" the old client rendered.
 */
export function formatLoanDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString()
}
