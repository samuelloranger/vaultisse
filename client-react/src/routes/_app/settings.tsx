import { createFileRoute } from '@tanstack/react-router'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { activityQueryOptions, sessionsQueryOptions } from '@/queries/user'

/**
 * `/app/settings`.
 *
 * The screen's own content comes from the policy, which the `_app` layout has
 * already awaited, so it renders complete on the first frame. The two lists
 * that do *not* come from the policy — active sessions and recent activity —
 * are prefetched rather than awaited: both have their own loading state inside
 * their card, and holding the whole navigation for them would blank the page
 * for the sake of two rows near the bottom of it.
 */
export const Route = createFileRoute('/_app/settings')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(sessionsQueryOptions)
    void context.queryClient.prefetchQuery(activityQueryOptions)
  },
  component: SettingsScreen,
})
