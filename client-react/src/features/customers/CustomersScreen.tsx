import { useState } from 'react'
import {
  type CustomerGroupInput,
  type CustomerGroupRow,
  type CustomerInput,
  type CustomerRow,
  customerBookCount,
} from '@/api/customer'
import { MutedText } from '@/components/Card'
import { EntityListScreen } from '@/features/entityList/EntityListScreen'
import type { EntityFormField } from '@/features/entityList/types'
import { useDocumentTitle } from '@/lib/documentTitle'
import { useLocale } from '@/locale/LocaleProvider'
import {
  useCreateCustomer,
  useCreateCustomerGroup,
  useCustomerGroups,
  useCustomers,
  useDeleteCustomer,
  useDeleteCustomerGroup,
  useUpdateCustomer,
  useUpdateCustomerGroup,
} from '@/queries/customer'
import { CustomerBooksPanel } from './CustomerBooksPanel'
import { TabSwitch } from './CustomerControls'
import { CustomerGroupMembersPanel } from './CustomerGroupMembersPanel'
import { CustomerLendBooksDialog } from './CustomerLendBooksDialog'
import { CustomerMoveToGroupDialog } from './CustomerMoveToGroupDialog'

/**
 * Borrowers — the people the library lends to, and the groups they sit in.
 *
 * ## It is `features/entityList` twice, not a fourth list implementation
 *
 * Borrowers and groups are both "a list of named rows with create / edit /
 * delete, a live count, and an expandable body", which is exactly what
 * `EntityListScreen` is. Reusing it is not a saving of lines: it is how the
 * hard-won parts — one overflow control per row, nothing red at rest, every
 * modal a `ResponsiveDialog`, every input a `Field` — arrive already correct on
 * a screen nobody re-audited.
 *
 * The pattern gained one small prop for this screen, `toolbar`, because the tab
 * switch belongs to neither list. See `EntityListScreen.tsx`.
 *
 * ## Two tabs rather than two routes
 *
 * `docs/CUSTOMERS.md` treats groups as an optional way to organise the same
 * people, and the nav has one "Borrowers" entry for both. A second nav row for
 * a feature most libraries never turn on would cost more than the tab does.
 *
 * ## What is deliberately not here
 *
 * The drag-and-drop group assignment. See `CustomerGroupMembersPanel.tsx` and
 * `CustomerMoveToGroupDialog.tsx` for what replaced it and why.
 */

type Tab = 'customers' | 'groups'

