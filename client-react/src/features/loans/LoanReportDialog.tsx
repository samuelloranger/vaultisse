import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { CustomerGroupRow, CustomerRow } from '@/api/customer'
import type { LoanReportFilters, LoanReportRow } from '@/api/loans'
import { MutedText } from '@/components/Card'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { NativeDateField, NativeSelect } from '@/features/customers/CustomerControls'
import { useLoanReport } from '@/queries/loans'
import { formatLoanDate } from './formatLoanDate'

/**
 * The loan history report: a date range in, every loan in that range out —
 * returned ones included, because it reads `loan_history` rather than
 * `book_stocks`.
 *
 * ## The dates stack on a phone. This is the defect this dialog was built to
 * not repeat.
 *
 * The old `LoanReportDialog.vue` put both `type="date"` fields in a
 * `display: flex; gap: 12px` row with `flex: 1` each. Inside a dialog body
 * ~264px wide on a 390px screen that is ~126px per field — below the practical
 * minimum for the native picker, which has to fit a formatted date *and* its
 * own affordance. Here they are a column below `sm` and a row from `sm` up,
 * which is the only width at which two of them side by side is honest.
 *
 * ## Why the result renders here instead of downloading an .xlsx
 *
 * The old dialog's only output was a file: it lazily imported `exceljs`
 * (~900KB) and pushed an `.xlsx` at the browser, so the answer to "did anything
 * come back" was "open the download". The spec retires `exceljs` in favour of
 * `write-excel-file`, and that dependency is not in this client yet — so the
 * report renders on screen, where it is legible on a phone without a
 * spreadsheet app, and a CSV download sits beside it for the spreadsheet case.
 * See this task's report.
 */
