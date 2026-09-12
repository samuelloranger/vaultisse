/**
 * Wire shapes for the `/api/rest` endpoints this client calls.
 *
 * These are the *response* shapes, transcribed from the server's own JSDoc on
 * each route — they are not a domain model. The old client wrapped every one of
 * these in a reactive `model/` class that knew how to refetch itself; under
 * TanStack Query the cache owns freshness, so a plain type is enough. Derived
 * values that used to be model methods (`Book.isElectronic()`) become plain
 * functions next to the component that needs them.
 *
 * Only the endpoints in use are typed. Add to this file as screens land; do not
 * pre-transcribe the whole API.
 */

// ---------------------------------------------------------------------------
// GET /app/policy  (server/src/routes/AppRoute.ts)
// ---------------------------------------------------------------------------

/** The logged-in user, as `/app/policy` reports them. */
export type PolicyUser = {
  code: string
  name: string
  email: string
  language: string
  region: string
  image: string | null
  /** The old client's `data-theme` value: `"beige"` | `"library"`. */
  theme?: string
  sidebarRail?: boolean
  role: 'admin' | 'user'
  isAdmin: boolean
  leasingEnabled: boolean
  isPublicInstitution: boolean
  totpEnabled: boolean
  securityNoticeAccepted: boolean
  termsOfServiceAccepted: boolean
}

export type Category = { id: number; name: string }
export type Language = { code: string; name: string }
export type Format = { id: number; name: string }
export type Location = { id: number; name: string; description?: string }
export type Customer = { id: number; name: string }

/**
 * Bootstrap payload: the current user plus every reference list the app shell
 * and its dropdowns need, in one call.
 *
 * In the old client this was `ApplicationService`, a module-level singleton
 * fetched once from `App.vue`'s `onMounted` and never refetched. That is the
 * thing this rewrite exists to delete — see `queries/app.ts`.
 */
export type Policy = {
  user: PolicyUser
  customers: Customer[]
  categories: Category[]
  languages: Language[]
  formats: Format[]
  locations: Location[]
  /** UI translation strings for the user's language, keyed by label code. */
  labels: Record<string, string>
  /** Max accepted size, in MB, for a `POST /import/library` upload. */
  maxImportFileSizeMb: number
}

// ---------------------------------------------------------------------------
// GET /dashboard  (server/src/routes/DashboardRoute.ts)
// ---------------------------------------------------------------------------

/** `book_stocks.status`. */
export enum BookStockStatus {
  Available = 0,
  NotAvailable = 1,
  Booked = 2,
  Damaged = 3,
}

/** Minimal book fields in the dashboard's "recently added" list. */
export type DashboardBook = {
  id: number
  name: string
  image_url: string | null
  isbn: string | null
  pages?: number | null
  date_created?: string
}

/** Minimal book fields in a category shelf. */
export type ShelfBook = {
  id: number
  name: string
  image_url: string | null
}

/** Top category with a sample of its most recent books. */
export type CategoryShelf = {
  id: number
  name: string
  count: number
  books: ShelfBook[]
}

/** One book currently on loan, with its borrower. */
export type DashboardLoan = {
  bookId: number
  bookName: string
  imageUrl: string | null
  customerId: number
  customerName: string
}

/** Count of stocks per lifecycle status. */
export type StockStatusCount = {
  status: BookStockStatus
  count: number
}

/** Books created in a given month, for the trend chart. */
export type BooksInMonth = {
  /** Month start, ISO string. */
  month: string
  total_books: number
}

/** Everything the dashboard needs, in one round trip. */
export type Dashboard = {
  lastBooks: DashboardBook[]
  totalBooks: number
  totalThisMonth: number
  totalLastMonth: number
  totalCategories: number
  totalCustomers: number
  totalLocations: number
  totalBookedBooks: number
  totalAuthors: number
  booksInTime: BooksInMonth[]
  stockStatus: StockStatusCount[]
  categoryShelves: CategoryShelf[]
  currentlyOnLoan: DashboardLoan[]
}

// ---------------------------------------------------------------------------
// GET /book/counters  (server/src/routes/BooksRoute.ts)
// ---------------------------------------------------------------------------

/** Lightweight library totals powering the nav's quick filters. */
export type BookCounters = {
  total: number
  recent: number
  onLoan: number
  noStock: number
}
