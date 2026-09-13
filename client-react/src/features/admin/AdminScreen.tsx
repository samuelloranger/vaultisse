import { useState } from 'react'
import { Tabs, YStack } from 'tamagui'
import { DisplayText, Eyebrow, MutedText } from '@/components/Card'
import { ScreenError } from '@/components/ScreenState'
import { type ScreenTabDef, ScreenTabs } from '@/components/ScreenTabs'
import { useDocumentTitle } from '@/lib/documentTitle'
import { useLocale } from '@/locale/LocaleProvider'
import { usePolicy } from '@/queries/app'
import { AdminAccountsTab } from './AdminAccountsTab'
import { AdminLibraryTab } from './AdminLibraryTab'
import { AdminRegistrationTab } from './AdminRegistrationTab'

/**
 * `/app/admin` — everything one administrator does to an instance, in three
 * tabs.
 *
 * ## The three are three because their blast radii are three
 *
 * - **Accounts** — one person at a time. Was the whole of this screen.
 * - **Library** — the shared collection, changing the app for everyone *now*.
 * - **New accounts** — nobody yet; read once, by the next registration.
 *
 * That is the distinction an admin actually has to hold in their head before
 * touching anything here, so it is the one the tabs are cut along. Grouping by
 * "toggles" versus "lists" would have put the lending switch — which moves six
 * people's nav — next to a default language that moves nobody.
 *
 * ## A 403 is rendered, never redirected
 *
 * This is the screen the distinction exists for. `requireAdmin` answers `401
 * {sessionExpired: true}` for a dead session and a plain `403` for a valid
 * session that simply is not an admin, and `api/http.ts` only navigates on the
 * first. So a non-admin who types the URL gets told no — they are not bounced
 * to a login page that would not help them. The refusal replaces the tabs
 * rather than sitting inside one, because all three of them are admin-only.
 *
 * ## The tab is in the URL
 *
 * `?tab=library` is linkable, survives a reload and comes back with the back
 * button, which is the same treatment the library's filters get (see
 * `features/search/searchParams.ts`). The route owns the param; this component
 * takes it as a prop and falls back to local state when it is rendered without
 * a router, which is what the tests do.
 */

const ADMIN_TABS = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'library', label: 'Library' },
  { value: 'new-accounts', label: 'New accounts' },
] as const satisfies readonly ScreenTabDef<string>[]

export type AdminTab = (typeof ADMIN_TABS)[number]['value']

/** The tab values, in order. The first is the fallback for an unknown `?tab=`. */
export const ADMIN_TAB_VALUES = ADMIN_TABS.map(
  (tab) => tab.value
) as readonly AdminTab[]

export function AdminScreen({
  tab,
  onTabChange,
}: {
  tab?: AdminTab
  onTabChange?: (next: AdminTab) => void
} = {}) {
  // Always declared, never conditional: `tab` is the router's value when there
  // is a router and `undefined` when there is not, and a hook cannot be called
  // one way in one case and another in the other.
  const [localTab, setLocalTab] = useState<AdminTab>(ADMIN_TABS[0].value)
  const current = tab ?? localTab
  const { data: policy } = usePolicy()
  const { t } = useLocale()
  useDocumentTitle(t('ADMIN', 'Admin'))
  const tabs = [
    { value: 'accounts' as const, label: t('ADMIN_ACCOUNTS', 'Accounts') },
    { value: 'library' as const, label: t('ADMIN_LIBRARY', 'Library') },
    { value: 'new-accounts' as const, label: t('ADMIN_NEW_ACCOUNTS', 'New accounts') },
  ] as const satisfies readonly ScreenTabDef<string>[]

  function change(next: AdminTab) {
    setLocalTab(next)
    onTabChange?.(next)
  }

  // The nav entry is gated on the same flag, but a typed URL bypasses the nav.
  // Rendered as a refusal, never as a redirect: their session is fine.
  if (!policy.user.isAdmin) {
    return (
      <YStack gap="$4" testID="admin-screen">
        <YStack gap="$1">
          <Eyebrow>{t('ADMIN', 'Admin')}</Eyebrow>
          <DisplayText fontSize={26} lineHeight={32}>
            {t('ADMIN_ACCOUNTS', 'Accounts')}
          </DisplayText>
        </YStack>
        <YStack testID="admin-forbidden">
          <ScreenError
            error={
              new Error(
                t(
                  'ADMIN_FORBIDDEN',
                  'This page is for administrators. Your account is signed in and working — it just does not manage other accounts.'
                )
              )
            }
            title={t('ADMIN_FORBIDDEN_TITLE', 'You do not have access to this page')}
          />
        </YStack>
      </YStack>
    )
  }

  return (
    <YStack gap="$4" testID="admin-screen">
      <YStack gap="$1">
        <Eyebrow>{t('ADMIN', 'Admin')}</Eyebrow>
        <DisplayText fontSize={26} lineHeight={32}>
          {t('ADMINISTRATION', 'Administration')}
        </DisplayText>
        <MutedText>
          {t('ADMIN_AFFECTS_OTHERS', 'Everything here affects other people.')}
        </MutedText>
      </YStack>

      <ScreenTabs
        testID="admin-tabs"
        label={t('ADMIN_SECTIONS', 'Admin sections')}
        tabs={tabs}
        value={current}
        onChange={change}
      >
        {/*
          `Tabs.Content` renders `null` when it is not selected, so each panel's
          queries start when its tab is opened and not before. Accounts is the
          first tab and therefore mounts immediately — which is exactly the old
          behaviour, and what the route's prefetch is for.
        */}
        <Tabs.Content value="accounts" width="100%" minWidth={0}>
          <AdminAccountsTab />
        </Tabs.Content>
        <Tabs.Content value="library" width="100%" minWidth={0}>
          <AdminLibraryTab />
        </Tabs.Content>
        <Tabs.Content value="new-accounts" width="100%" minWidth={0}>
          <AdminRegistrationTab />
        </Tabs.Content>
      </ScreenTabs>
    </YStack>
  )
}
