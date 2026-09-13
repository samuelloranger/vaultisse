import { useState } from 'react'
import { Button, useMedia, XStack, YStack } from 'tamagui'
import { Menu } from '@/components/icons'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { useLocale } from '@/locale/LocaleProvider'
import type { EntityRowAction } from './types'

/**
 * A row's actions, in the two shapes the viewport asks for.
 *
 * ## This component is the fix for the defect these screens were built around
 *
 * The Vue version put edit, delete and expand into a 390px row as three
 * separate controls, beside an entity name that then wrapped to three lines.
 * Squeezing three controls into the space left over is what produced the 21x21
 * touch targets the audit measured — the targets were a symptom, and shrinking
 * or padding them would not have fixed the cause.
 *
 * So on phones there is exactly **one** control: a 44x44 button that opens a
 * labelled list. Every action is a full-width 44px row with a real text label,
 * which is also the only way a touch user ever learns what the actions are —
 * the old inline strip explained itself through `v-tooltip`, and tooltips never
 * open on touch.
 *
 * Above `sm` the inline strip comes back, because the space genuinely exists
 * there. Both shapes render the same `EntityRowAction[]`, so a row declares its
 * actions once.
 *
 * ## Two smaller rules, both load-bearing
 *
 *  - **Nothing is red at rest.** `destructive` tints an entry only once the
 *    menu is open and the user is deliberately choosing.
 *  - **The menu is a `ResponsiveDialog`**, not a popover. It is a modal overlay
 *    on a phone, and the client has exactly one of those — a Sheet below `sm`,
 *    a Dialog above, action row pinned, no fixed heights. A hand-rolled popover
 *    here would be a second, untested modal implementation.
 */
export function RowActions({
  actions,
  /** Names the control for screen readers: "Actions for Salon". */
  entityName,
  testID,
}: {
  actions: EntityRowAction[]
  entityName: string
  testID: string
}) {
  const media = useMedia()
  const { t } = useLocale()
  const [open, setOpen] = useState(false)

  if (actions.length === 0) return null

  if (media.sm) {
    return (
      <XStack alignItems="center" gap="$1" flexShrink={0} testID={testID}>
        {actions.map((action) => (
          <Button
            key={action.key}
            testID={`${testID}-${action.key}`}
            onPress={action.onSelect}
            disabled={action.disabled}
            opacity={action.disabled ? 0.5 : 1}
            // The floor applies at every width. A 390px window on a desktop is
            // still a 390px layout, and a mouse target is not free either.
            minHeight={44}
            fontSize={15}
            paddingHorizontal="$3"
            borderRadius="$control"
            backgroundColor="transparent"
            borderWidth={0}
            // Neutral at rest. See this file's header.
            color="$color"
          >
            {action.label}
          </Button>
        ))}
      </XStack>
    )
  }

  return (
    <>
      <Button
        testID={testID}
        aria-label={t('ROW_ACTIONS_FOR', `Actions for ${entityName}`, { entityName })}
        onPress={() => setOpen(true)}
        icon={Menu}
        // Both axes. An icon-only button is the classic sub-44 offender.
        minWidth={44}
        minHeight={44}
        flexShrink={0}
        backgroundColor="transparent"
        borderWidth={0}
        color="$color"
        borderRadius="$control"
      />

      {/*
        Mounted only while open. A modal that stays in the tree costs a hidden
        overlay, a hidden title and a hidden button *per row* — on a shelf list
        of fifty authors that is fifty of each, all reachable by a screen reader
        and all announcing the entity's name a second time.
      */}
      {open ? (
        <ResponsiveDialog
          open
          onOpenChange={setOpen}
          title={entityName}
          description={t('CHOOSE_ACTION', 'Choose an action.')}
        >
          <YStack gap="$2">
            {actions.map((action) => (
              <Button
                key={action.key}
                testID={`${testID}-${action.key}`}
                onPress={() => {
                  setOpen(false)
                  action.onSelect()
                }}
                disabled={action.disabled}
                opacity={action.disabled ? 0.5 : 1}
                minHeight={44}
                fontSize={16}
                justifyContent="flex-start"
                borderRadius="$control"
                backgroundColor="transparent"
                borderColor="$borderColor"
                borderWidth={1}
                // The only place destructive turns red: the moment of choosing.
                color={action.destructive ? '$red10' : '$color'}
              >
                {action.label}
              </Button>
            ))}
          </YStack>
        </ResponsiveDialog>
      ) : null}
    </>
  )
}
