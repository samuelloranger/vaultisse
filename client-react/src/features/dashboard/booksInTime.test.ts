import { describe, expect, it } from 'vitest'
import { buildTrendSeries, describeTrend, trendCaption } from './booksInTime'

/**
 * The chart's edge cases live here rather than in a rendering test because they
 * are decisions about the data, and because jsdom has no canvas to draw them
 * into. What `BooksInTimeChart` adds on top is colour and a label; what makes a
 * trend chart wrong is all in this file.
 */

/** A fixed "now" so none of this depends on the month the suite is run in. */
const NOW = new Date('2026-09-15T12:00:00.000Z')

function month(iso: string, total_books: number) {
  return { month: iso, total_books }
}

describe('buildTrendSeries', () => {
  it('returns nothing for an empty series', () => {
    expect(buildTrendSeries([], { months: 6, now: NOW })).toEqual([])
  })

  it('draws exactly one bar for a one-month-old library', () => {
    const series = buildTrendSeries([month('2026-09-01T00:00:00.000Z', 7)], {
      months: 6,
      now: NOW,
    })

    // Not six buckets with five empty ones: the library did not exist then, and
    // inventing that history is the difference between "new" and "abandoned".
    expect(series).toHaveLength(1)
    expect(series[0]).toMatchObject({
      key: '2026-09',
      label: 'Sep',
      fullLabel: 'September 2026',
      count: 7,
    })
  })

  it('labels a UTC month bucket as that month, not the local one', () => {
    // The regression this pins: `2026-09-01T00:00:00.000Z` is 31 August locally
    // anywhere west of Greenwich, so local formatting labels the September bar
    // "Aug" for every user in the Americas.
    const series = buildTrendSeries([month('2026-09-01T00:00:00.000Z', 1)], {
      months: 6,
      now: NOW,
    })
    expect(series[0].label).toBe('Sep')
    expect(series[0].fullLabel).toBe('September 2026')
  })

  it('fills a month with no books rather than closing the gap', () => {
    const series = buildTrendSeries(
      [month('2026-07-01T00:00:00.000Z', 3), month('2026-09-01T00:00:00.000Z', 4)],
      { months: 6, now: NOW }
    )

    expect(series.map((p) => [p.label, p.count])).toEqual([
      ['Jul', 3],
      ['Aug', 0],
      ['Sep', 4],
    ])
  })

  it('runs the window up to the current month even with no recent books', () => {
    const series = buildTrendSeries([month('2026-06-01T00:00:00.000Z', 5)], {
      months: 6,
      now: NOW,
    })

    // "Nothing added since June" is the most useful thing this chart can say.
    expect(series.map((p) => p.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep'])
    expect(series.at(-1)).toMatchObject({ label: 'Sep', count: 0 })
  })

  it('caps the window and keeps the most recent months', () => {
    const entries = [
      month('2025-01-01T00:00:00.000Z', 1),
      month('2026-08-01T00:00:00.000Z', 2),
    ]
    const mobile = buildTrendSeries(entries, { months: 6, now: NOW })
    const desktop = buildTrendSeries(entries, { months: 12, now: NOW })

    expect(mobile).toHaveLength(6)
    expect(mobile.at(-1)?.key).toBe('2026-09')
    expect(mobile[0].key).toBe('2026-04')

    expect(desktop).toHaveLength(12)
    expect(desktop[0].key).toBe('2025-10')
  })

  it('sums two entries that land in the same month', () => {
    const series = buildTrendSeries(
      [month('2026-09-01T00:00:00.000Z', 4), month('2026-09-20T00:00:00.000Z', 3)],
      { months: 6, now: NOW }
    )
    expect(series).toHaveLength(1)
    expect(series[0].count).toBe(7)
  })

  it('ignores an unparseable month instead of drawing a NaN axis', () => {
    const series = buildTrendSeries(
      [month('not-a-date', 9), month('2026-09-01T00:00:00.000Z', 2)],
      { months: 6, now: NOW }
    )
    expect(series).toEqual([expect.objectContaining({ key: '2026-09', count: 2 })])
  })

  it('does not run the window backwards when data is stamped in the future', () => {
    const series = buildTrendSeries([month('2027-03-01T00:00:00.000Z', 1)], {
      months: 6,
      now: NOW,
    })
    expect(series).toHaveLength(1)
    expect(series[0].key).toBe('2027-03')
  })
})

describe('describeTrend', () => {
  it('says so plainly when there is nothing', () => {
    expect(describeTrend([])).toBe('No books have been added yet.')
  })

  it('carries every value, because the canvas carries none', () => {
    const series = buildTrendSeries(
      [month('2026-08-01T00:00:00.000Z', 2), month('2026-09-01T00:00:00.000Z', 5)],
      { months: 6, now: NOW }
    )
    const text = describeTrend(series)

    expect(text).toContain('August 2026 to September 2026')
    expect(text).toContain('7 books in total')
    expect(text).toContain('August 2026: 2')
    expect(text).toContain('September 2026: 5')
  })

  it('does not say "1 books"', () => {
    const series = buildTrendSeries([month('2026-09-01T00:00:00.000Z', 1)], {
      months: 6,
      now: NOW,
    })
    expect(describeTrend(series)).toContain('1 book in total')
  })
})

describe('trendCaption', () => {
  it('is empty when there is no chart', () => {
    expect(trendCaption([])).toBe('')
  })

  it('names the month when there is only one', () => {
    const series = buildTrendSeries([month('2026-09-01T00:00:00.000Z', 7)], {
      months: 6,
      now: NOW,
    })
    expect(trendCaption(series)).toBe('7 books in September 2026')
  })

  it('counts the window when there is more than one', () => {
    const series = buildTrendSeries(
      [month('2026-07-01T00:00:00.000Z', 3), month('2026-09-01T00:00:00.000Z', 4)],
      { months: 6, now: NOW }
    )
    expect(trendCaption(series)).toBe('7 books over the last 3 months')
  })
})
