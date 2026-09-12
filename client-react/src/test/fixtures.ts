import type { BookCounters, Dashboard, Policy } from '@/api/types'

/**
 * Canonical fixtures, shaped from real responses off the dev API.
 *
 * One builder per resource, each taking an override patch, so a test states
 * only the field it cares about (`makeDashboard({ totalBooks: 0 })`) and stays
 * readable when the wire shape grows a field.
 */

export function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    user: {
      code: 'alice',
      name: 'Alice Dev',
      email: 'alice@dev.local',
      language: 'en',
      region: 'US',
      image: null,
      theme: 'beige',
      sidebarRail: false,
      role: 'admin',
      isAdmin: true,
      leasingEnabled: true,
      isPublicInstitution: false,
      totpEnabled: false,
      securityNoticeAccepted: true,
      termsOfServiceAccepted: true,
    },
    customers: [{ id: 1, name: 'Bob Borrower' }],
    categories: [{ id: 1, name: 'Science-fiction' }],
    languages: [{ code: 'en', name: 'English' }],
    formats: [{ id: 1, name: 'Paperback' }],
    locations: [{ id: 1, name: 'Main shelf' }],
    labels: {},
    maxImportFileSizeMb: 10,
    ...overrides,
  }
}

export function makeDashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    lastBooks: [
      {
        id: 2,
        name: 'The Left Hand of Darkness',
        image_url: null,
        isbn: '9780441478125',
      },
    ],
    totalBooks: 7,
    totalThisMonth: 7,
    totalLastMonth: 2,
    totalCategories: 3,
    totalCustomers: 1,
    totalLocations: 1,
    totalBookedBooks: 1,
    totalAuthors: 5,
    booksInTime: [{ month: '2026-09-01T00:00:00.000Z', total_books: 7 }],
    stockStatus: [{ status: 0, count: 6 }],
    categoryShelves: [
      {
        id: 1,
        name: 'Science-fiction',
        count: 2,
        books: [{ id: 1, name: 'The Dispossessed', image_url: null }],
      },
    ],
    currentlyOnLoan: [
      {
        bookId: 3,
        bookName: 'Between the World and Me',
        imageUrl: null,
        customerId: 1,
        customerName: 'Bob Borrower',
      },
    ],
    ...overrides,
  }
}

export function makeBookCounters(overrides: Partial<BookCounters> = {}): BookCounters {
  return { total: 7, recent: 7, onLoan: 1, noStock: 1, ...overrides }
}
