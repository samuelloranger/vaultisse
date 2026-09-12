import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import { BooksInTimeChart } from './BooksInTimeChart'

/**
 * What is asserted here is the *contract around* the canvas, not the pixels:
 * which branch renders, and what a screen reader is told. jsdom has no 2D
 * context, so `chart.js` is never constructed — see `supportsCanvas` in the
 * component, which is the same guard that protects a real browser with canvas
 * turned off. The numbers behind the bars are covered in `booksInTime.test.ts`,
 * and the drawn result is a Playwright screenshot.
 */

describe('BooksInTimeChart', () => {
  it('says so in words when there is no data at all, and draws no chart', () => {
    renderWithProviders(<BooksInTimeChart booksInTime={[]} />)

    expect(screen.getByTestId('books-in-time-empty')).toHaveTextContent(
      'Nothing added yet'
    )
    // An axis with nothing on it is worse than a sentence.
    expect(screen.queryByTestId('books-in-time-chart')).not.toBeInTheDocument()
  })

  it('renders a chart for a single month without crashing', () => {
    renderWithProviders(
      <BooksInTimeChart
        booksInTime={[{ month: '2026-09-01T00:00:00.000Z', total_books: 7 }]}
      />
    )

    expect(screen.getByTestId('books-in-time-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('books-in-time-empty')).not.toBeInTheDocument()
  })

  it('puts every value in the accessible name, because the canvas has none', () => {
    renderWithProviders(
      <BooksInTimeChart
        booksInTime={[
          { month: '2026-08-01T00:00:00.000Z', total_books: 2 },
          { month: '2026-09-01T00:00:00.000Z', total_books: 5 },
        ]}
      />
    )

    const chart = screen.getByTestId('books-in-time-chart')
    expect(chart).toHaveAttribute('role', 'img')
    const label = chart.getAttribute('aria-label') ?? ''
    expect(label).toContain('August 2026: 2')
    expect(label).toContain('September 2026: 5')
  })

  it('captions a single month by name rather than by window length', () => {
    renderWithProviders(
      <BooksInTimeChart
        booksInTime={[{ month: '2026-09-01T00:00:00.000Z', total_books: 7 }]}
      />
    )
    expect(screen.getByTestId('books-in-time-caption')).toHaveTextContent(
      '7 books in September 2026'
    )
  })
})
