import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { buildLocale, createLocale, LocaleProvider, useLocale } from './LocaleProvider'

function Probe() {
  const locale = useLocale()
  return (
    <>
      <output data-testid="label">
        {locale.t('hello', 'Hello, {name}!', { name: 'Ada' })}
      </output>
      <output data-testid="missing">{locale.t('missing', 'English fallback')}</output>
      <output data-testid="plural">
        {locale.tPlural('books', 2, 'One book', 'Other books')}
      </output>
      <output data-testid="locale">{locale.locale}</output>
      <output data-testid="date">{locale.formatDate('2026-01-02')}</output>
    </>
  )
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider
      language="fr"
      region="CA"
      labels={{
        hello: 'Bonjour, {name}!',
        'books.one': 'Un livre',
        'books.other': '{count} livres',
      }}
    >
      {children}
    </LocaleProvider>
  )
}

describe('locale foundation', () => {
  it('constructs a canonical language-region locale', () => {
    expect(buildLocale('fr', 'CA')).toBe('fr-CA')
    expect(buildLocale('EN', 'us')).toBe('en-US')
    expect(buildLocale('bad', '??')).toBe('en-US')
  })

  it('translates labels, interpolates parameters, falls back in English, and selects locale plurals', () => {
    render(<Probe />, { wrapper })

    expect(screen.getByTestId('label')).toHaveTextContent('Bonjour, Ada!')
    expect(screen.getByTestId('missing')).toHaveTextContent('English fallback')
    expect(screen.getByTestId('plural')).toHaveTextContent('2 livres')
    expect(screen.getByTestId('locale')).toHaveTextContent('fr-CA')
  })

  it('formats date-only values in the requested locale without a UTC day shift', () => {
    const locale = createLocale('en', 'US', {})
    expect(locale.formatDate('2026-01-02', { timeZone: 'UTC' })).toBe('1/2/2026')
    const french = createLocale('fr', 'CA', {})
    expect(french.formatNumber(1234.5)).toBe(
      new Intl.NumberFormat('fr-CA').format(1234.5)
    )
  })
})
