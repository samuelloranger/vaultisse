import { useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import type { CustomerRow } from '@/api/customer'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useCustomerGroups, useSetCustomerGroup } from '@/queries/customer'
import { NativeSelect } from './CustomerControls'

/**
 * Move one borrower into a group, or out of every group.
 *
 * ## Why this exists at all
 *
 * The old client's only *primary* path for this was HTML5 drag-and-drop, which
 * fires no events under a finger: on a phone, assigning a borrower to a group
 * was impossible. The spec's rule — no drag-only affordance may be the sole
 * path to an action — is this feature's fault, and this dialog is the fix. It
 * is reachable from the row's actions menu, which is the one control a phone
 * row has.
 *
 * ## Why a `<select>` and not a list of groups
 *
 * A library can have one group or forty. A native select is the platform's own
 * answer to "pick one of a variable number of things", it is already
 * searchable, keyboard-complete and screen-reader-complete, and it costs
 * nothing. See `CustomerControls.tsx`.
 *
 * "No group" is the empty option rather than a separate Remove button: it is
 * the same decision — which group is this person in — and `null` is a legal
 * answer to it. `api/customer.ts`'s `setCustomerGroup` crosses to the two
 * endpoints that back it.
 */
export function CustomerMoveToGroupDialog({
  customer,
  onOpenChange,
}: {
  customer: CustomerRow
  onOpenChange: (open: boolean) => void
}) {
  const groups = useCustomerGroups()
  const setGroup = useSetCustomerGroup()
  const [groupId, setGroupId] = useState<number | null>(customer.group_id)

  function close() {
    setGroup.reset()
    onOpenChange(false)
  }

  function submit() {
    setGroup.mutate({ id: customer.id, groupId }, { onSuccess: close })
  }

  const options = (groups.data ?? []).map((group) => ({
    value: group.id,
    label: group.name,
  }))

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={`Group for ${customer.name}`}
      description="A group is optional — a borrower can belong to none."
      actions={
        <>
          <Button
            testID="customer-group-cancel"
            onPress={close}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            Cancel
          </Button>
          <Button
            testID="customer-group-submit"
            onPress={submit}
            disabled={setGroup.isPending || groupId === customer.group_id}
            opacity={setGroup.isPending || groupId === customer.group_id ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {setGroup.isPending ? 'Moving…' : 'Move'}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        <NativeSelect
          testID="customer-group-select"
          label="Group"
          value={groupId}
          options={options}
          onChange={setGroupId}
          emptyLabel="No group"
        />
        {options.length === 0 ? (
          <Text fontSize={14} color="$colorMuted">
            There are no groups yet. Add one on the Groups tab.
          </Text>
        ) : null}
        {setGroup.isError ? (
          <Text testID="customer-group-error" fontSize={14} color="$red10">
            {errorMessage(setGroup.error)}
          </Text>
        ) : null}
      </YStack>
    </ResponsiveDialog>
  )
}
