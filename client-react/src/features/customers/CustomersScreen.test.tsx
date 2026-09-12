import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomerBook, CustomerGroupRow, CustomerRow } from '@/api/customer'
import { ApiError } from '@/api/http'
import { renderWithProviders } from '@/test/renderWithProviders'

/**
 * The spec's four-test set, plus three this screen earns on its own: the
 * expandable body, the count that arrives as a string, and the group tab —
 * whose assignment path replaced a drag-and-drop that did nothing on touch.
 *
 * As in `DashboardScreen.test.tsx`, the **`api/` module is mocked and the query
 * hooks are real**, so `customerKeys.list()`, `customerKeys.books(id)`,
 * `customerKeys.groups()` and the cross-resource invalidation are all genuinely
 * exercised. Mocking `useCustomers` would assert only that JSX renders props.
 *
 * `@tanstack/react-router` is stubbed to a plain anchor: the borrowed-book rows
 * link to the book screen, and `Link` needs a router in context.
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

vi.mock('@/api/customer', async (importOriginal) => {
  // `customerBookCount` is a pure helper on the same module and is part of what
  // is being tested (a `bigint` count arrives as a string); keep the real one.
  const actual = await importOriginal<typeof import('@/api/customer')>()
  return {
    customerBookCount: actual.customerBookCount,
    getCustomers: vi.fn(),
    getCustomerBooks: vi.fn(),
    getCustomerGroups: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
    createCustomerGroup: vi.fn(),
    updateCustomerGroup: vi.fn(),
    deleteCustomerGroup: vi.fn(),
    setCustomerGroup: vi.fn(),
    lendBooksToCustomer: vi.fn(),
    returnCustomerBook: vi.fn(),
  }
})

import {
  createCustomer,
  createCustomerGroup,
  deleteCustomer,
  getCustomerBooks,
  getCustomerGroups,
  getCustomers,
  lendBooksToCustomer,
  returnCustomerBook,
  setCustomerGroup,
  updateCustomer,
} from '@/api/customer'
import { CustomersScreen } from './CustomersScreen'

const getCustomersMock = vi.mocked(getCustomers)
const getCustomerBooksMock = vi.mocked(getCustomerBooks)
const getCustomerGroupsMock = vi.mocked(getCustomerGroups)
const createCustomerMock = vi.mocked(createCustomer)
const updateCustomerMock = vi.mocked(updateCustomer)
const deleteCustomerMock = vi.mocked(deleteCustomer)
const createCustomerGroupMock = vi.mocked(createCustomerGroup)
const setCustomerGroupMock = vi.mocked(setCustomerGroup)
const lendBooksToCustomerMock = vi.mocked(lendBooksToCustomer)
const returnCustomerBookMock = vi.mocked(returnCustomerBook)

/**
 * Shaped from the dev API's real `GET /customer`. `total_books` is a **string**
 * on purpose: it is `count(*)`, a Postgres `bigint`, and node-postgres hands
 * bigints back as strings. A fixture that quietly used `1` would let a
 * string-concatenation bug through — the same class of bug that once printed
 * "8192 TB" in another app in this house.
 */
function makeCustomers(): CustomerRow[] {
  return [
    {
      id: 1,
      name: 'Camille Tremblay',
      group_id: 2,
      group_name: 'Class 4B',
      total_books: '1',
    },
    {
      id: 2,
      name: 'Jean-Philippe Bergeron-Lachance',
      group_id: null,
      group_name: null,
      total_books: '0',
    },
  ]
}

/** `total_customers` really is a number here — the server casts it `::int`. */
function makeGroups(): CustomerGroupRow[] {
  return [
    { id: 2, name: 'Class 4B', description: 'Les grands', total_customers: 1 },
    { id: 3, name: 'Voisins', description: null, total_customers: 0 },
  ]
}

function makeCustomerBooks(): CustomerBook[] {
  return [
    {
      id: 1,
      name: 'The Dispossessed: An Ambiguous Utopia',
      image_url: null,
      isbn: '9780061054884',
      code: '0000000001',
    },
  ]
}

