import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScreenLoading } from '@/components/ScreenState'
import { AdminScreen } from '@/features/admin/AdminScreen'
import { CustomersScreen } from '@/features/customers/CustomersScreen'
import { CounterTiles } from '@/features/dashboard/CounterTiles'
import { formatLoanDate } from '@/features/loans/formatLoanDate'
import { customerKeys, policyKeys } from '@/queries/keys'
import { makeDashboard, makePolicy } from '@/test/fixtures'
import { createTestQueryClient, renderWithProviders } from '@/test/renderWithProviders'
import { LocaleProvider } from './LocaleProvider'

function renderFrench(
  ui: React.ReactElement,
  labels: Record<string, string> = {},
  policyOverrides: Partial<ReturnType<typeof makePolicy>> = {}
) {
  const queryClient = createTestQueryClient()
  const policy = makePolicy({
    user: { ...makePolicy().user, language: 'fr', region: 'CA' },
    labels,
    ...policyOverrides,
  })
  queryClient.setQueryData(policyKeys.current(), policy)
  queryClient.setQueryData(customerKeys.list(), [])
  queryClient.setQueryData(customerKeys.groups(), [])
  return renderWithProviders(
    <LocaleProvider language="fr" region="CA" labels={labels}>
      {ui}
    </LocaleProvider>,
    { queryClient }
  )
}

describe('French client label sweep', () => {
  it('uses policy French labels for Borrowers and dashboard plural counts', async () => {
    renderFrench(
      <>
        <CustomersScreen />
        <CounterTiles
          dashboard={makeDashboard({ totalBooks: 2 })}
          counters={{ total: 2, recent: 2, onLoan: 0, noStock: 0 }}
          lending
        />
      </>,
      {
        BORROWERS: 'Emprunteurs',
        CATALOGUE: 'Catalogue',
        LENDING: 'Prêts',
        ADD_BORROWER: 'Ajouter un emprunteur',
        LOADING_BORROWERS: 'Chargement des emprunteurs…',
        BORROWERS_NOT_LOADED: 'Les emprunteurs ne se sont pas chargés',
        BORROWERS_EMPTY: 'Aucun emprunteur pour le moment',
        BORROWERS_EMPTY_DESC: 'Ajoutez des emprunteurs.',
        NAME: 'Nom',
        GROUPS: 'Groupes',
        DASHBOARD_BOOKS: 'Livres',
        DASHBOARD_ADDED_THIS_MONTH: 'Ajoutés ce mois-ci',
        DASHBOARD_ON_LOAN: 'En prêt',
        DASHBOARD_AUTHORS: 'Auteurs',
        DASHBOARD_COUNTER_LIBRARY: '{count} livre dans la bibliothèque',
        'DASHBOARD_COUNTER_LIBRARY.other': '{count} livres dans la bibliothèque',
        DASHBOARD_COUNTER_RECENT: '{count} ajouté dans les 30 derniers jours',
        'DASHBOARD_COUNTER_RECENT.other': '{count} ajoutés dans les 30 derniers jours',
        DASHBOARD_COUNTER_OUT: '{count} prêt',
        'DASHBOARD_COUNTER_OUT.other': '{count} prêts',
        DASHBOARD_COUNTER_NO_COPIES: '{count} sans exemplaire',
        'DASHBOARD_COUNTER_NO_COPIES.other': '{count} sans exemplaires',
      }
    )

    expect(await screen.findAllByText('Emprunteurs')).not.toHaveLength(0)
    expect(screen.getByTestId('counters-line')).toHaveTextContent(
      '2 livres dans la bibliothèque'
    )
  })

  it('localizes Admin and Profile-facing headings from policy labels', () => {
    renderFrench(
      <AdminScreen />,
      {
        ADMIN: 'Administration',
        ADMIN_ACCOUNTS: 'Comptes',
        ADMIN_FORBIDDEN_TITLE: 'Accès refusé',
        ADMIN_FORBIDDEN: 'Cette page est réservée aux administrateurs.',
      },
      { user: { ...makePolicy().user, language: 'fr', region: 'CA', isAdmin: false } }
    )

    expect(screen.getByText('Administration')).toBeInTheDocument()
    expect(screen.getByText('Accès refusé')).toBeInTheDocument()
  })

  it('keeps explicit English fallback when a French key is missing', () => {
    renderFrench(<ScreenLoading />, {})
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('formats loan dates with the stored Québec locale', () => {
    expect(formatLoanDate('2026-09-12T18:30:00.000Z', 'fr-CA')).toBe(
      new Intl.DateTimeFormat('fr-CA').format(new Date('2026-09-12T18:30:00.000Z'))
    )
  })
})
