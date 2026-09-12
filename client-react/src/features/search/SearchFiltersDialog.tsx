import { Button, Text, XStack, YStack } from 'tamagui'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { DateField, FilterChip } from './SearchControls'
import { clearedFilters, type SearchScreenParams } from './searchParams'

/**
 * Every control that narrows or reorders the library, in a drawer.
 *
 * ## Why a drawer at all
 *
 * Inline, this block was about 900px tall on a 390px phone — two and a half
 * screens of chips before the first book. The results are the page; the
 * controls are how you get to them.
 *
 * ## Why it goes through `ResponsiveDialog`
 *
 * Because that component already is the answer: `Sheet` below `sm`, centred
 * `Dialog` from `sm` up, one scrolling body, an action row pinned clear of the
 * home indicator, and Escape wired up on the sheet branch where Tamagui does
 * not do it. Writing a second `Sheet` here would be a second copy of all of
 * that, and the first one to drift would be this one.
 *
 * It also owns the mount rule now. This file used to carry its own
 * `useMountedWhileOpen`, because twenty-odd chips left in the tab order behind
 * a closed drawer was the worst instance of a problem every dialog had — but
 * "the worst instance" was never a reason for a local fix, and the hook is in
 * `components/useMountedWhileOpen.ts` where every caller gets it.
 *
 * Desktop gets the dialog rather than keeping the old inline card. That is a
 * deliberate call, not an oversight: the inline card cost a desktop reader the
 * same 400-odd pixels above the grid, and a `$gtSm` branch would mean two
 * layouts of the same controls, kept in step by hand. Nothing is lost — the
 * count is on the trigger, the trigger is next to the search box, and Escape
 * and the backdrop both close it.
 *
 * ## Why the filters apply live, with no "Apply" button
 *
 * Filter state is the URL (see `searchParams.ts`), and the route writes it with
 * `replace: true`. An "Apply" button would mean a second, draft copy of that
 * state living in this component, which then has to be reconciled with every
 * way the URL can change underneath it — a deep link, the back button, the
 * "Clear filters" button in the empty state. That is the bug class the
 * URL-as-state design exists to avoid, and buying it back for one button is a
 * bad trade.
 *
 * The real argument for "Apply" is that on a phone the sheet covers the very
 * results you are filtering. So the sheet says what it is doing to them: the
 * description line under the title is the live match count, and it updates as
 * the chips are tapped. Nobody has to close the drawer to find out what they
 * did.
 */

export function SearchFiltersDialog({
  open,
  onOpenChange,
  params,
  onParamsChange,
  categories,
  /** The live match count, e.g. `"7 books match"`. Shown under the title. */
  resultSummary,
  sortOptions,
  stockOptions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  params: SearchScreenParams
  onParamsChange: (next: SearchScreenParams) => void
  categories: { id: number; name: string }[]
  resultSummary: string
  sortOptions: readonly { value: SearchScreenParams['sort']; label: string }[]
  stockOptions: readonly { value: SearchScreenParams['stock']; label: string }[]
}) {
  function update(patch: Partial<SearchScreenParams>) {
    onParamsChange({ ...params, ...patch })
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description={resultSummary}
      actions={
        <>
          <Button
            testID="filters-clear"
            onPress={() => onParamsChange(clearedFilters(params))}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="transparent"
            borderColor="$borderColor"
            color="$color"
          >
            Clear all
          </Button>
          <Button
            testID="filters-done"
            onPress={() => onOpenChange(false)}
            minHeight={44}
            fontSize={16}
            borderRadius="$control"
            backgroundColor="$primary"
            color="$onPrimary"
          >
            Done
          </Button>
        </>
      }
    >
      <YStack gap="$2">
        <Text fontSize={14} color="$colorMuted">
          Category
        </Text>
        <XStack flexWrap="wrap" gap="$2">
          <FilterChip
            testID="category-all"
            label="All"
            selected={params.categoryId === undefined}
            onPress={() => update({ categoryId: undefined })}
          />
          {categories.map((category) => (
            <FilterChip
              key={category.id}
              testID={`category-${category.id}`}
              label={category.name}
              selected={params.categoryId === category.id}
              onPress={() =>
                update({
                  categoryId:
                    params.categoryId === category.id ? undefined : category.id,
                })
              }
            />
          ))}
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontSize={14} color="$colorMuted">
          Copies
        </Text>
        <XStack flexWrap="wrap" gap="$2">
          <FilterChip
            testID="stock-any"
            label="Any"
            selected={params.stock === undefined}
            onPress={() => update({ stock: undefined })}
          />
          {stockOptions.map((option) => (
            <FilterChip
              key={option.value}
              testID={`stock-${option.value}`}
              label={option.label}
              selected={params.stock === option.value}
              onPress={() =>
                update({
                  stock: params.stock === option.value ? undefined : option.value,
                })
              }
            />
          ))}
          <FilterChip
            testID="filter-recent"
            label="Added recently"
            selected={params.recent === true}
            onPress={() => update({ recent: params.recent ? undefined : true })}
          />
        </XStack>
      </YStack>

      <YStack gap="$2">
        <Text fontSize={14} color="$colorMuted">
          Added between
        </Text>
        <XStack flexWrap="wrap" gap="$3">
          <YStack flexGrow={1} flexBasis={150} minWidth={0}>
            <DateField
              testID="date-from"
              label="From"
              value={params.from ?? ''}
              onChange={(next) => update({ from: next || undefined })}
            />
          </YStack>
          <YStack flexGrow={1} flexBasis={150} minWidth={0}>
            <DateField
              testID="date-to"
              label="To"
              value={params.to ?? ''}
              onChange={(next) => update({ to: next || undefined })}
            />
          </YStack>
        </XStack>
      </YStack>

      {/* Sort and grouping are in here too — they are the rest of what made the
          inline card tall — but they are headed "Display" and left out of the
          count, because neither changes which books come back. */}
      <YStack gap="$2">
        <Text fontSize={14} color="$colorMuted">
          Display
        </Text>
        <XStack flexWrap="wrap" gap="$2">
          {sortOptions.map((option) => (
            <FilterChip
              key={option.value}
              testID={`sort-${option.value}`}
              label={option.label}
              selected={(params.sort ?? 'NAME_ASC') === option.value}
              onPress={() => update({ sort: option.value })}
            />
          ))}
        </XStack>
        <XStack flexWrap="wrap" gap="$2">
          {/* A named control, not an icon with a tooltip. */}
          <FilterChip
            testID="toggle-group"
            label="Group by category"
            selected={params.group === true}
            onPress={() => update({ group: params.group ? undefined : true })}
          />
        </XStack>
      </YStack>
    </ResponsiveDialog>
  )
}
