import { createContext, type ReactNode, useContext, useMemo } from 'react'

export type InterpolationValues = Record<string, string | number>
export type LocaleOptions = Intl.DateTimeFormatOptions & { dateOnly?: boolean }

export type LocaleContextValue = {
  language: string
  region: string
  locale: string
  t: (code: string, fallback: string, values?: InterpolationValues) => string
  tPlural: (
    code: string,
    count: number,
    oneFallback: string,
    otherFallback: string,
    values?: InterpolationValues
  ) => string
  formatDate: (value: string | number | Date, options?: LocaleOptions) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

const DEFAULT_LOCALE = 'en-US'
const LANGUAGE_CODE = /^[a-z]{2}$/i
const REGION_CODE = /^[a-z]{2}$/i

/** Build a canonical BCP-47 locale only from the two stored columns. */
export function buildLocale(
  language: string | null | undefined,
  region: string | null | undefined
): string {
  const languageCode = typeof language === 'string' ? language.trim().toLowerCase() : ''
  const regionCode = typeof region === 'string' ? region.trim().toUpperCase() : ''
  if (!LANGUAGE_CODE.test(languageCode) || !REGION_CODE.test(regionCode))
    return DEFAULT_LOCALE

  try {
    return (
      Intl.getCanonicalLocales(`${languageCode}-${regionCode}`)[0] ?? DEFAULT_LOCALE
    )
  } catch {
    return DEFAULT_LOCALE
  }
}

function interpolate(template: string, values: InterpolationValues = {}): string {
  return template.replace(/\{([\w.-]+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match
  )
}

function dateValue(value: string | number | Date): Date {
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (dateOnly)
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }
  return value instanceof Date ? value : new Date(value)
}

function isDateOnly(value: string | number | Date): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function hasLabel(labels: Record<string, string>, code: string): boolean {
  return Object.hasOwn(labels, code)
}

export function createLocale(
  language: string | null | undefined,
  region: string | null | undefined,
  labels: Record<string, string>
): LocaleContextValue {
  const locale = buildLocale(language, region)
  const pluralRules = new Intl.PluralRules(locale)
  const translate = (code: string, fallback: string, values?: InterpolationValues) =>
    interpolate(hasLabel(labels, code) ? labels[code] : fallback, values)

  return {
    language:
      typeof language === 'string' && LANGUAGE_CODE.test(language.trim())
        ? language.trim().toLowerCase()
        : 'en',
    region:
      typeof region === 'string' && REGION_CODE.test(region.trim())
        ? region.trim().toUpperCase()
        : 'US',
    locale,
    t: translate,
    tPlural: (code, count, oneFallback, otherFallback, values = {}) => {
      const category = pluralRules.select(count)
      const fallback = category === 'one' ? oneFallback : otherFallback
      const categoryCode = `${code}.${category}`
      const otherCode = `${code}.other`
      const text = hasLabel(labels, categoryCode)
        ? labels[categoryCode]
        : hasLabel(labels, otherCode)
          ? labels[otherCode]
          : fallback
      return interpolate(text, { count, ...values })
    },
    formatDate: (value, options) => {
      const { dateOnly = false, ...intlOptions } = options ?? {}
      const date =
        dateOnly && typeof value === 'string'
          ? new Date(`${value.slice(0, 10)}T12:00:00.000Z`)
          : isDateOnly(value)
            ? new Date(`${value}T12:00:00.000Z`)
            : dateValue(value)
      const dateOptions =
        dateOnly || isDateOnly(value)
          ? { ...intlOptions, timeZone: intlOptions.timeZone ?? 'UTC' }
          : intlOptions
      if (Number.isNaN(date.getTime())) return ''
      try {
        return new Intl.DateTimeFormat(locale, dateOptions).format(date)
      } catch {
        return new Intl.DateTimeFormat(DEFAULT_LOCALE, dateOptions).format(date)
      }
    },
    formatNumber: (value, options) => {
      try {
        return new Intl.NumberFormat(locale, options).format(value)
      } catch {
        return new Intl.NumberFormat(DEFAULT_LOCALE, options).format(value)
      }
    },
  }
}

const LocaleContext = createContext<LocaleContextValue | null>(null)
const DEFAULT_CONTEXT = createLocale('en', 'US', {})

export function LocaleProvider({
  language,
  region,
  labels,
  children,
}: {
  language: string | null | undefined
  region: string | null | undefined
  labels: Record<string, string>
  children: ReactNode
}) {
  const value = useMemo(
    () => createLocale(language, region, labels),
    [language, region, labels]
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext)
  return value ?? DEFAULT_CONTEXT
}
