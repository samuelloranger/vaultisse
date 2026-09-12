import type { BooksInMonth } from '@/api/types'

/**
 * Turning `/dashboard`'s `booksInTime` into something a chart can draw.
 *
 * Kept apart from the chart component on purpose: every rule that decides what
 * the trend *says* lives here as a pure function, so the two cases that break
 * charts — no data at all, and exactly one point — are unit-testable without a
 * canvas. `BooksInTimeChart` only paints what this returns.
 */

/** One bar: a month bucket and how many books were added in it. */
export type TrendPoint = {
  /** `2026-09` — the bucket key, stable and timezone-free. */
  key: string
  /** Axis tick, e.g. `Sep`. */
  label: string
  /** Tooltip title and screen-reader text, e.g. `September 2026`. */
  fullLabel: string
  count: number
}

/**
 * The window is capped here rather than in the component so the mobile and
 * desktop chart are the same code path with a different number.
 */
export type TrendWindow = {
  /** How many month buckets to show at most. */
  months: number
  /** "Now", injectable so the tests are not a function of the wall clock. */
  now?: Date
  /** Stored user locale, supplied by the locale seam. */
  locale?: string
}

/**
 * `2026-09`, in UTC.
 *
 * UTC is not incidental. The server sends month buckets as UTC midnight
 * (`2026-09-01T00:00:00.000Z`), and every timezone west of Greenwich turns that
 * into the *previous* month under local formatting — the September bar would be
 * labelled "Aug" for every user in the Americas, which is where this app is
 * used. Every date read in this file is therefore a UTC read.
 */
function monthKey(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addMonths(date: Date, delta: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1))
}

/**
 * Expand the server's sparse list into the contiguous run of months the chart
 * draws.
 *
 * Three decisions, all of them about not lying:
 *
 *  - **Gaps are filled with zero.** The server only sends months that have
 *    books, so a library that added nothing in October sends September then
 *    November. Drawn as adjacent bars those two read as consecutive months and
 *    the quiet month disappears. A month with no books is a fact about the
 *    trend, so it gets a bucket.
 *  - **The window ends at the current month, not at the last month with data.**
 *    Same reason: "nothing has been added since June" is the most interesting
 *    thing such a chart can say, and ending the axis at June hides it.
 *  - **The window starts no earlier than the first month with data.** A new
 *    instance has one month of history; padding it out to six would invent five
 *    months of "no books added" for a period before the library existed. So a
 *    one-point series draws exactly one bar, and the axis grows as the library
 *    does until it reaches `months`.
 *
 * An empty input returns an empty array — there is no honest chart for "no data
 * at all", and the caller renders prose instead.
 */
export function buildTrendSeries(
  booksInTime: BooksInMonth[],
  { months, now = new Date(), locale = 'en-US' }: TrendWindow
): TrendPoint[] {
  if (booksInTime.length === 0 || months < 1) return []

  const counts = new Map<string, number>()
  let earliest: Date | null = null

  for (const entry of booksInTime) {
    const parsed = new Date(entry.month)
    // A malformed month would otherwise poison the whole axis with `NaN` ticks.
    if (Number.isNaN(parsed.getTime())) continue
    const start = monthStart(parsed)
    const key = monthKey(start)
    counts.set(key, (counts.get(key) ?? 0) + entry.total_books)
    if (!earliest || start < earliest) earliest = start
  }

  if (!earliest) return []

  const current = monthStart(now)
  // Data stamped in the future (clock skew, a seeded fixture) must not make the
  // window run backwards.
  const end = current >= earliest ? current : earliest
  const windowStart = addMonths(end, -(months - 1))
  const start = windowStart > earliest ? windowStart : earliest

  const series: TrendPoint[] = []
  const short = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  for (let cursor = start; cursor <= end; cursor = addMonths(cursor, 1)) {
    const key = monthKey(cursor)
    series.push({
      key,
      label: short.format(cursor),
      fullLabel: long.format(cursor),
      count: counts.get(key) ?? 0,
    })
  }

  return series
}

/** The one-sentence version of the chart, for screen readers and for tests. */
export function describeTrend(series: TrendPoint[]): string {
  if (series.length === 0) return 'No books have been added yet.'
  const total = series.reduce((sum, point) => sum + point.count, 0)
  const span =
    series.length === 1
      ? series[0].fullLabel
      : `${series[0].fullLabel} to ${series[series.length - 1].fullLabel}`
  const books = total === 1 ? '1 book' : `${total} books`
  const detail = series.map((p) => `${p.fullLabel}: ${p.count}`).join(', ')
  return `Books added per month, ${span}. ${books} in total. ${detail}.`
}

/**
 * The short visible caption under the chart.
 *
 * Deliberately not the same string as {@link describeTrend}: that one is the
 * chart's `aria-label` and has to carry every value, because a screen-reader
 * user gets nothing from the canvas. Printing all of that on screen as well
 * would put a paragraph of numbers under a picture of the same numbers.
 */
export function trendCaption(series: TrendPoint[]): string {
  if (series.length === 0) return ''
  const total = series.reduce((sum, point) => sum + point.count, 0)
  const books = total === 1 ? '1 book' : `${total} books`
  if (series.length === 1) return `${books} in ${series[0].fullLabel}`
  return `${books} over the last ${series.length} months`
}
