import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { BookAuthorRef, BookDetail, BookUpdate } from '@/api/book'
import type { Policy } from '@/api/types'
import { Card, DisplayText, Eyebrow } from '@/components/Card'
import { Field } from '@/components/Field'
import { errorMessage } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useUpdateBook } from '@/queries/book'
import { AuthorPicker } from './AuthorPicker'
import { DateField, SelectField, TextAreaField } from './BookFields'

/**
 * The book's metadata: a read-only view that swaps to an edit form in place.
 *
 * ## Layout
 *
 * Everything is a wrapping flex row with `flexBasis` and `minWidth: 0` — never
 * a percentage width. The old form was a hand-rolled two-up of
 * `style="width: 50%"` pairs, which at 390px put the published-date field at
 * about 150px: narrower than the native date picker's own controls, so the
 * control the phone renders did not fit the box the app gave it. Flex basis
 * degrades to one column when there is no room for two, with no media query.
 *
 * ## The update body is the whole record
 *
 * `PUT /book/:id` overwrites all ten metadata columns from the body rather than
 * merging, so a field this form does not send is written as `null`. That is why
 * `toUpdate` passes `image_url` straight back through even though this card
 * never edits it — the cover is changed by its own endpoint, and leaving it out
 * here would erase it on every save.
 *
 * `authors` is the one genuinely optional key: the server reconciles
 * `book_authors` only when it is an array. Sending `[]` unlinks every author,
 * so a form that cannot edit authors must omit it rather than send an empty
 * list. This one can edit them, so it sends the full desired list.
 */

const EMPTY = '—'

