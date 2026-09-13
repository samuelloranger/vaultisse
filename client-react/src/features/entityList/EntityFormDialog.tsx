import { useState } from 'react'
import { Button, YStack } from 'tamagui'
import { Field } from '@/components/Field'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import type { EntityFormField, EntityValues } from './types'

/**
 * The create/edit dialog shared by all three catalogue screens.
 *
 * One dialog for both modes, because they differ in exactly two things — the
 * title and which mutation fires — and a second near-identical component is
 * where the two drift apart.
 *
 * Fields are declared by the screen ({@link EntityFormField}) and rendered
 * through `components/Field`, so the 16px / 44px floors and the required
 * `autoComplete` / `inputMode` come for free and cannot be forgotten per-form.
 *
 * The dialog itself is `components/ResponsiveDialog`: a Sheet on phones, a
 * Dialog above `sm`, action row pinned outside the scrolling body. The old
 * client wrote `:fullscreen="smAndDown"` on each `v-dialog` and needed global
 * CSS to stop tall bodies pushing the buttons off the bottom edge.
 */
export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  fields,
  initialValues,
  submitLabel,
  pendingLabel,
  onSubmit,
  isPending,
  error,
  testID,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  fields: EntityFormField[]
  /** Edit mode seeds these; create mode passes empty strings. */
  initialValues: EntityValues
  submitLabel: string
  pendingLabel: string
  onSubmit: (values: EntityValues) => void
  isPending: boolean
  error: unknown
  testID: string
}) {
  const { t } = useLocale()
  // Seeded once, at mount. The screen mounts this component when the dialog
  // opens and drops it when it closes, so "mount" and "open" are the same
  // moment — which is why there is no re-seeding effect here to get wrong.
  const [values, setValues] = useState<EntityValues>(initialValues)

  const missingRequired = fields.some(
    (field) => field.required && values[field.name]?.trim().length === 0
  )

  function submit() {
    if (missingRequired || isPending) return
    const trimmed: EntityValues = {}
    for (const field of fields) trimmed[field.name] = (values[field.name] ?? '').trim()
    onSubmit(trimmed)
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      actions={
        <>
          <Button
            testID={`${testID}-cancel`}
            onPress={() => onOpenChange(false)}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            {t('CANCEL', 'Cancel')}
          </Button>
          <Button
            testID={`${testID}-submit`}
            onPress={submit}
            disabled={missingRequired || isPending}
            opacity={missingRequired || isPending ? 0.5 : 1}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </>
      }
    >
      <YStack gap="$3">
        {fields.map((field, index) => (
          <Field
            key={field.name}
            testID={`${testID}-${field.name}`}
            label={field.label}
            value={values[field.name] ?? ''}
            onChangeText={(next) =>
              setValues((current) => ({ ...current, [field.name]: next }))
            }
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            inputMode={field.inputMode}
            onSubmit={submit}
            // One error, under the first field, rather than repeated per input:
            // the server answers a single message for the whole write.
            error={index === 0 && error ? errorMessage(error) : null}
          />
        ))}
      </YStack>
    </ResponsiveDialog>
  )
}
