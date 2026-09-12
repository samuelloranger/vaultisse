import type { AuthorInput, AuthorRow } from '@/api/author'
import { EntityListScreen } from '@/features/entityList/EntityListScreen'
import type { EntityFormField } from '@/features/entityList/types'
import {
  useAuthors,
  useCreateAuthor,
  useDeleteAuthor,
  useUpdateAuthor,
} from '@/queries/author'

/**
 * Authors.
 *
 * Structurally identical to Categories — a shared, instance-wide list of names
 * with unique-name constraints, so two members adding "Ursula K. Le Guin" land
 * on the same row rather than splitting her books across two.
 *
 * Like categories, no per-row book count: `GET /author` answers `{id, name}`.
 */
const FIELDS: EntityFormField[] = [
  {
    name: 'name',
    label: 'Name',
    placeholder: 'e.g. Ursula K. Le Guin',
    // Deliberately not `'name'`. That would offer the *browser user's* own
    // name, which is never the author being catalogued.
    autoComplete: 'off',
    inputMode: 'text',
    required: true,
  },
]

export function AuthorsScreen() {
  const query = useAuthors()
  const create = useCreateAuthor()
  const update = useUpdateAuthor()
  const remove = useDeleteAuthor()

  return (
    <EntityListScreen<AuthorRow, AuthorInput>
      testID="authors-screen"
      eyebrow="Catalogue"
      title="Authors"
      noun="author"
      addLabel="Add author"
      loadingLabel="Loading authors…"
      errorTitle="The authors did not load"
      emptyTitle="No authors yet"
      emptyDescription="Authors are shared across the library; adding a book is usually what creates one."
      query={query}
      create={create}
      update={update}
      remove={remove}
      fields={FIELDS}
      getId={(author) => author.id}
      getName={(author) => author.name}
      toValues={(author) => ({ name: author.name })}
      toInput={(values) => ({ name: values.name ?? '' })}
    />
  )
}
