import { useState } from 'react'
import { Button, Text, YStack } from 'tamagui'
import type { CustomerGroupRow, CustomerRow } from '@/api/customer'
import { customerBookCount } from '@/api/customer'
import { EmptyState, errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useSetCustomerGroup } from '@/queries/customer'
import { NativeSelect, SelectableRow } from './CustomerControls'

/**
 * A group's members, and the batch move — the expanded body of a group row.
 *
 * ## This panel is the drag-and-drop replacement
 *
 * The old `CustomerGroupsTree.vue` expanded a group to a member table whose
 * primary reassignment gesture was dragging a row onto another group. HTML5
 * drag-and-drop fires `dragstart` / `dragover` / `drop` for a mouse and for
 * nothing else, so on a phone the feature was inert — and the view shipped a
 * hint telling the user to drag anyway. The checkbox-and-move pair was the
 * fallback there; here it is the whole mechanism, and it works identically
 * under a finger and under a mouse.
 *
 * ## Where the members come from
 *
 * From the borrowers list already in the cache, filtered by `group_id` — not a
 * second endpoint. There is no `GET /customer/group/:id/members`, and the
 * customers query is mounted by the screen either way, so filtering it keeps
 * the member list and the borrowers list from ever disagreeing about who is in
 * what.
 */
export function CustomerGroupMembersPanel({
  group,
  customers,
  groups,
}: {
  group: CustomerGroupRow
  /** Every borrower. Filtered here; see this file's header. */
  customers: CustomerRow[]
  /** Every group, for the move target. */
  groups: CustomerGroupRow[]
}) {
  const members = customers.filter((customer) => customer.group_id === group.id)
  const setGroup = useSetCustomerGroup()
  const { t, tPlural } = useLocale()

  const [selected, setSelected] = useState<number[]>([])
  const [target, setTarget] = useState<number | null>(null)
  /**
   * Held locally rather than read off `setGroup.isPending`: the batch is one
   * call per member, so the hook's flag drops back to false between them and
   * the button would flicker back to "Move" mid-batch.
   */
  const [moving, setMoving] = useState(false)

  function toggle(id: number) {
    setSelected((current) =>
      current.includes(id) ? current.filter((it) => it !== id) : [...current, id]
    )
  }

  async function move() {
    if (selected.length === 0 || moving) return
    setMoving(true)
    try {
      // Sequential, not `Promise.all`: these are writes to one table through a
      // single pool, and a failure partway through should stop rather than
      // leave the rest in flight with nothing reading their result.
      for (const id of selected) {
        await setGroup.mutateAsync({ id, groupId: target })
      }
      setSelected([])
    } catch {
      // Surfaced below through `setGroup.error`; `mutateAsync` rejects and
      // there is nothing else to do with the rejection here.
    } finally {
      setMoving(false)
    }
  }

  if (members.length === 0) {
    return (
      <EmptyState
        title={t('NO_MEMBERS', 'No members')}
        description={t(
          'GROUP_MEMBERS_EMPTY_DESC',
          `Nobody is in ${group.name} yet. Open a borrower's actions on the Borrowers tab and choose "Move to group".`,
          { name: group.name }
        )}
      />
    )
  }

  const targetOptions = groups
    .filter((candidate) => candidate.id !== group.id)
    .map((candidate) => ({ value: candidate.id, label: candidate.name }))

  return (
    <YStack
      testID={`customer-group-members-${group.id}`}
      padding="$3"
      gap="$3"
      backgroundColor="$backgroundAlt"
    >
      <YStack gap="$2">
        {members.map((member) => (
          <SelectableRow
            key={member.id}
            testID={`customer-group-member-${member.id}`}
            label={member.name}
            meta={
              customerBookCount(member) === 0
                ? t('NOTHING_OUT', 'Nothing out')
                : tPlural(
                    'BORROWER_BOOKS',
                    customerBookCount(member),
                    '{count} book',
                    '{count} books'
                  )
            }
            selected={selected.includes(member.id)}
            onToggle={() => toggle(member.id)}
          />
        ))}
      </YStack>

      {/*
        Always visible, not revealed once something is selected. A control that
        appears only after you have guessed the gesture cannot teach the gesture
        — which is what left the old screen unusable on touch.
      */}
      <YStack gap="$2">
        <NativeSelect
          testID={`customer-group-move-target-${group.id}`}
          label={t('MOVE_SELECTED_TO', 'Move selected to')}
          value={target}
          options={targetOptions}
          onChange={setTarget}
          emptyLabel={t('NO_GROUP', 'No group')}
        />
        <Button
          testID={`customer-group-move-${group.id}`}
          onPress={move}
          disabled={selected.length === 0 || moving}
          opacity={selected.length === 0 || moving ? 0.5 : 1}
          minHeight={44}
          fontSize={15}
          borderRadius="$control"
          backgroundColor="$primary"
          color="$onPrimary"
          alignSelf="flex-start"
        >
          {moving
            ? t('MOVING', 'Moving…')
            : selected.length === 0
              ? t('SELECT_BORROWER_TO_MOVE', 'Select someone to move')
              : t('MOVE_COUNT', `Move ${selected.length}`, { count: selected.length })}
        </Button>
        {setGroup.isError && !moving ? (
          <Text testID="customer-group-move-error" fontSize={14} color="$red10">
            {errorMessage(setGroup.error)}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  )
}
