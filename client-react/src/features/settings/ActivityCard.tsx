import { Text, XStack, YStack } from 'tamagui'
import { MutedText } from '@/components/Card'
import { AlertTriangle } from '@/components/icons'
import { ScreenError } from '@/components/ScreenState'
import { useLocale } from '@/locale/LocaleProvider'
import { useActivity } from '@/queries/user'
import { describeActivity, formatWhen, isActivityAlarming } from './deviceInfo'
import { SettingsSection } from './SettingsControls'

/**
 * Recent sign-in activity — the caller's own auth events, newest first.
 *
 * ## Failed attempts are the point of the list
 *
 * `GET /user/activity` includes `login_failed` deliberately: the server
 * attributes a wrong-password attempt to the account whose username matched, so
 * "somebody tried your password and failed" lands here. That is the one entry
 * worth acting on, so it is the one entry marked — the rest are a timeline, and
 * a timeline where everything is emphasised says nothing.
 *
 * There is no anomaly detection behind this (see
 * `docs/AUTHENTICATION.md#known-limitations`). The list exists so a person can
 * notice, which only works if a person can read it: absolute timestamps rather
 * than "2 hours ago", and the IP spelled out.
 */
export function ActivityCard() {
  const { locale, t } = useLocale()
  const activity = useActivity()

  return (
    <SettingsSection
      testID="settings-activity"
      title={t('RECENT_SIGN_IN_ACTIVITY', 'Recent sign-in activity')}
      description={t(
        'RECENT_SIGN_IN_ACTIVITY_DESC',
        'Sign-ins, sign-outs, password changes — and failed attempts against this account.'
      )}
    >
      {activity.isPending ? (
        <MutedText testID="activity-loading">
          {t('LOADING_ACTIVITY', 'Loading activity…')}
        </MutedText>
      ) : activity.isError ? (
        <ScreenError
          error={activity.error}
          onRetry={() => activity.refetch()}
          title={t('ACTIVITY_NOT_LOADED', 'Activity did not load')}
        />
      ) : (activity.data ?? []).length === 0 ? (
        <MutedText testID="activity-empty">
          {t('NOTHING_RECORDED', 'Nothing recorded yet.')}
        </MutedText>
      ) : (
        <YStack>
          {(activity.data ?? []).map((entry) => {
            const alarming = isActivityAlarming(entry)
            return (
              <XStack
                key={entry.id}
                testID="activity-row"
                alignItems="center"
                gap="$2"
                minHeight={44}
                paddingVertical="$2"
                borderTopWidth={1}
                borderTopColor="$borderColor"
                flexWrap="wrap"
              >
                {alarming ? <AlertTriangle size={16} color="$red10" /> : null}
                <Text
                  fontSize={15}
                  color={alarming ? '$red10' : '$color'}
                  flex={1}
                  minWidth={140}
                >
                  {describeActivity(entry, t)}
                </Text>
                <MutedText fontSize={13}>
                  {formatWhen(entry.createdDate, locale)}
                  {entry.metadata?.ip ? ` · ${entry.metadata.ip}` : ''}
                </MutedText>
              </XStack>
            )
          })}
        </YStack>
      )}
    </SettingsSection>
  )
}