export function LoanReportDialog({
  groups,
  customers,
  onOpenChange,
}: {
  groups: CustomerGroupRow[]
  customers: CustomerRow[]
  onOpenChange: (open: boolean) => void
}) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [groupId, setGroupId] = useState<number | null>(null)
  const [customerId, setCustomerId] = useState<number | null>(null)

  /**
   * The filters the user has actually asked to run, or `null` before they have.
   * Kept apart from the four inputs above so that editing a date does not
   * silently re-run the report under the previous answer.
   */
  const [submitted, setSubmitted] = useState<LoanReportFilters | null>(null)

  const report = useLoanReport(submitted)

  // Narrowing the group can strand a borrower who is not in it.
  const customerOptions = customers
    .filter((customer) => groupId === null || customer.group_id === groupId)
    .map((customer) => ({ value: customer.id, label: customer.name }))

  const canGenerate = Boolean(dateFrom) && Boolean(dateTo) && !report.isFetching

  function close() {
    onOpenChange(false)
  }

  function generate() {
    if (!canGenerate) return
    setSubmitted({ dateFrom, dateTo, groupId, customerId })
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Loan report"
      description="Every loan made in a date range, returned ones included."
      actions={
        <>
          <Button
            testID="loan-report-close"
            onPress={close}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            Close
          </Button>
          <Button
            testID="loan-report-generate"
            onPress={generate}
            disabled={!canGenerate}
            opacity={canGenerate ? 1 : 0.5}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {report.isFetching ? 'Generating…' : 'Generate'}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        {/*
          A column on a phone, a row from `sm`. See this file's header for the
          126px-wide date fields this replaces.
        */}
        <YStack gap="$3" $sm={{ flexDirection: 'row' }}>
          <YStack flex={1} minWidth={0}>
            <NativeDateField
              testID="loan-report-from"
              label="From"
              value={dateFrom}
              onChange={setDateFrom}
            />
          </YStack>
          <YStack flex={1} minWidth={0}>
            <NativeDateField
              testID="loan-report-to"
              label="To"
              value={dateTo}
              onChange={setDateTo}
            />
          </YStack>
        </YStack>

        <NativeSelect
          testID="loan-report-group"
          label="Group"
          value={groupId}
          options={groups.map((group) => ({ value: group.id, label: group.name }))}
          onChange={(next) => {
            setGroupId(next)
            // Drop a borrower who is not in the newly chosen group, rather than
            // silently reporting on a combination that can return nothing.
            const stillValid = customers.some(
              (customer) =>
                customer.id === customerId &&
                (next === null || customer.group_id === next)
            )
            if (!stillValid) setCustomerId(null)
          }}
          emptyLabel="All groups"
        />

        <NativeSelect
          testID="loan-report-customer"
          label="Borrower"
          value={customerId}
          options={customerOptions}
          onChange={setCustomerId}
          emptyLabel="All borrowers"
        />

        {!dateFrom || !dateTo ? (
          <Text fontSize={14} color="$colorMuted">
            Both dates are required — the report is a bounded range, not the whole
            history.
          </Text>
        ) : null}

        {report.isError ? (
          <Text testID="loan-report-error" fontSize={14} color="$red10">
            {errorMessage(report.error)}
          </Text>
        ) : null}

        {submitted && report.isSuccess ? (
          <LoanReportResult rows={report.data} filters={submitted} />
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}

/**
 * The report itself, as rows rather than as a file.
 *
 * Card-shaped, not a table: the same rule the spec applies to `v-data-table`
 * everywhere else in this client. Six columns of history at 390px is a
 * horizontal scroll at best.
 */
function LoanReportResult({
  rows,
  filters,
}: {
  rows: LoanReportRow[]
  filters: LoanReportFilters
}) {
  if (rows.length === 0) {
    return (
      <YStack testID="loan-report-empty" gap="$1" paddingTop="$2">
        <Text fontSize={15} color="$color">
          No loans in that range.
        </Text>
        <MutedText fontSize={13}>
          The history log only has rows for loans made through the app — a copy marked
          as lent directly in the database has no entry here.
        </MutedText>
      </YStack>
    )
  }

  return (
    <YStack testID="loan-report-result" gap="$3" paddingTop="$2">
      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$3"
        flexWrap="wrap"
      >
        <Text fontSize={15} color="$color">
          {rows.length === 1 ? '1 loan' : `${rows.length} loans`}
        </Text>
        <DownloadCsvButton rows={rows} filters={filters} />
      </XStack>

      <YStack gap="$2">
        {rows.map((row) => (
          <YStack
            key={`${row.stockCode}-${row.loanedAt}`}
            testID="loan-report-row"
            gap="$1"
            paddingVertical="$2"
            borderTopWidth={1}
            borderTopColor="$borderColor"
            minWidth={0}
          >
            <Text fontSize={15} color="$color">
              {row.bookName}
            </Text>
            <MutedText fontSize={13}>
              {row.customerName}
              {row.groupName ? ` · ${row.groupName}` : ''}
            </MutedText>
            <MutedText fontFamily="$mono" fontSize={12}>
              {row.stockCode} · out {formatLoanDate(row.loanedAt)} ·{' '}
              {row.returnedAt ? `back ${formatLoanDate(row.returnedAt)}` : 'still out'}
            </MutedText>
          </YStack>
        ))}
      </YStack>
    </YStack>
  )
}

/**
 * The spreadsheet path, as a CSV blob.
 *
 * A real `<a download>` built at press time rather than an `href` held open:
 * the object URL is revoked immediately afterwards, so a dialog left open does
 * not pin the whole report in memory.
 */
function DownloadCsvButton({
  rows,
  filters,
}: {
  rows: LoanReportRow[]
  filters: LoanReportFilters
}) {
  function download() {
    const csv = toCsv(rows)
    // A BOM so Excel opens UTF-8 correctly; without it accented borrower names
    // arrive mojibaked, which is most of them in this library.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `loans-${filters.dateFrom}-to-${filters.dateTo}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      testID="loan-report-download"
      onPress={download}
      minHeight={44}
      fontSize={15}
      paddingHorizontal="$3"
      borderRadius="$control"
      backgroundColor="transparent"
      borderColor="$borderColor"
      color="$color"
    >
      Download CSV
    </Button>
  )
}

const CSV_HEADERS = [
  'Book',
  'Stock code',
  'Borrower',
  'Group',
  'Lent on',
  'Returned on',
]

/** Quote every cell: book titles contain commas, and borrower names quotes. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function toCsv(rows: LoanReportRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.bookName,
        row.stockCode,
        row.customerName,
        row.groupName ?? '',
        formatLoanDate(row.loanedAt),
        row.returnedAt ? formatLoanDate(row.returnedAt) : 'Still on loan',
      ]
        .map(csvCell)
        .join(',')
    )
  }
  // CRLF: it is what RFC 4180 says and what Excel expects.
  return lines.join('\r\n')
}