export function CustomersScreen() {
  const { t, tPlural } = useLocale()
  useDocumentTitle(t('BORROWERS', 'Borrowers'))
  const [tab, setTab] = useState<Tab>('customers')

  const customers = useCustomers()
  const groups = useCustomerGroups()

  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()

  const createGroup = useCreateCustomerGroup()
  const updateGroup = useUpdateCustomerGroup()
  const deleteGroup = useDeleteCustomerGroup()

  /** The borrower the lend dialog is pointed at, or `null` when shut. */
  const [lendingTo, setLendingTo] = useState<CustomerRow | null>(null)
  /** The borrower whose group is being changed, or `null` when shut. */
  const [regrouping, setRegrouping] = useState<CustomerRow | null>(null)

  const tabOptions: { value: Tab; label: string }[] = [
    { value: 'customers', label: t('BORROWERS', 'Borrowers') },
    { value: 'groups', label: t('GROUPS', 'Groups') },
  ]
  const customerFields: EntityFormField[] = [
    {
      name: 'name',
      label: t('NAME', 'Name'),
      placeholder: t('BORROWER_NAME_PLACEHOLDER', 'e.g. Camille Tremblay'),
      // A borrower is a person, so the browser's own name autofill is right here
      // — this is the one form in the client where it is.
      autoComplete: 'name',
      inputMode: 'text',
      required: true,
    },
  ]
  const groupFields: EntityFormField[] = [
    {
      name: 'name',
      label: t('NAME', 'Name'),
      placeholder: t('GROUP_NAME_PLACEHOLDER', 'e.g. Class 4B'),
      autoComplete: 'off',
      inputMode: 'text',
      required: true,
    },
    {
      name: 'description',
      label: t('DESCRIPTION', 'Description'),
      placeholder: t(
        'GROUP_DESCRIPTION_PLACEHOLDER',
        'Optional — who belongs in this group'
      ),
      autoComplete: 'off',
      inputMode: 'text',
    },
  ]

  const tabs = (
    <TabSwitch
      testID="customers-tabs"
      label={t('BORROWERS_OR_GROUPS', 'Borrowers or groups')}
      value={tab}
      options={tabOptions}
      onChange={setTab}
    />
  )

  if (tab === 'groups') {
    return (
      <EntityListScreen<CustomerGroupRow, CustomerGroupInput>
        testID="customer-groups-screen"
        eyebrow={t('LENDING', 'Lending')}
        title={t('BORROWER_GROUPS', 'Borrower groups')}
        noun={t('GROUP', 'group')}
        addLabel={t('ADD_GROUP', 'Add group')}
        loadingLabel={t('LOADING_GROUPS', 'Loading groups…')}
        errorTitle={t('GROUPS_NOT_LOADED', 'The groups did not load')}
        emptyTitle={t('GROUPS_EMPTY', 'No groups yet')}
        emptyDescription={t(
          'GROUPS_EMPTY_DESC',
          'A group is an optional label — a class, a household, a department — that borrowers can be filed under.'
        )}
        toolbar={tabs}
        expandLabels={{
          show: t('SHOW_MEMBERS', 'Show members'),
          hide: t('HIDE_MEMBERS', 'Hide members'),
        }}
        query={groups}
        create={createGroup}
        update={updateGroup}
        remove={deleteGroup}
        fields={groupFields}
        getId={(group) => group.id}
        getName={(group) => group.name}
        toValues={(group) => ({
          name: group.name,
          description: group.description ?? '',
        })}
        toInput={(values) => ({
          name: values.name ?? '',
          description: values.description ?? '',
        })}
        renderMeta={(group) => (
          <>
            <MutedText testID="group-count" fontSize={13}>
              {group.total_customers === 0
                ? t('EMPTY', 'Empty')
                : tPlural(
                    'BORROWER_GROUP_MEMBERS',
                    group.total_customers,
                    '{count} borrower',
                    '{count} borrowers'
                  )}
            </MutedText>
            {group.description ? (
              <MutedText fontSize={13} numberOfLines={1}>
                {group.description}
              </MutedText>
            ) : null}
          </>
        )}
        renderExpanded={(group) => (
          <CustomerGroupMembersPanel
            group={group}
            customers={customers.data ?? []}
            groups={groups.data ?? []}
          />
        )}
      />
    )
  }

  return (
    <>
      <EntityListScreen<CustomerRow, CustomerInput>
        testID="customers-screen"
        eyebrow={t('LENDING', 'Lending')}
        title={t('BORROWERS', 'Borrowers')}
        noun={t('BORROWER', 'borrower')}
        addLabel={t('ADD_BORROWER', 'Add borrower')}
        loadingLabel={t('LOADING_BORROWERS', 'Loading borrowers…')}
        errorTitle={t('BORROWERS_NOT_LOADED', 'The borrowers did not load')}
        emptyTitle={t('BORROWERS_EMPTY', 'No borrowers yet')}
        emptyDescription={t(
          'BORROWERS_EMPTY_DESC',
          'A borrower is anyone a copy can go out to. There is no account behind one — it is a name the library tracks.'
        )}
        toolbar={tabs}
        query={customers}
        create={createCustomer}
        update={updateCustomer}
        remove={deleteCustomer}
        fields={customerFields}
        getId={(customer) => customer.id}
        getName={(customer) => customer.name}
        toValues={(customer) => ({ name: customer.name })}
        toInput={(values) => ({ name: values.name ?? '' })}
        renderMeta={(customer) => (
          <>
            <MutedText testID="customer-count" fontSize={13}>
              {customerBookCount(customer) === 0
                ? t('NOTHING_OUT', 'Nothing out')
                : tPlural(
                    'BORROWER_BOOKS_OUT',
                    customerBookCount(customer),
                    '{count} book out',
                    '{count} books out'
                  )}
            </MutedText>
            <MutedText testID="customer-group" fontSize={13}>
              {customer.group_name ?? t('NO_GROUP', 'No group')}
            </MutedText>
          </>
        )}
        renderExpanded={(customer) => (
          <CustomerBooksPanel
            customer={customer}
            onLendBooks={() => setLendingTo(customer)}
          />
        )}
        extraActions={(customer) => [
          {
            key: 'lend',
            label: t('LEND_BOOKS', 'Lend books'),
            onSelect: () => setLendingTo(customer),
          },
          {
            key: 'group',
            label: t('MOVE_TO_GROUP', 'Move to group'),
            onSelect: () => setRegrouping(customer),
          },
        ]}
      />

      {lendingTo ? (
        <CustomerLendBooksDialog
          customer={lendingTo}
          onOpenChange={(next) => (next ? undefined : setLendingTo(null))}
        />
      ) : null}

      {regrouping ? (
        <CustomerMoveToGroupDialog
          customer={regrouping}
          onOpenChange={(next) => (next ? undefined : setRegrouping(null))}
        />
      ) : null}
    </>
  )
}