beforeEach(() => {
  getCustomersMock.mockResolvedValue(makeCustomers())
  getCustomerGroupsMock.mockResolvedValue(makeGroups())
  getCustomerBooksMock.mockResolvedValue(makeCustomerBooks())
  createCustomerMock.mockResolvedValue({
    id: 3,
    name: 'Nour',
    group_id: null,
    group_name: null,
    total_books: '0',
  })
  updateCustomerMock.mockResolvedValue(makeCustomers()[0])
  deleteCustomerMock.mockResolvedValue({ message: 'Customer deleted successfully' })
  createCustomerGroupMock.mockResolvedValue({
    id: 4,
    name: 'Chalet',
    description: null,
    total_customers: 0,
  })
  setCustomerGroupMock.mockResolvedValue({ id: 2, name: 'Jean', group_id: 2 })
  lendBooksToCustomerMock.mockResolvedValue(makeCustomerBooks())
  returnCustomerBookMock.mockResolvedValue(null)
})

describe('CustomersScreen', () => {
  it('renders', async () => {
    renderWithProviders(<CustomersScreen />)
    expect(await screen.findByTestId('customers-screen')).toBeInTheDocument()
    expect(screen.getByText('Customers')).toBeInTheDocument()
  })

  it('shows data from the query, counts and groups included', async () => {
    renderWithProviders(<CustomersScreen />)

    expect(await screen.findByText('Camille Tremblay')).toBeInTheDocument()
    expect(screen.getByText('Jean-Philippe Bergeron-Lachance')).toBeInTheDocument()
    expect(screen.getAllByTestId('customers-screen-row')).toHaveLength(2)

    // "1" is a string on the wire. It must read as one book out, not as a "1"
    // concatenated into something, and nothing out says so in words.
    const counts = screen.getAllByTestId('customer-count')
    expect(counts[0]).toHaveTextContent('1 book out')
    expect(counts[1]).toHaveTextContent('Nothing out')

    // A borrower with no group says so rather than showing a blank line.
    const groups = screen.getAllByTestId('customer-group')
    expect(groups[0]).toHaveTextContent('Class 4B')
    expect(groups[1]).toHaveTextContent('No group')
  })

  it('fires the create mutation and invalidates the list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomersScreen />)
    await screen.findByTestId('customers-screen')
    expect(getCustomersMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId('customers-screen-add'))
    await user.type(await screen.findByTestId('customers-screen-form-name'), 'Nour')
    await user.click(screen.getByTestId('customers-screen-form-submit'))

    await waitFor(() => {
      expect(createCustomerMock).toHaveBeenCalledWith({ name: 'Nour' })
    })
    // The invalidation, not the POST, is what the rewrite is for.
    await waitFor(() => {
      expect(getCustomersMock).toHaveBeenCalledTimes(2)
    })
  })

  it('renders its error state', async () => {
    getCustomersMock.mockRejectedValue(new ApiError(500, null, 'Internal Server Error'))
    renderWithProviders(<CustomersScreen />)

    expect(await screen.findByTestId('screen-error')).toBeInTheDocument()
    expect(screen.getByText('The borrowers did not load')).toBeInTheDocument()
  })

  it('loads a borrower’s books only once their row is expanded', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomersScreen />)
    await screen.findByText('Camille Tremblay')

    // Twenty collapsed rows must not mean twenty requests.
    expect(getCustomerBooksMock).not.toHaveBeenCalled()

    await user.click(screen.getAllByTestId('customers-screen-row-toggle')[0])

    await waitFor(() => {
      expect(getCustomerBooksMock).toHaveBeenCalledWith(1, expect.anything())
    })
    expect(
      await screen.findByText('The Dispossessed: An Ambiguous Utopia')
    ).toBeInTheDocument()
    expect(screen.getByText('0000000001')).toBeInTheDocument()
  })

  it('returns a copy from a borrower and refetches what they hold', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomersScreen />)
    await screen.findByText('Camille Tremblay')

    await user.click(screen.getAllByTestId('customers-screen-row-toggle')[0])
    await user.click(await screen.findByTestId('customer-book-return-0000000001'))

    // Customer-scoped, not the unscoped POST /book/return: the server's
    // `AND customer_id = $4` makes a mistyped code a no-op instead of returning
    // somebody else's copy.
    await waitFor(() => {
      expect(returnCustomerBookMock).toHaveBeenCalledWith(1, '0000000001')
    })
    // A return moves this borrower's list *and* the borrowers list's count.
    await waitFor(() => {
      expect(getCustomersMock).toHaveBeenCalledTimes(2)
    })
    expect(getCustomerBooksMock).toHaveBeenCalledTimes(2)
  })

  it('lends copies to a borrower from their row actions', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomersScreen />)
    await screen.findByText('Camille Tremblay')

    await user.click(
      screen.getByLabelText('Actions for Jean-Philippe Bergeron-Lachance')
    )
    await user.click(await screen.findByTestId('customers-screen-row-actions-lend'))
    await user.type(
      await screen.findByTestId('customer-lend-codes'),
      '0000000004 0000000005'
    )
    await user.click(screen.getByTestId('customer-lend-submit'))

    await waitFor(() => {
      expect(lendBooksToCustomerMock).toHaveBeenCalledWith(2, [
        '0000000004',
        '0000000005',
      ])
    })
    await waitFor(() => {
      expect(getCustomersMock).toHaveBeenCalledTimes(2)
    })
  })

  it('moves a borrower into a group without any drag gesture', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomersScreen />)
    await screen.findByText('Jean-Philippe Bergeron-Lachance')

    // The path the old client only offered through HTML5 drag-and-drop, which
    // fires no events under a finger. Here it is a labelled row action and a
    // native select — both of which a tap reaches.
    await user.click(
      screen.getByLabelText('Actions for Jean-Philippe Bergeron-Lachance')
    )
    await user.click(await screen.findByTestId('customers-screen-row-actions-group'))
    await user.selectOptions(await screen.findByTestId('customer-group-select'), '2')
    await user.click(screen.getByTestId('customer-group-submit'))

    await waitFor(() => {
      expect(setCustomerGroupMock).toHaveBeenCalledWith(2, 2)
    })
    await waitFor(() => {
      expect(getCustomersMock).toHaveBeenCalledTimes(2)
    })
  })

  it('switches to the groups tab and creates a group there', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomersScreen />)
    await screen.findByTestId('customers-screen')

    await user.click(screen.getByTestId('customers-tabs-groups'))

    expect(await screen.findByTestId('customer-groups-screen')).toBeInTheDocument()
    expect(screen.getByText('Class 4B')).toBeInTheDocument()
    // `total_customers` is cast `::int` server-side, so this one really is a
    // number — and an empty group says so in words.
    const counts = screen.getAllByTestId('group-count')
    expect(counts[0]).toHaveTextContent('1 member')
    expect(counts[1]).toHaveTextContent('Empty')

    await user.click(screen.getByTestId('customer-groups-screen-add'))
    await user.type(
      await screen.findByTestId('customer-groups-screen-form-name'),
      'Chalet'
    )
    await user.click(screen.getByTestId('customer-groups-screen-form-submit'))

    await waitFor(() => {
      expect(createCustomerGroupMock).toHaveBeenCalledWith({
        name: 'Chalet',
        description: '',
      })
    })
    // Group membership is read off the borrowers list, so both refetch.
    await waitFor(() => {
      expect(getCustomerGroupsMock).toHaveBeenCalledTimes(2)
    })
    expect(getCustomersMock).toHaveBeenCalledTimes(2)
  })

  it('batch-moves selected members out of a group', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CustomersScreen />)
    await screen.findByTestId('customers-screen')

    await user.click(screen.getByTestId('customers-tabs-groups'))
    await screen.findByTestId('customer-groups-screen')
    await user.click(screen.getAllByTestId('customer-groups-screen-row-toggle')[0])

    // Members come from the borrowers list filtered by `group_id`, not a second
    // endpoint — there is no `GET /customer/group/:id/members`.
    const member = await screen.findByTestId('customer-group-member-1')
    expect(member).toHaveAttribute('aria-pressed', 'false')
    await user.click(member)
    expect(member).toHaveAttribute('aria-pressed', 'true')

    // The target select's empty option is "No group": `null` is a legal answer
    // to "which group is this person in".
    await user.click(screen.getByTestId('customer-group-move-2'))

    await waitFor(() => {
      expect(setCustomerGroupMock).toHaveBeenCalledWith(1, null)
    })
  })
})
