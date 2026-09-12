import { useState } from 'react'
import { Text, XStack, YStack } from 'tamagui'
import type { AdminAccount } from '@/api/admin'
import { MutedText } from '@/components/Card'
import { EmptyState, ScreenError, ScreenLoading } from '@/components/ScreenState'
import { ConfirmDeleteDialog } from '@/features/entityList/ConfirmDeleteDialog'
import { EntityRow } from '@/features/entityList/EntityRow'
import type { EntityRowAction } from '@/features/entityList/types'
import { useAdminUsers, useDeleteAdminUser, useUpdateAdminUser } from '@/queries/admin'

/**
 * Admin → **Accounts**. Every account on the instance, and the four things an
 * admin can do to one.
 *
 * This was the whole of `/app/admin` before the screen grew tabs, and it is
 * unchanged apart from losing the page header to the shell above it. The
 * reasoning it came with is still the reasoning:
 *
 * ## It reuses the catalogue row, not the catalogue screen
 *
 * `EntityRow` + `RowActions` + `ConfirmDeleteDialog` are exactly right here —
 * a list of named rows whose actions collapse to one overflow control on a
 * phone — and reusing them is how this screen inherits the hard-won parts
 * (nothing red at rest, 44px targets, every modal a `ResponsiveDialog`) for
 * free.
 *
 * `EntityListScreen` itself is not, and forcing it would be worse than not
 * reusing it: that component is built around create/edit through a field form
 * plus delete, and this resource has **no create at all** (accounts arrive by
 * registration) and an "edit" that is two independent toggles the server may
 * refuse on policy grounds rather than a form to fill in.
 *
 * ## The guard rails' own sentences reach the user
 *
 * They are written server-side to be read by the person who hit them ("This is
 * the only administrator left — promote another account first."), so they are
 * shown verbatim rather than replaced with a generic failure.
 */

/** Message for an error, preferring the server's own sentence. */
function refusalMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

function roleLabel(account: AdminAccount): string {
  return account.role === 'admin' ? 'Administrator' : 'Member'
}

function AccountMeta({ account }: { account: AdminAccount }) {
  const pending = account.lastLoginDate === null
  return (
    <XStack alignItems="center" gap="$2" flexWrap="wrap">
      <MutedText fontSize={13}>{account.email}</MutedText>
      <MutedText fontSize={13}>· {roleLabel(account)}</MutedText>
      {account.disabled ? (
        <Text testID="account-disabled" fontSize={13} color="$red10">
          · Disabled
        </Text>
      ) : null}
      {pending ? (
        <MutedText fontSize={13} color="$secondary">
          · Never signed in
        </MutedText>
      ) : null}
      {account.isSelf ? (
        <Text
          testID="account-self"
          fontSize={12}
          fontFamily="$mono"
          color="$secondary"
          textTransform="uppercase"
          letterSpacing={1}
        >
          You
        </Text>
      ) : null}
    </XStack>
  )
}

export function AdminAccountsTab() {
  const accounts = useAdminUsers()
  const update = useUpdateAdminUser()
  const remove = useDeleteAdminUser()
  const [deleting, setDeleting] = useState<AdminAccount | null>(null)
  /** The row whose action was last refused, and what the server said. */
  const [refusal, setRefusal] = useState<{ id: number; message: string } | null>(null)

  function run(
    account: AdminAccount,
    patch: { role?: 'admin' | 'user'; disabled?: boolean }
  ) {
    setRefusal(null)
    update.mutate(
      { id: account.id, patch },
      {
        onError: (error) =>
          setRefusal({ id: account.id, message: refusalMessage(error) }),
      }
    )
  }

  function actionsFor(account: AdminAccount): EntityRowAction[] {
    const busy = update.isPending
    return [
      {
        key: 'role',
        label: account.role === 'admin' ? 'Demote to member' : 'Promote to admin',
        // The server refuses this on yourself regardless; `isSelf` is the only
        // signal the client has, because the policy deliberately does not carry
        // the caller's user id.
        disabled: account.isSelf || busy,
        onSelect: () =>
          run(account, { role: account.role === 'admin' ? 'user' : 'admin' }),
      },
      {
        key: 'disabled',
        label: account.disabled ? 'Enable account' : 'Disable account',
        disabled: (account.isSelf && !account.disabled) || busy,
        onSelect: () => run(account, { disabled: !account.disabled }),
      },
      {
        key: 'delete',
        label: 'Delete account',
        destructive: true,
        disabled: account.isSelf,
        onSelect: () => {
          remove.reset()
          setRefusal(null)
          setDeleting(account)
        },
      },
    ]
  }

  if (accounts.isPending) return <ScreenLoading label="Loading accounts…" />

  if (accounts.isError) {
    return (
      <ScreenError
        error={accounts.error}
        onRetry={() => accounts.refetch()}
        title="Accounts did not load"
      />
    )
  }

  const rows = accounts.data ?? []
  const pendingApproval = rows.filter((account) => account.disabled).length

  return (
    <YStack gap="$3" testID="admin-accounts">
      <MutedText>
        {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
        {pendingApproval > 0 ? ` · ${pendingApproval} disabled` : ''}
      </MutedText>

      {rows.length === 0 ? (
        <EmptyState
          title="No accounts"
          description="Accounts appear here as people register."
        />
      ) : (
        <YStack gap="$3">
          {rows.map((account) => (
            <YStack key={account.id} gap="$1">
              <EntityRow
                testID="admin-row"
                name={account.name}
                meta={<AccountMeta account={account} />}
                actions={actionsFor(account)}
                expandable={false}
                expanded={false}
                onToggleExpand={() => undefined}
              />
              {/*
                The guard rail's own sentence, under the row it refused. Not a
                toast: the message explains a rule about *this* account, and it
                has to stay on screen next to it while it is read.
              */}
              {refusal?.id === account.id ? (
                <Text
                  testID="admin-refusal"
                  role="alert"
                  fontSize={14}
                  color="$red10"
                  paddingHorizontal="$3"
                >
                  {refusal.message}
                </Text>
              ) : null}
            </YStack>
          ))}
        </YStack>
      )}

      {deleting ? (
        <ConfirmDeleteDialog
          testID="admin-delete"
          open
          onOpenChange={(next) => (next ? undefined : setDeleting(null))}
          title={`Delete ${deleting.name}?`}
          description="Their books, copies, authors, locations and loan history stay in the shared library — they only lose the “added by” attribution."
          onConfirm={() =>
            remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
          }
          isPending={remove.isPending}
          error={remove.isError ? remove.error : null}
        />
      ) : null}
    </YStack>
  )
}
