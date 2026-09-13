import type { AuthorInput, AuthorRow } from '@/api/author'
import { EntityListScreen } from '@/features/entityList/EntityListScreen'
import type { EntityFormField } from '@/features/entityList/types'
import { useDocumentTitle } from '@/lib/documentTitle'
import { useLocale } from '@/locale/LocaleProvider'
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
export function AuthorsScreen() {
  const { t } = useLocale()
  useDocumentTitle(t('AUTHORS', 'Authors'))
  const query = useAuthors()
  const create = useCreateAuthor()
  const update = useUpdateAuthor()
  const remove = useDeleteAuthor()
  const fields: EntityFormField[] = [
    {
      name: 'name',
      label: t('NAME', 'Name'),
      placeholder: t('AUTHOR_NAME_PLACEHOLDER', 'e.g. Ursula K. Le Guin'),
      // Deliberately not `'name'`. That would offer the *browser user's* own
      // name, which is never the author being catalogued.
      autoComplete: 'off',
      inputMode: 'text',
      required: true,
    },
  ]

  return (
    <EntityListScreen<AuthorRow, AuthorInput>
      testID="authors-screen"
      eyebrow={t('CATALOGUE', 'Catalogue')}
      title={t('AUTHORS', 'Authors')}
      noun={t('AUTHOR', 'author')}
      addLabel={t('ADD_AUTHOR', 'Add author')}
      loadingLabel={t('LOADING_AUTHORS', 'Loading authors…')}
      errorTitle={t('AUTHORS_NOT_LOADED', 'The authors did not load')}
      emptyTitle={t('AUTHORS_EMPTY', 'No authors yet')}
      emptyDescription={t(
        'AUTHORS_EMPTY_DESC',
        'Authors are shared across the library; adding a book is usually what creates one.'
      )}
      query={query}
      create={create}
      update={update}
      remove={remove}
      fields={fields}
      getId={(author) => author.id}
      getName={(author) => author.name}
      toValues={(author) => ({ name: author.name })}
      toInput={(values) => ({ name: values.name ?? '' })}
    />
  )
}
