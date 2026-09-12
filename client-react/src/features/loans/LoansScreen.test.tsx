import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomerGroupRow, CustomerRow } from '@/api/customer'
import { ApiError } from '@/api/http'
import type { Loan, LoanPage, LoanReportRow } from '@/api/loans'
import { renderWithProviders } from '@/test/renderWithProviders'

/**
 * The spec's four-test set, plus three this screen earns on its own: the
 * filters, paging, and the report dialog.
 *
 * As in `DashboardScreen.test.tsx` the **`api/` modules are mocked, not the
 * query hooks**, so the real `loanKeys.list(filters)` — filters and all — and
 * the real cross-resource invalidation stay under test. That matters more here
 * than anywhere else in the client: returning a copy from this screen has to
 * move the loans list, the book counters, the borrower's count and the
 * dashboard, and a mutation that forgot one would still pass an assertion that
 * only checked the POST went out.
 *
 * `@tanstack/react-router` is stubbed to a plain anchor: each loan's title
 * links to the book screen, and `Link` needs a router in context.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
    style?: React.CSSProperties
  }) => (
    <a href={`/app/book/${params?.book_id}`} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/api/loans', () => ({ getLoans: vi.fn(), getLoanReport: vi.fn() }))
vi.mock('@/api/customer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/customer')>()
  return { ...actual, getCustomers: vi.fn(), getCustomerGroups: vi.fn() }
})
vi.mock('@/api/book', async (importOriginal) => {
  // Only `returnBooks` is exercised here, but `queries/book.ts` imports the
  // whole module — spreading the original keeps every other binding real
  // rather than silently `undefined`.
  const actual = await importOriginal<typeof import('@/api/book')>()
  return { ...actual, returnBooks: vi.fn() }
})

import { returnBooks } from '@/api/book'
import { getCustomerGroups, getCustomers } from '@/api/customer'
import { getLoanReport, getLoans } from '@/api/loans'
import { LoansScreen } from './LoansScreen'

const getLoansMock = vi.mocked(getLoans)
const getLoanReportMock = vi.mocked(getLoanReport)
const getCustomersMock = vi.mocked(getCustomers)
const getCustomerGroupsMock = vi.mocked(getCustomerGroups)
const returnBooksMock = vi.mocked(returnBooks)

/** Shaped from the dev API's real `GET /loans`. */
function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    stockId: 1,
    stockCode: '0000000001',
    loanedAt: '2026-09-03T03:19:52.138Z',
    bookId: 1,
    bookName: 'The Dispossessed: An Ambiguous Utopia',
    imageUrl: null,
    customerId: 1,
    customerName: 'Camille Tremblay',
    groupId: null,
    groupName: null,
    ...overrides,
  }
}

function makeLoanPage(overrides: Partial<LoanPage> = {}): LoanPage {
  return { total: 1, limit: 50, loans: [makeLoan()], ...overrides }
}

function makeGroups(): CustomerGroupRow[] {
  return [{ id: 2, name: 'Class 4B', description: null, total_customers: 1 }]
}

function makeCustomers(): CustomerRow[] {
  return [
    {
      id: 1,
      name: 'Camille Tremblay',
      group_id: 2,
      group_name: 'Class 4B',
      total_books: '1',
    },
  ]
}

function makeReportRows(): LoanReportRow[] {
  return [
    {
      bookName: 'The Dispossessed: An Ambiguous Utopia',
      stockCode: '0000000001',
      customerName: 'Camille Tremblay',
      groupName: 'Class 4B',
      loanedAt: '2026-09-03T03:19:52.138Z',
      returnedAt: null,
    },
  ]
}

beforeEach(() => {
  getLoansMock.mockResolvedValue(makeLoanPage())
  getLoanReportMock.mockResolvedValue(makeReportRows())
  getCustomersMock.mockResolvedValue(makeCustomers())
  getCustomerGroupsMock.mockResolvedValue(makeGroups())
  returnBooksMock.mockResolvedValue(null)
})

