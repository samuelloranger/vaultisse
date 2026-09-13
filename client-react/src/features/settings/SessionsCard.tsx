import { useState } from 'react'
import { Button, Text, XStack, YStack } from 'tamagui'
import type { UserSession } from '@/api/user'
import { MutedText } from '@/components/Card'
import { ResponsiveDialog } from '@/components/ResponsiveDialog'
import { errorMessage, ScreenError } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useRevokeSession, useSessions } from '@/queries/user'
import { describeDevice, describeSession, formatWhen } from './deviceInfo'
import { SettingsSection } from './SettingsControls'

/** Where the server sends a browser whose session has just been revoked. */
const LOGIN_URL = '/login'

/**
 * Active sessions — one row per live login, not one per account.
 *
 * ## Why "log out this device" is real rather than cosmetic
 *
 * A JWT cannot be withdrawn once issued, so the server checks a `user_sessions`
 * row on **every** request. Revoking one sets `revoked_date`, and that device's
 * very next request fails. This list is the visible surface of that mechanism,
 * which is the reason it is worth showing at all.
 *
 * ## The current session is offered too, and confirmed differently
 *
 * Revoking your own session clears this browser's cookie. If the SPA stayed
 * mounted afterwards it would look signed in and 401 on everything, so the
 * screen leaves for `/login` itself. The confirmation says that plainly, because
 * "log out" next to "this device" reads like a row action rather than the end
 * of the session.
 */
function SessionRow({
  session,
  onRevoke,
  pending,
}: {
  session: UserSession
  onRevoke: () => void
  pending: boolean
}) {
  const { locale, t } = useLocale()
  return (
    <XStack
      testID="session-row"
      alignItems="center"
      gap="$3"
      minHeight={56}
      paddingVertical="$2"
      borderTopWidth={1}
      borderTopColor="$borderColor"
    >
      <YStack flex={1} minWidth={0} gap="$1">
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontSize={16} color="$color" fontWeight="600">
            {describeDevice(session.userAgent, t)}
          </Text>
          {session.isCurrent ? (
            <Text
              testID="session-current"
              fontSize={12}
              fontFamily="$mono"
              color="$secondary"
              textTransform="uppercase"
              letterSpacing={1}
            >
              {t('THIS_DEVICE', 'This device')}
            </Text>
          ) : null}
        </XStack>
        <MutedText fontSize={13}>{describeSession(session, locale, t)}</MutedText>
      </YStack>
      <Button
        testID={`session-revoke-${session.id}`}
        aria-label={t(
          'LOG_OUT_DEVICE',
          `Log out ${describeDevice(session.userAgent, t)}`,
          {
            device: describeDevice(session.userAgent, t),
          }
        )}
        onPress={onRevoke}
        disabled={pending}
        opacity={pending ? 0.5 : 1}
        minHeight={44}
        flexShrink={0}
        fontSize={15}
        paddingHorizontal="$3"
        borderRadius="$control"
        backgroundColor="transparent"
        borderWidth={0}
        // Neutral at rest; the warning belongs in the confirmation.
        color="$color"
      >
        {t('LOG_OUT', 'Log out')}
      </Button>
    </XStack>
  )
}

export function SessionsCard() {
  const { locale, t } = useLocale()
  const sessions = useSessions()
  const revoke = useRevokeSession()
  const [confirming, setConfirming] = useState<UserSession | null>(null)

  function confirm() {
    const target = confirming
    if (!target) return
    revoke.mutate(target.id, {
      onSuccess: () => {
        setConfirming(null)
        // The cookie is gone; staying here would be a tab that only looks
        // signed in. A real navigation, for the same reason `api/http.ts`
        // uses one: there is no SPA state left worth preserving.
        if (target.isCurrent) window.location.href = LOGIN_URL
      },
    })
  }

  return (
    <SettingsSection
      testID="settings-sessions"
      title={t('ACTIVE_SESSIONS', 'Active sessions')}
      description={t(
        'ACTIVE_SESSIONS_DESC',
        'Every device currently signed in to this account. A session you do not recognise is worth ending.'
      )}
    >
      {sessions.isPending ? (
        <MutedText testID="sessions-loading">
          {t('LOADING_SESSIONS', 'Loading sessions…')}
        </MutedText>
      ) : sessions.isError ? (
        <ScreenError
          error={sessions.error}
          onRetry={() => sessions.refetch()}
          title={t('SESSIONS_NOT_LOADED', 'Sessions did not load')}
        />
      ) : (
        <YStack>
          {(sessions.data ?? []).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              pending={revoke.isPending && confirming?.id === session.id}
              onRevoke={() => {
                revoke.reset()
                setConfirming(session)
              }}
            />
          ))}
        </YStack>
      )}

      {confirming ? (
        <ResponsiveDialog
          open
          onOpenChange={(next) => (next ? undefined : setConfirming(null))}
          title={
            confirming.isCurrent
              ? t('SIGN_OUT_DEVICE', 'Sign out of this device?')
              : t('LOG_OUT_THIS_DEVICE', 'Log out this device?')
          }
          description={
            confirming.isCurrent
              ? t('RETURN_TO_SIGN_IN', 'You will be taken back to the sign-in page.')
              : t(
                  'SESSION_STOPS_NEXT_REQUEST',
                  `${describeDevice(confirming.userAgent, t)} stops working on its next request.`,
                  {
                    device: describeDevice(confirming.userAgent, t),
                  }
                )
          }
          actions={
            <>
              <Button
                testID="session-revoke-cancel"
                onPress={() => setConfirming(null)}
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
                testID="session-revoke-confirm"
                onPress={confirm}
                disabled={revoke.isPending}
                opacity={revoke.isPending ? 0.5 : 1}
                minHeight={44}
                fontSize={16}
                borderRadius="$control"
                backgroundColor="$red10"
                color="$onPrimary"
              >
                {revoke.isPending
                  ? t('LOGGING_OUT', 'Logging out…')
                  : t('LOG_OUT', 'Log out')}
              </Button>
            </>
          }
        >
          <YStack gap="$2">
            <MutedText fontSize={14}>
              {t(
                'SIGNED_IN_FROM',
                `Signed in ${formatWhen(confirming.createdDate, locale)} from ${confirming.ipAddress ?? 'an unknown address'}.`,
                {
                  date: formatWhen(confirming.createdDate, locale),
                  address: confirming.ipAddress ?? 'an unknown address',
                }
              )}
            </MutedText>
            {revoke.isError ? (
              <Text testID="session-revoke-error" fontSize={14} color="$red10">
                {errorMessage(revoke.error)}
              </Text>
            ) : null}
          </YStack>
        </ResponsiveDialog>
      ) : null}
    </SettingsSection>
  )
}
