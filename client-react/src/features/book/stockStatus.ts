import { BookStockStatus } from '@/api/types'

/** The labels used wherever a physical copy's lifecycle state is shown. */
const STATUS_LABELS: Record<BookStockStatus, string> = {
  [BookStockStatus.Available]: 'Available',
  [BookStockStatus.NotAvailable]: 'Withdrawn',
  [BookStockStatus.Booked]: 'On loan',
  [BookStockStatus.Damaged]: 'Damaged',
}

/** One lookup for every stock-status surface, with an explicit English fallback. */
export function statusLabel(
  status: BookStockStatus,
  translate?: (code: string, fallback: string) => string
): string {
  const fallback = STATUS_LABELS[status] ?? 'Unknown'
  if (!translate) return fallback
  const code =
    status === BookStockStatus.Available
      ? 'AVAILABLE'
      : status === BookStockStatus.NotAvailable
        ? 'NOT_AVAILABLE'
        : status === BookStockStatus.Booked
          ? 'ON_LOAN'
          : status === BookStockStatus.Damaged
            ? 'DAMAGED'
            : 'STATUS_UNKNOWN'
  return translate(code, fallback)
}
