import { useState } from 'react'
import { Button, XStack, YStack } from 'tamagui'
import { DisplayText, Eyebrow } from '@/components/Card'
import { EmptyState, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { EntityFormDialog } from './EntityFormDialog'
import { EntityRow } from './EntityRow'
import type {
  EntityFormField,
  EntityMutation,
  EntityQuery,
  EntityRowAction,
  EntityUpdateVariables,
  EntityValues,
} from './types'

/**
 * The catalogue list screen: locations, categories and authors are this
 * component three times.
 *
 * They are genuinely the same screen — a list of named rows, create / edit /
 * delete, and for locations an expandable body — and the point of factoring it
 * once is not brevity. It is that the hard-won parts (one overflow control per
 * row, nothing red at rest, every dialog through `ResponsiveDialog`, every
 * input through `Field`) are implemented once and cannot be got wrong by the
 * fourth screen.
 *
 * ## What it does not own
 *
 * Data. Every query and mutation is passed in from `queries/`, already wired to
 * its cache keys and its invalidation. This component never imports `api/`, and
 * it holds no server state of its own — only which dialog is open and which
 * rows are expanded. That is also why the screen tests can mock the `api/`
 * module and still exercise the real cache behaviour.
 *
 * @see `features/entityList/types.ts` for the vocabulary.
 */
export type EntityListScreenProps<T, TInput> = {
  testID: string
  /** Small mono label above the title. */
  eyebrow: string
  title: string
  /** Singular, lower-case: "location". Used in dialog titles and empty copy. */
  noun: string
  addLabel: string
  loadingLabel: string
  errorTitle: string
  emptyTitle: string
  emptyDescription: string

  query: EntityQuery<T>
  create: EntityMutation<TInput>
  update: EntityMutation<EntityUpdateVariables<TInput>>
  remove: EntityMutation<number>

  fields: EntityFormField[]
  getId: (item: T) => number
  getName: (item: T) => string
  /** Seed the edit form from a row. */
  toValues: (item: T) => EntityValues
  /** Cross from the form's strings to the API's body. */
  toInput: (values: EntityValues) => TInput

  /** The muted second line. Omit for entities with nothing to say there. */
  renderMeta?: (item: T) => React.ReactNode
  /** Presence makes rows expandable. Rendered only while a row is open. */
  renderExpanded?: (item: T) => React.ReactNode
  /** Row actions beyond edit and delete, placed before them. */
  extraActions?: (item: T) => EntityRowAction[]
}

export function EntityListScreen<T, TInput>({
  testID,
  eyebrow,
  title,
  noun,
  addLabel,
  loadingLabel,
  errorTitle,
  emptyTitle,
  emptyDescription,
  query,
  create,
  update,
  remove,
  fields,
  getId,
  getName,
  toValues,
  toInput,
  renderMeta,
  renderExpanded,
  extraActions,
}: EntityListScreenProps<T, TInput>) {
  /** The row being edited, or `'new'` while creating, or `null` when closed. */
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  const [deleting, setDeleting] = useState<T | null>(null)
  const [expandedIds, setExpandedIds] = useState<number[]>([])

  const emptyValues: EntityValues = Object.fromEntries(
    fields.map((field) => [field.name, ''])
  )

  function openCreate() {
    create.reset()
    update.reset()
    setEditing('new')
  }

  function openEdit(item: T) {
    create.reset()
    update.reset()
    setEditing(item)
  }

  function closeForm() {
    setEditing(null)
  }

  function submitForm(values: EntityValues) {
    const input = toInput(values)
    if (editing === 'new' || editing === null) {
      create.mutate(input, { onSuccess: closeForm })
    } else {
      update.mutate({ id: getId(editing), input }, { onSuccess: closeForm })
    }
  }

  function toggleExpand(id: number) {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((it) => it !== id) : [...current, id]
    )
  }

  function actionsFor(item: T): EntityRowAction[] {
    const id = getId(item)
    const actions: EntityRowAction[] = []

    // The expand toggle is repeated here on purpose. The title block is the
    // toggle, but a target with no label is discoverable only by trying it;
    // this is the entry that says, in words, what it does.
    if (renderExpanded) {
      actions.push({
        key: 'expand',
        label: expandedIds.includes(id) ? 'Hide books' : 'Show books',
        onSelect: () => toggleExpand(id),
      })
    }

    if (extraActions) actions.push(...extraActions(item))

    actions.push({ key: 'edit', label: 'Edit', onSelect: () => openEdit(item) })
    actions.push({
      key: 'delete',
      label: 'Delete',
      destructive: true,
      onSelect: () => {
        remove.reset()
        setDeleting(item)
      },
    })

    return actions
  }

  const addButton = (
    <Button
      testID={`${testID}-add`}
      onPress={openCreate}
      minHeight={44}
      fontSize={16}
      borderRadius="$control"
      backgroundColor="$primary"
      color="$onPrimary"
    >
      {addLabel}
    </Button>
  )

  if (query.isPending) return <ScreenLoading label={loadingLabel} />

  if (query.isError) {
    return (
      <ScreenError
        error={query.error}
        onRetry={() => query.refetch()}
        title={errorTitle}
      />
    )
  }

  const items = query.data ?? []

  return (
    <YStack gap="$4" testID={testID}>
      <XStack
        alignItems="center"
        justifyContent="space-between"
        gap="$3"
        // Wraps to two lines before the title and the button ever collide.
        flexWrap="wrap"
      >
        <YStack gap="$1" minWidth={0} flexShrink={1}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <DisplayText fontSize={26} lineHeight={32}>
            {title}
          </DisplayText>
        </YStack>
        {items.length > 0 ? addButton : null}
      </XStack>

      {items.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={addButton}
        />
      ) : (
        <YStack gap="$3">
          {items.map((item) => {
            const id = getId(item)
            const expanded = expandedIds.includes(id)
            return (
              <EntityRow
                key={id}
                testID={`${testID}-row`}
                name={getName(item)}
                meta={renderMeta?.(item)}
                actions={actionsFor(item)}
                expandable={Boolean(renderExpanded)}
                expanded={expanded}
                onToggleExpand={() => toggleExpand(id)}
                expandHint={
                  renderExpanded ? (expanded ? 'Hide books' : 'Show books') : undefined
                }
              >
                {renderExpanded && expanded ? renderExpanded(item) : null}
              </EntityRow>
            )
          })}
        </YStack>
      )}

      {/* Mounted per open, so each opening starts from a clean form. */}
      {editing !== null ? (
        <EntityFormDialog
          testID={`${testID}-form`}
          open
          onOpenChange={(next) => (next ? undefined : closeForm())}
          title={editing === 'new' ? `Add ${noun}` : `Edit ${getName(editing)}`}
          fields={fields}
          initialValues={editing === 'new' ? emptyValues : toValues(editing)}
          submitLabel={editing === 'new' ? 'Add' : 'Save'}
          pendingLabel="Saving…"
          onSubmit={submitForm}
          isPending={create.isPending || update.isPending}
          error={create.isError ? create.error : update.isError ? update.error : null}
        />
      ) : null}

      {deleting !== null ? (
        <ConfirmDeleteDialog
          testID={`${testID}-delete`}
          open
          onOpenChange={(next) => (next ? undefined : setDeleting(null))}
          title={`Delete ${getName(deleting)}?`}
          description={deleteDescription(noun)}
          onConfirm={() =>
            remove.mutate(getId(deleting), { onSuccess: () => setDeleting(null) })
          }
          isPending={remove.isPending}
          error={remove.isError ? remove.error : null}
        />
      ) : null}
    </YStack>
  )
}

/**
 * What a delete actually costs, said plainly. None of these three cascade to
 * books — a book whose category is deleted becomes uncategorised, a copy whose
 * location is deleted simply has no shelf — and saying so is the difference
 * between a confirmation someone reads and one they dismiss.
 */
function deleteDescription(noun: string): string {
  if (noun === 'location') {
    return 'The copies shelved here keep existing; they just stop having a shelf.'
  }
  if (noun === 'category') {
    return 'Books in this category keep existing; they become uncategorised.'
  }
  return `Books by this ${noun} keep existing; they lose this ${noun}.`
}
