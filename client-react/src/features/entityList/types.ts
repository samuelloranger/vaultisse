import type { FieldProps } from '@/components/Field'

/**
 * The vocabulary the three catalogue screens share.
 *
 * Locations, categories and authors are the same screen three times: a list of
 * named rows with create / edit / delete, optionally a count and an expandable
 * body. They are built from one pattern rather than three near-copies, and this
 * file is that pattern's interface.
 *
 * ## Why the screen takes structural types, not TanStack ones
 *
 * {@link EntityQuery} and {@link EntityMutation} describe *the parts of a query
 * or mutation result this pattern uses* rather than importing
 * `UseQueryResult` / `UseMutationResult`. Two reasons, in order of importance:
 *
 *  1. It keeps the presentation layer honest about its dependencies. The screen
 *     needs "is it pending, what is the error, fire it with these values" — not
 *     a cache client.
 *  2. Real hooks satisfy these shapes structurally, so screens pass their real
 *     `useCreateLocation()` in and tests exercise the real cache key and the
 *     real invalidation, exactly as `DashboardScreen.test.tsx` insists.
 */

/** A form's values, keyed by {@link EntityFormField.name}. Always strings. */
export type EntityValues = Record<string, string>

/**
 * One input in the create/edit dialog.
 *
 * `autoComplete` and `inputMode` are required here because `components/Field`
 * requires them, and `Field` requires them because they are the difference
 * between a usable and an unusable form on a phone.
 */
export type EntityFormField = {
  /** Key in {@link EntityValues}. */
  name: string
  label: string
  placeholder?: string
  autoComplete: FieldProps['autoComplete']
  inputMode: FieldProps['inputMode']
  /** Blocks submit while empty. Exactly one field per entity is required today. */
  required?: boolean
}

/**
 * One entry in a row's action set.
 *
 * The set is rendered as a single overflow control on phones and as an inline
 * strip above `sm` — see `RowActions.tsx` for why that is not negotiable.
 */
export type EntityRowAction = {
  /** Stable identifier, used as the React key and the testID suffix. */
  key: string
  label: string
  onSelect: () => void
  /**
   * Red-tints this entry **in the open menu only**, never in the resting row.
   * A permanently red delete control sitting beside edit in a 390px row is an
   * invitation to misfire; the warning belongs at the moment of choosing, and
   * again in the confirmation that follows.
   */
  destructive?: boolean
  disabled?: boolean
}

/** The parts of a `useQuery` result this pattern reads. */
export type EntityQuery<T> = {
  data: T[] | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

/** The parts of a `useMutation` result this pattern drives. */
export type EntityMutation<TVariables> = {
  mutate: (variables: TVariables, options?: { onSuccess?: () => void }) => void
  isPending: boolean
  isError: boolean
  error: unknown
  reset: () => void
}

/**
 * Variables for the "save an existing row" mutation.
 *
 * Generic in the resource's own input type (`LocationInput`, `CategoryInput`,
 * ...) rather than passing {@link EntityValues} straight through: the form
 * speaks in strings keyed by field name, the API speaks in a typed body, and
 * the screen's `toInput` is the one place that crosses between them.
 */
export type EntityUpdateVariables<TInput> = {
  id: number
  input: TInput
}