describe('LoansScreen', () => {
  it('renders', async () => {
    renderWithProviders(<LoansScreen />)
    expect(await screen.findByTestId('loans-screen')).toBeInTheDocument()
    expect(screen.getByText('Loans')).toBeInTheDocument()
  })

  it('shows data from the query', async () => {
    renderWithProviders(<LoansScreen />)

    expect(
      await screen.findByText('The Dispossessed: An Ambiguous Utopia')
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('loan-row')).toHaveLength(1)
    // The borrower is on the card, not in a column that vanishes at 390px.
    expect(screen.getByText('Camille Tremblay')).toBeInTheDocument()
    expect(screen.getByTestId('loans-count')).toHaveTextContent('1 copy out')

    // One page: the pager is absent rather than present and inert.
    expect(screen.queryByTestId('loans-next')).not.toBeInTheDocument()
  })

  it('fires the return mutation and invalidates the loans list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoansScreen />)
    await screen.findByTestId('loans-screen')
    expect(getLoansMock).toHaveBeenCalledTimes(1)

    await user.click(await screen.findByTestId('loan-return-0000000001'))

    // The return goes through the unscoped bulk endpoint, which is what
    // `docs/LOANS.md` says this list reuses — `LoansRoute.ts` has no mutations.
    await waitFor(() => {
      expect(returnBooksMock).toHaveBeenCalledWith(['0000000001'])
    })
    // The invalidation, not the POST, is the point: the copy has to leave this
    // list without a reload, and the borrower's count has to drop with it.
    await waitFor(() => {
      expect(getLoansMock).toHaveBeenCalledTimes(2)
    })
    expect(getCustomersMock).toHaveBeenCalledTimes(2)
  })

  it('renders its error state', async () => {
    getLoansMock.mockRejectedValue(new ApiError(500, null, 'Internal Server Error'))
    renderWithProviders(<LoansScreen />)

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('The loans did not load')).toBeInTheDocument()
    // The filters survive the failure: they are the likeliest cause of it, and
    // a screen that hides them leaves no way to undo the one that emptied it.
    expect(screen.getByTestId('loan-filters')).toBeInTheDocument()
  })

  it('refetches under a new cache key when a filter changes', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoansScreen />)
    await screen.findByTestId('loans-screen')

    await user.selectOptions(await screen.findByTestId('loan-filter-group'), '2')

    await waitFor(() => {
      expect(getLoansMock).toHaveBeenCalledWith(
        { groupId: 2, page: 0 },
        expect.anything()
      )
    })
    // Filtering resets the page: page 3 of the old result set is rarely page 3
    // of the new one, and an empty page with no explanation is the worst case.
    expect(await screen.findByTestId('loan-filters-clear')).toBeInTheDocument()
  })

  it('pages through a result set larger than one page', async () => {
    const user = userEvent.setup()
    getLoansMock.mockResolvedValue(makeLoanPage({ total: 120 }))
    renderWithProviders(<LoansScreen />)
    await screen.findByTestId('loans-screen')

    const next = await screen.findByTestId('loans-next')
    // Previous is disabled on page 0 rather than absent, so the pager does not
    // change width as you move through it. Tamagui expresses that as
    // `aria-disabled` on a real `<button>`, not the `disabled` attribute.
    expect(screen.getByTestId('loans-prev')).toHaveAttribute('aria-disabled', 'true')

    await user.click(next)

    await waitFor(() => {
      expect(getLoansMock).toHaveBeenCalledWith({ page: 1 }, expect.anything())
    })
  })

  it('generates the report for a date range', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoansScreen />)
    await screen.findByTestId('loans-screen')

    await user.click(screen.getByTestId('loans-report-open'))

    // Nothing runs before both dates are set: the endpoint 400s without them.
    const generate = await screen.findByTestId('loan-report-generate')
    expect(generate).toHaveAttribute('aria-disabled', 'true')
    expect(getLoanReportMock).not.toHaveBeenCalled()

    await user.type(screen.getByTestId('loan-report-from'), '2026-09-01')
    await user.type(screen.getByTestId('loan-report-to'), '2026-09-30')
    await user.click(screen.getByTestId('loan-report-generate'))

    await waitFor(() => {
      expect(getLoanReportMock).toHaveBeenCalledWith(
        {
          dateFrom: '2026-09-01',
          dateTo: '2026-09-30',
          groupId: null,
          customerId: null,
        },
        expect.anything()
      )
    })

    // The report renders on screen rather than only arriving as a download.
    expect(await screen.findByTestId('loan-report-result')).toBeInTheDocument()
    expect(screen.getAllByTestId('loan-report-row')).toHaveLength(1)
    expect(screen.getByTestId('loan-report-download')).toBeInTheDocument()
  })
})
