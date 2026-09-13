import { useState } from 'react'
import { Button, XStack, YStack } from 'tamagui'
import { DisplayText, Eyebrow } from '@/components/Card'
import { EmptyState, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
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
  /** Keeps entity-specific delete consequences stable after noun translation. */
  deleteDescriptionKind?: 'location' | 'category'
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

  /**
   * A strip between the title row and the list: tabs, filters, a counter.
   *
   * Added for the borrowers screen, which is two of these lists — borrowers and
   * groups — behind one nav entry and therefore needs a switch that belongs to
   * neither of them. It sits above the empty state as well as above a populated
   * list, because a screen whose list is empty is exactly when you want the
   * control that takes you to the other one.
   */
  toolbar?: React.ReactNode
  /**
   * What the expand toggle is called, when it is not opening a list of books.
   *
   * The wording is on screen twice — as the row's meta-line hint and as the
   * labelled entry in the actions menu, which is the only place a touch user
   * ever reads it — so it has to be able to say "Show members" for a screen
   * whose rows are not shelves.
   */
  expandLabels?: { show: string; hide: string }
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
  deleteDescriptionKind,
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
  toolbar,
  expandLabels,
  renderMeta,
  renderExpanded,
  extraActions,
}: EntityListScreenProps<T, TInput>) {
  /** The row being edited, or `'new'` while creating, or `null` when closed. */
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  const [deleting, setDeleting] = useState<T | null>(null)
  const [expandedIds, setExpandedIds] = useState<number[]>([])
  const { t } = useLocale()
  const resolvedExpandLabels = expandLabels ?? {
    show: t('SHOW_BOOKS', 'Show books'),
    hide: t('HIDE_BOOKS', 'Hide books'),
  }

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
        label: expandedIds.includes(id)
          ? resolvedExpandLabels.hide
          : resolvedExpandLabels.show,
        onSelect: () => toggleExpand(id),
      })
    }

    if (extraActions) actions.push(...extraActions(item))

    actions.push({
      key: 'edit',
      label: t('EDIT', 'Edit'),
      onSelect: () => openEdit(item),
    })
    actions.push({
      key: 'delete',
      label: t('DELETE', 'Delete'),
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

  if (query.isPending || query.isError) {
    return (
      // The toolbar renders here too: when it carries a tab switch, it is the
      // only way off a tab whose list failed to load.
      //
      // Deliberately *not* `testID` — that one marks the loaded screen, and a
      // test or a Playwright step that waits for it must not be satisfied by a
      // spinner wearing the same name.
      <YStack gap="$4" testID={`${testID}-state`}>
        {toolbar}
        {query.isPending ? (
          <ScreenLoading label={loadingLabel} />
        ) : (
          <ScreenError
            error={query.error}
            onRetry={() => query.refetch()}
            title={errorTitle}
          />
        )}
      </YStack>
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

      {toolbar}

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
                  renderExpanded
                    ? expanded
                      ? resolvedExpandLabels.hide
                      : resolvedExpandLabels.show
                    : undefined
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
          title={
            editing === 'new'
              ? t('ENTITY_ADD', `Add ${noun}`, { noun })
              : t('ENTITY_EDIT', `Edit ${getName(editing)}`, {
                  name: getName(editing),
                })
          }
          fields={fields}
          initialValues={editing === 'new' ? emptyValues : toValues(editing)}
          submitLabel={editing === 'new' ? t('ADD', 'Add') : t('SAVE', 'Save')}
          pendingLabel={t('SAVING', 'Saving…')}
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
          title={t('ENTITY_DELETE_TITLE', `Delete ${getName(deleting)}?`, {
            name: getName(deleting),
          })}
          description={deleteDescription(deleteDescriptionKind, noun, t)}
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
function deleteDescription(
  kind: 'location' | 'category' | undefined,
  noun: string,
  t: (
    code: string,
    fallback: string,
    values?: Record<string, string | number>
  ) => string
): string {
  if (kind === 'location') {
    return t(
      'DELETE_LOCATION_DESCRIPTION',
      'The copies shelved here keep existing; they just stop having a shelf.'
    )
  }
  if (kind === 'category') {
    return t(
      'DELETE_CATEGORY_DESCRIPTION',
      'Books in this category keep existing; they become uncategorised.'
    )
  }
  return t(
    'DELETE_ENTITY_DESCRIPTION',
    `Books by this ${noun} keep existing; they lose this ${noun}.`,
    {
      noun,
    }
  )
}
