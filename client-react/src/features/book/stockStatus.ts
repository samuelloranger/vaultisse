import { BookStockStatus } from '@/api/types'

/** The labels used wherever a physical copy's lifecycle state is shown. */
const STATUS_LABELS: Record<BookStockStatus, string> = {
  [BookStockStatus.Available]: 'Available',
  [BookStockStatus.NotAvailable]: 'Withdrawn',
  [BookStockStatus.Booked]: 'On loan',
  [BookStockStatus.Damaged]: 'Damaged',
}

/** Ready for the later locale hook: one lookup for every stock status surface. */
export function statusLabel(status: BookStockStatus): string {
  return STATUS_LABELS[status] ?? 'Unknown'
}