/** The server hands back a timestamp for a `date` column; `<input type="date">` wants `YYYY-MM-DD`. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

type Draft = {
  name: string
  isbn: string
  categoryId: number | null
  languageCode: string | null
  formatId: number | null
  pages: string
  publisher: string
  publishedDate: string
  description: string
  authors: BookAuthorRef[]
}

function draftFrom(book: BookDetail): Draft {
  return {
    name: book.name,
    isbn: book.isbn ?? '',
    categoryId: book.category_id,
    languageCode: book.language_code,
    formatId: book.format_id,
    pages: book.pages === null ? '' : String(book.pages),
    publisher: book.publisher ?? '',
    publishedDate: toDateInput(book.published_date),
    description: book.description ?? '',
    authors: book.authors,
  }
}

function toUpdate(book: BookDetail, draft: Draft): BookUpdate {
  const pages = Number(draft.pages)
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    // Unchanged, but the PUT overwrites every column — see BookUpdate's note.
    image_url: book.image_url,
    isbn: draft.isbn.trim() || null,
    category_id: draft.categoryId,
    language_code: draft.languageCode,
    publisher: draft.publisher.trim() || null,
    published_date: draft.publishedDate || null,
    pages: draft.pages.trim() === '' || Number.isNaN(pages) ? null : pages,
    format_id: draft.formatId,
    authors: draft.authors.map((author) => author.id),
  }
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  return (
    <YStack gap="$0.5" flexGrow={1} flexBasis={150} minWidth={0}>
      <Eyebrow numberOfLines={1}>{label}</Eyebrow>
      <Text fontSize={15} color="$color">
        {value || EMPTY}
      </Text>
    </YStack>
  )
}

export function BookMetaCard({ book, policy }: { book: BookDetail; policy: Policy }) {
  const { formatDate } = useLocale()
  const [draft, setDraft] = useState<Draft | null>(null)
  const update = useUpdateBook(book.id)

  const categoryName =
    policy.categories.find((c) => c.id === book.category_id)?.name ?? null
  const languageName =
    policy.languages.find((l) => l.code === book.language_code)?.name ?? null
  const formatName = policy.formats.find((f) => f.id === book.format_id)?.name ?? null

  function startEditing() {
    update.reset()
    setDraft(draftFrom(book))
  }

  function cancel() {
    update.reset()
    setDraft(null)
  }

  function save() {
    if (!draft || draft.name.trim() === '') return
    update.mutate(toUpdate(book, draft), { onSuccess: () => setDraft(null) })
  }

  function patch(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current))
  }

  return (
    <Card gap="$3" testID="book-meta">
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="$3"
        flexWrap="wrap"
      >
        <YStack gap="$1" flexGrow={1} flexBasis={200} minWidth={0}>
          <Eyebrow>Book</Eyebrow>
          <DisplayText fontSize={24} lineHeight={30}>
            {book.name}
          </DisplayText>
          {book.isbn ? (
            <Text fontFamily="$mono" fontSize={13} color="$colorMuted">
              ISBN {book.isbn}
            </Text>
          ) : null}
        </YStack>

        <XStack gap="$2" flexWrap="wrap">
          {draft ? (
            <>
              <Button
                testID="cancel-edit"
                onPress={cancel}
                disabled={update.isPending}
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
                testID="save-book"
                onPress={save}
                disabled={update.isPending || draft.name.trim() === ''}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="$primary"
                color="$onPrimary"
              >
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <Button
              testID="edit-book"
              onPress={startEditing}
              minHeight={44}
              fontSize={16}
              borderRadius="$control"
              backgroundColor="$primary"
              color="$onPrimary"
            >
              Edit
            </Button>
          )}
        </XStack>
      </XStack>

      {update.isError ? (
        <Text testID="book-save-error" fontSize={14} color="$red10">
          {errorMessage(update.error)}
        </Text>
      ) : null}

      {draft ? (
        <YStack gap="$3" testID="book-edit-form">
          <XStack flexWrap="wrap" gap="$3">
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <Field
                testID="edit-name"
                label="Title"
                value={draft.name}
                onChangeText={(next) => patch({ name: next })}
                autoComplete="off"
                inputMode="text"
                error={draft.name.trim() === '' ? 'A title is required.' : null}
              />
            </YStack>
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <Field
                testID="edit-isbn"
                label="ISBN"
                value={draft.isbn}
                onChangeText={(next) => patch({ isbn: next })}
                autoComplete="off"
                inputMode="numeric"
              />
            </YStack>
          </XStack>

          <XStack flexWrap="wrap" gap="$3">
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <SelectField
                testID="edit-category"
                label="Category"
                value={draft.categoryId}
                options={policy.categories.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(next) => patch({ categoryId: next })}
                emptyLabel="Uncategorised"
              />
            </YStack>
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <SelectField
                testID="edit-language"
                label="Language"
                value={draft.languageCode}
                options={policy.languages.map((l) => ({
                  value: l.code,
                  label: l.name,
                }))}
                onChange={(next) => patch({ languageCode: next })}
                emptyLabel="Not set"
              />
            </YStack>
          </XStack>

          <XStack flexWrap="wrap" gap="$3">
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <SelectField
                testID="edit-format"
                label="Format"
                value={draft.formatId}
                options={policy.formats.map((f) => ({ value: f.id, label: f.name }))}
                onChange={(next) => patch({ formatId: next })}
                emptyLabel="Not set"
              />
            </YStack>
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <Field
                testID="edit-pages"
                label="Pages"
                value={draft.pages}
                onChangeText={(next) => patch({ pages: next.replace(/[^0-9]/g, '') })}
                autoComplete="off"
                inputMode="numeric"
              />
            </YStack>
          </XStack>

          <XStack flexWrap="wrap" gap="$3">
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <Field
                testID="edit-publisher"
                label="Publisher"
                value={draft.publisher}
                onChangeText={(next) => patch({ publisher: next })}
                autoComplete="organization"
                inputMode="text"
              />
            </YStack>
            <YStack flexGrow={1} flexBasis={200} minWidth={0}>
              <DateField
                testID="edit-published-date"
                label="Published"
                value={draft.publishedDate}
                onChange={(next) => patch({ publishedDate: next })}
              />
            </YStack>
          </XStack>

          <TextAreaField
            testID="edit-description"
            label="Description"
            value={draft.description}
            onChangeText={(next) => patch({ description: next })}
          />

          <AuthorPicker
            selected={draft.authors}
            onChange={(next) => patch({ authors: next })}
          />
        </YStack>
      ) : (
        <YStack gap="$3" testID="book-meta-view">
          <XStack flexWrap="wrap" gap="$3" rowGap="$3">
            <FieldRow label="Category" value={categoryName} />
            <FieldRow label="Language" value={languageName} />
            <FieldRow label="Format" value={formatName} />
            <FieldRow
              label="Pages"
              value={book.pages === null ? null : String(book.pages)}
            />
            <FieldRow label="Publisher" value={book.publisher} />
            <FieldRow
              label="Published"
              value={book.published_date ? formatDate(book.published_date) : null}
            />
          </XStack>

          <YStack gap="$1">
            <Eyebrow>Authors</Eyebrow>
            {book.authors.length > 0 ? (
              <XStack flexWrap="wrap" gap="$2" testID="book-authors">
                {book.authors.map((author) => (
                  <YStack
                    key={author.id}
                    paddingHorizontal="$3"
                    paddingVertical="$1.5"
                    borderRadius="$control"
                    borderWidth={1}
                    borderColor="$borderColor"
                    backgroundColor="$surfaceAlt"
                  >
                    <Text fontSize={14} color="$color">
                      {author.name}
                    </Text>
                  </YStack>
                ))}
              </XStack>
            ) : (
              <Text fontSize={15} color="$color">
                {EMPTY}
              </Text>
            )}
          </YStack>

          {book.description ? (
            <YStack gap="$1">
              <Eyebrow>Description</Eyebrow>
              <Text fontSize={14} lineHeight={22} color="$color">
                {book.description}
              </Text>
            </YStack>
          ) : null}
        </YStack>
      )}
    </Card>
  )
}
