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

const TABS: { value: Tab; label: string }[] = [
  { value: 'customers', label: 'Borrowers' },
  { value: 'groups', label: 'Groups' },
]

const CUSTOMER_FIELDS: EntityFormField[] = [
  {
    name: 'name',
    label: 'Name',
    placeholder: 'e.g. Camille Tremblay',
    // A borrower is a person, so the browser's own name autofill is right here
    // — this is the one form in the client where it is.
    autoComplete: 'name',
    inputMode: 'text',
    required: true,
  },
]

const GROUP_FIELDS: EntityFormField[] = [
  {
    name: 'name',
    label: 'Name',
    placeholder: 'e.g. Class 4B',
    autoComplete: 'off',
    inputMode: 'text',
    required: true,
  },
  {
    name: 'description',
    label: 'Description',
    placeholder: 'Optional — who belongs in this group',
    autoComplete: 'off',
    inputMode: 'text',
  },
]

/** "2 books out" / "1 book out" / "Nothing out". The count is live server-side. */
function bookCountLabel(count: number): string {
  if (count === 0) return 'Nothing out'
  return count === 1 ? '1 book out' : `${count} books out`
}

/** "22 members" / "1 member" / "Empty". */
function memberCountLabel(count: number): string {
  if (count === 0) return 'Empty'
  return count === 1 ? '1 member' : `${count} members`
}

export function CustomersScreen() {
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

  const tabs = (
    <TabSwitch
      testID="customers-tabs"
      label="Borrowers or groups"
      value={tab}
      options={TABS}
      onChange={setTab}
    />
  )

  if (tab === 'groups') {
    return (
      <EntityListScreen<CustomerGroupRow, CustomerGroupInput>
        testID="customer-groups-screen"
        eyebrow="Lending"
        title="Borrower groups"
        noun="group"
        addLabel="Add group"
        loadingLabel="Loading groups…"
        errorTitle="The groups did not load"
        emptyTitle="No groups yet"
        emptyDescription="A group is an optional label — a class, a household, a department — that borrowers can be filed under."
        toolbar={tabs}
        expandLabels={{ show: 'Show members', hide: 'Hide members' }}
        query={groups}
        create={createGroup}
        update={updateGroup}
        remove={deleteGroup}
        fields={GROUP_FIELDS}
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
              {memberCountLabel(group.total_customers)}
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
        eyebrow="Lending"
        title="Borrowers"
        noun="borrower"
        addLabel="Add borrower"
        loadingLabel="Loading borrowers…"
        errorTitle="The borrowers did not load"
        emptyTitle="No borrowers yet"
        emptyDescription="A borrower is anyone a copy can go out to. There is no account behind one — it is a name the library tracks."
        toolbar={tabs}
        query={customers}
        create={createCustomer}
        update={updateCustomer}
        remove={deleteCustomer}
        fields={CUSTOMER_FIELDS}
        getId={(customer) => customer.id}
        getName={(customer) => customer.name}
        toValues={(customer) => ({ name: customer.name })}
        toInput={(values) => ({ name: values.name ?? '' })}
        renderMeta={(customer) => (
          <>
            <MutedText testID="customer-count" fontSize={13}>
              {bookCountLabel(customerBookCount(customer))}
            </MutedText>
            <MutedText testID="customer-group" fontSize={13}>
              {customer.group_name ?? 'No group'}
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
            label: 'Lend books',
            onSelect: () => setLendingTo(customer),
          },
          {
            key: 'group',
            label: 'Move to group',
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
