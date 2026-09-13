import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { useEffect, useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { useMedia, useTheme, useThemeName, View } from 'tamagui'
import type { BooksInMonth } from '@/api/types'
import { Card, Eyebrow, MutedText } from '@/components/Card'
import { useLocale } from '@/locale/LocaleProvider'
import { buildTrendSeries, describeTrend, trendCaption } from './booksInTime'

/**
 * "Books added per month" — the one thing `/dashboard` has always computed and
 * the client has never drawn.
 *
 * ## Bars, not a line
 *
 * The rewrite spec picks `chart.js` + `react-chartjs-2` (replacing the old
 * client's `vue-chartjs`) and that is what this uses. It does not specify a mark,
 * and this is a **bar** chart: `booksInTime` is a count per discrete month
 * bucket, and a line drawn through those counts asserts that the value moves
 * continuously between them, which it does not — there is no meaningful "books
 * added on the 14th of a month" reading to interpolate. Bars also degrade
 * honestly at n=1, where a line chart is a single unconnected dot.
 *
 * ## The two series that break charts
 *
 * A new instance has one month of data, or none. Both are handled before
 * `chart.js` is ever constructed, in `buildTrendSeries`:
 *
 *  - **Empty** renders a sentence, not a chart. An axis with no data on it is a
 *    worse answer than saying "nothing yet" in words.
 *  - **One point** renders exactly one bar. The window start is clamped to the
 *    first month that has data, so a one-month-old library draws one bar rather
 *    than five invented empty months beside it.
 *
 * ## Colour
 *
 * Every colour is resolved from the active Tamagui theme — the same `$primary`,
 * `$borderColor`, `$colorMuted` tokens the rest of the client uses, which come
 * from `theme/palette.ts`. None of it is hardcoded.
 *
 * It has to be read *out* as a value rather than passed as a token, which is
 * the one thing that makes a chart different from every other surface here:
 * `chart.js` paints into a canvas, so it inherits neither a Tamagui prop nor a
 * CSS custom property. A chart is therefore the classic place where a theme
 * rework lands everywhere except one element, which keeps its library's default
 * blue. Reading the tokens keeps it in lockstep; re-keying the canvas on the
 * theme name makes a light/dark flip rebuild it, because chart.js reads these
 * colours once at construction and then keeps its own retained drawing.
 */

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

/**
 * At 390px there is room for roughly six ticks before the month labels collide
 * or start rotating; a year's worth is readable on a desktop card.
 */
const MONTHS_MOBILE = 6
const MONTHS_DESKTOP = 12

/**
 * Can this document actually paint a canvas?
 *
 * `chart.js` needs a 2D context and there is no useful fallback inside it if the
 * context is missing — it logs and leaves an empty element. jsdom returns `null`
 * here (it implements no canvas without the native `canvas` package), and so
 * does a real browser with canvas disabled. Probed once and cached: the answer
 * cannot change within a document, and the probe is what emits jsdom's
 * "Not implemented" notice, so it should happen at most once per run.
 */
let canvasSupport: boolean | null = null
function supportsCanvas(): boolean {
  if (canvasSupport !== null) return canvasSupport
  try {
    canvasSupport = !!document.createElement('canvas').getContext('2d')
  } catch {
    canvasSupport = false
  }
  return canvasSupport
}

/**
 * A Tamagui theme value as the plain CSS colour string `chart.js` needs.
 *
 * `useTheme()` hands back `Variable` objects, whose `.val` is the resolved
 * colour. Passing the object itself straight into a chart option is the silent
 * failure mode here: `chart.js` stringifies it to `[object Object]`, the canvas
 * treats that as an invalid colour, and the element is drawn in the default
 * black with no error anywhere.
 */
function token(value: unknown): string {
  if (value && typeof value === 'object' && 'val' in value) {
    return String((value as { val: unknown }).val)
  }
  return String(value)
}

/**
 * `true` when the user has asked for less motion.
 *
 * The global stylesheet already collapses CSS animations under
 * `prefers-reduced-motion`, but a canvas is drawn by script and no stylesheet
 * reaches inside it — `chart.js` would keep running its 1s grow-from-zero entry
 * animation on every single navigation back to the dashboard.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mql) return
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function BooksInTimeChart({ booksInTime }: { booksInTime: BooksInMonth[] }) {
  const { locale, t, tPlural } = useLocale()
  const theme = useTheme()
  const themeName = useThemeName()
  const media = useMedia()
  const reducedMotion = useReducedMotion()

  const palette = useMemo(
    () => ({
      primary: token(theme.primary),
      accent: token(theme.accent),
      surface: token(theme.surface),
      text: token(theme.color),
      textMuted: token(theme.colorMuted),
      border: token(theme.borderColor),
    }),
    [theme]
  )
  const months = media.sm ? MONTHS_DESKTOP : MONTHS_MOBILE

  const series = useMemo(
    () => buildTrendSeries(booksInTime, { months, locale }),
    [booksInTime, months, locale]
  )
  const summary = describeTrend(series, t, (code, count, one, other) =>
    tPlural(code, count, one, other)
  )
  const caption = trendCaption(series, t, (code, count, one, other) =>
    tPlural(code, count, one, other)
  )

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      // The card owns the height; without this chart.js forces a 2:1 box and
      // ignores it.
      maintainAspectRatio: false,
      responsive: true,
      animation: reducedMotion ? false : { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: palette.surface,
          titleColor: palette.text,
          bodyColor: palette.textMuted,
          borderColor: palette.border,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items) => series[items[0].dataIndex]?.fullLabel ?? '',
            label: (item) =>
              item.parsed.y === 1
                ? t('TREND_BOOK_ADDED', '1 book added')
                : tPlural(
                    'TREND_BOOKS_ADDED',
                    item.parsed.y ?? 0,
                    '{count} book added',
                    '{count} books added'
                  ),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: palette.border },
          ticks: { color: palette.textMuted, font: { size: 12 }, maxRotation: 0 },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: palette.border },
          ticks: {
            color: palette.textMuted,
            font: { size: 12 },
            // Counts are whole books; a "2.5" gridline is not a thing.
            precision: 0,
            maxTicksLimit: 4,
          },
        },
      },
    }),
    [palette, reducedMotion, series, t, tPlural]
  )

  const data = useMemo(
    () => ({
      labels: series.map((point) => point.label),
      datasets: [
        {
          data: series.map((point) => point.count),
          backgroundColor: palette.primary,
          hoverBackgroundColor: palette.accent,
          borderRadius: 4,
          // A lone bar stretched to the full width of the card reads as a block,
          // not a measurement. Capping it keeps n=1 looking like a chart.
          maxBarThickness: 48,
        },
      ],
    }),
    [series, palette]
  )

  return (
    <Card gap="$3" testID="books-in-time-card">
      <Eyebrow>{t('BOOKS_ADDED_PER_MONTH', 'Books added per month')}</Eyebrow>
      {series.length === 0 ? (
        <MutedText testID="books-in-time-empty">
          {t(
            'TREND_NOTHING_ADDED',
            'Nothing added yet — the trend appears once the library has its first book.'
          )}
        </MutedText>
      ) : (
        <>
          {/* The canvas is unreadable to assistive tech, so the same figures are
              always in the accessible tree. `role="img"` + label is the pattern
              for a graphic whose detail is carried in text beside it. */}
          <View
            testID="books-in-time-chart"
            role="img"
            aria-label={summary}
            height={media.sm ? 220 : 170}
            width="100%"
          >
            {supportsCanvas() ? (
              // Re-keyed per theme — see this file's header.
              <Bar key={themeName} data={data} options={options} aria-hidden="true" />
            ) : null}
          </View>
          <MutedText testID="books-in-time-caption" fontSize={13}>
            {caption}
          </MutedText>
        </>
      )}
    </Card>
  )
}
