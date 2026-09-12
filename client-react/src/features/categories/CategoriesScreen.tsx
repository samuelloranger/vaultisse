import type { CategoryInput, CategoryRow } from '@/api/category'
import { EntityListScreen } from '@/features/entityList/EntityListScreen'
import type { EntityFormField } from '@/features/entityList/types'
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/queries/category'

/**
 * Categories — genres and shelving sections.
 *
 * The simplest of the three catalogue screens: a row is a name, and that is the
 * whole table (`GET /category` answers `{id, name}`). There is no per-row count
 * because the REST contract does not offer one and counting client-side would
 * mean a request per category; see the report accompanying this work.
 *
 * Everything visible here — the one overflow control per row, the sheet-based
 * form, the confirmation — comes from `features/entityList`. This file is the
 * configuration and the hook wiring, and that is the intended shape: the next
 * catalogue screen should also be this short.
 */
const FIELDS: EntityFormField[] = [
  {
    name: 'name',
    label: 'Name',
    placeholder: 'e.g. Science-fiction',
    // Not `autoComplete="on"`: the browser's saved values are the user's own
    // details, none of which is ever a genre.
    autoComplete: 'off',
    inputMode: 'text',
    required: true,
  },
]

export function CategoriesScreen() {
  const query = useCategories()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const remove = useDeleteCategory()

  return (
    <EntityListScreen<CategoryRow, CategoryInput>
      testID="categories-screen"
      eyebrow="Catalogue"
      title="Categories"
      noun="category"
      addLabel="Add category"
      loadingLabel="Loading categories…"
      errorTitle="The categories did not load"
      emptyTitle="No categories yet"
      emptyDescription="Categories group books by genre or shelving section, and drive the dashboard's shelves."
      query={query}
      create={create}
      update={update}
      remove={remove}
      fields={FIELDS}
      getId={(category) => category.id}
      getName={(category) => category.name}
      toValues={(category) => ({ name: category.name })}
      toInput={(values) => ({ name: values.name ?? '' })}
    />
  )
}
