import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BookStockStatus } from '@/api/types'
import { renderWithProviders } from '@/test/renderWithProviders'
import { StockStatusSummary } from './StockStatusSummary'

describe('StockStatusSummary', () => {
  it('renders each returned status with its label and singular or plural copy count', () => {
    renderWithProviders(
      <StockStatusSummary
        stockStatus={[
          { status: BookStockStatus.Available, count: 1 },
          { status: BookStockStatus.Booked, count: 2 },
          { status: BookStockStatus.Damaged, count: 4 },
        ]}
      />
    )

    expect(screen.getByTestId('stock-status-card')).toBeInTheDocument()
    expect(screen.getByTestId('stock-status-0')).toHaveTextContent('Available')
    expect(screen.getByTestId('stock-status-0')).toHaveTextContent('1 copy')
    expect(screen.getByTestId('stock-status-2')).toHaveTextContent('On loan')
    expect(screen.getByTestId('stock-status-2')).toHaveTextContent('2 copies')
    expect(screen.getByTestId('stock-status-3')).toHaveTextContent('Damaged')
    expect(screen.getByTestId('stock-status-3')).toHaveTextContent('4 copies')
    expect(screen.queryByTestId('stock-status-1')).not.toBeInTheDocument()
  })

  it('renders a quiet empty state without inventing status categories', () => {
    renderWithProviders(<StockStatusSummary stockStatus={[]} />)

    expect(screen.getByTestId('stock-status-card')).toBeInTheDocument()
    expect(screen.getByTestId('stock-status-empty')).toHaveTextContent(
      'No copies to classify yet.'
    )
    expect(screen.queryByTestId('stock-status-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('stock-status-1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('stock-status-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('stock-status-3')).not.toBeInTheDocument()
  })
})
