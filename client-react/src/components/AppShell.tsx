import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Sheet, Text, useMedia, XStack, YStack } from 'tamagui'
import type { Policy } from '@/api/types'
import { usePolicy } from '@/queries/app'
import { useColorScheme } from '@/theme/ThemeProvider'
import { DisplayText } from './Card'
import {
  type AppIcon,
  BookOpen,
  LayoutDashboard,
  MapPin,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  Tag,
  UserPen,
  Users,
  X,
} from './icons'

/**
 * The app frame: the dark "shelf" nav, and the scrolling content column.
 *
 * Responsive behaviour, from the spec's component mapping:
 * `v-navigation-drawer` → a `Sheet` on phones, a persistent sidebar from `sm`.
 * There is no third state and no rail; the old client's `sidebarRail` setting is
 * a desktop density preference and can come back with the settings screen.
 *
 * Heights use `dvh`, never `vh` — on mobile Safari `100vh` is the viewport with
 * the URL bar hidden, so a `100vh` frame is taller than the screen whenever the
 * bar is showing and the bottom of the page cannot be reached.
 */

/**
 * The condition a nav entry is behind, if any.
 *
 * One mechanism with two values rather than two booleans, because both values
 * mean exactly the same thing to the renderer: the row is **absent** when the
 * condition fails, never present and greyed out. Adding a third gate should be
 * a line in {@link NAV_GATES}, not a second `…Only` flag on this type.
 */
type NavGate = 'admin' | 'lending'

type NavItem = {
  label: string
  to: string
  icon: AppIcon
  /** Shown only when this gate passes. See {@link NAV_ITEMS}. */
  gate?: NavGate
}

/** What each gate reads out of the policy. */
const NAV_GATES: Record<NavGate, (policy: Policy) => boolean> = {
  admin: (policy) => policy.user.isAdmin === true,
  lending: (policy) => policy.user.leasingEnabled === true,
}

/**
 * Every screen in the app. A route that has not landed yet renders as a
 * disabled row rather than a dead link that 404s.
 *
 * Admin is not merely disabled for a non-administrator - it is absent. The
 * server refuses the endpoints either way (403, and the query is never even
 * enabled), so showing a greyed-out Admin row would advertise a door that is
 * not theirs rather than describe one that is coming.
 *
 * Loans and Customers are absent for the same reason when lending is off, and
 * through the same `gate` rather than a parallel mechanism. What differs is who
 * can change the answer: `leasingEnabled` is `app_settings.leasing_enabled`,
 * one row for the whole instance (see `features/settings/LendingCard.tsx`), and
 * anybody can switch it back on from the profile screen. So the rows are not a
 * door that is not theirs - they are a section this library has turned off, and
 * a greyed-out row would describe a feature nobody here has asked for.
 *
 * Note the gate is cosmetic, not a control: the server does not consult
 * `leasing_enabled` on `/loans` or `/customer` (both are `requireAuth` and
 * nothing more), so the data is still reachable by anyone who types the URL of
 * an API endpoint. This hides a section that is switched off; it does not
 * protect one.
 */
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Library', to: '/library/search', icon: Search },
  { label: 'Locations', to: '/locations', icon: MapPin },
  { label: 'Categories', to: '/categories', icon: Tag },
  { label: 'Authors', to: '/authors', icon: UserPen },
  { label: 'Loans', to: '/loans', icon: BookOpen, gate: 'lending' },
  { label: 'Customers', to: '/customers', icon: Users, gate: 'lending' },
  { label: 'Profile', to: '/profile', icon: Settings },
  { label: 'Admin', to: '/admin', icon: Shield, gate: 'admin' },
]

const IMPLEMENTED_ROUTES = new Set([
  '/',
  '/library/search',
  '/locations',
  '/categories',
  '/authors',
  '/customers',
  '/loans',
  '/profile',
  '/admin',
])

/**
 * The rows this policy may see, in order.
 *
 * Exported so the filtering can be tested without standing up a router: the
 * rows themselves are `Link`s, and what is worth asserting here is which items
 * survive the gates, not how a link renders.
 */
export function visibleNavItems(policy: Policy): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.gate || NAV_GATES[item.gate](policy))
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  // A cache hit, not a fetch: the _app route's loader already awaited this.
  // It is also live: the lending toggle invalidates the policy key, so flipping
  // lending adds or drops these rows without a reload (see queries/user.ts).
  const { data: policy } = usePolicy()

  return (
    <YStack gap="$1" padding="$3" role="navigation" aria-label="Main">
      {visibleNavItems(policy).map((item) => {
        const live = IMPLEMENTED_ROUTES.has(item.to)
        const Icon = item.icon
        const content = (
          <XStack
            alignItems="center"
            gap="$3"
            // The 44px touch-target floor. The nav is the app's most-used
            // control and the one most likely to be tapped one-handed.
            minHeight={44}
            paddingHorizontal="$3"
            borderRadius="$control"
            opacity={live ? 1 : 0.45}
          >
            <Icon size={18} color="$navTextMuted" />
            <Text color="$navText" fontSize={16}>
              {item.label}
            </Text>
          </XStack>
        )

        if (!live) {
          return (
            <YStack key={item.to} aria-disabled testID={`nav-${item.label}`}>
              {content}
            </YStack>
          )
        }

        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            style={{ textDecoration: 'none' }}
            data-testid={`nav-${item.label}`}
          >
            {content}
          </Link>
        )
      })}
    </YStack>
  )
}

function Brand() {
  return (
    <XStack alignItems="center" gap="$2" paddingHorizontal="$4" paddingTop="$4">
      <BookOpen size={20} color="$navAccent" />
      <DisplayText color="$navText" fontSize={19}>
        Vaultisse
      </DisplayText>
    </XStack>
  )
}

function ColorSchemeToggle() {
  const { scheme, setPreference } = useColorScheme()
  const next = scheme === 'dark' ? 'light' : 'dark'
  return (
    <Button
      testID="color-scheme-toggle"
      aria-label={`Switch to ${next} theme`}
      onPress={() => setPreference(next)}
      icon={scheme === 'dark' ? Sun : Moon}
      // 44px in both axes: an icon-only button is the classic sub-44 offender.
      minWidth={44}
      minHeight={44}
      backgroundColor="transparent"
      color="$navText"
      borderWidth={0}
    />
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const media = useMedia()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <XStack minHeight="100dvh" backgroundColor="$background">
      {media.sm ? (
        <YStack
          testID="sidebar"
          width={248}
          flexShrink={0}
          backgroundColor="$navBg"
          borderRightWidth={1}
          borderRightColor="$navBorderStrong"
          // Sticky rather than fixed: the column keeps its place in flow, so
          // the content next to it never needs a hardcoded left offset.
          position="sticky"
          top={0}
          height="100dvh"
        >
          <Brand />
          <NavList />
          <YStack flex={1} />
          <XStack padding="$3" justifyContent="flex-end">
            <ColorSchemeToggle />
          </XStack>
        </YStack>
      ) : null}

      <YStack flex={1} minWidth={0}>
        {!media.sm ? (
          <XStack
            testID="app-bar"
            alignItems="center"
            gap="$2"
            backgroundColor="$navBg"
            paddingHorizontal="$2"
            paddingTop="var(--safe-top)"
            height={56}
          >
            <Button
              testID="open-nav"
              aria-label="Open navigation"
              onPress={() => setDrawerOpen(true)}
              icon={Menu}
              minWidth={44}
              minHeight={44}
              backgroundColor="transparent"
              color="$navText"
              borderWidth={0}
            />
            <DisplayText color="$navText" fontSize={18} flex={1}>
              Vaultisse
            </DisplayText>
            <ColorSchemeToggle />
          </XStack>
        ) : null}

        <YStack
          role="main"
          flex={1}
          minWidth={0}
          paddingHorizontal="$3"
          paddingVertical="$3"
          gap="$3"
          // The page never scrolls sideways; wide content gets its own
          // overflow-x container (see the shelf rows on the dashboard).
          overflow="hidden"
        >
          {children}
        </YStack>
      </YStack>

      <Sheet
        modal
        open={drawerOpen && !media.sm}
        onOpenChange={setDrawerOpen}
        snapPointsMode="percent"
        snapPoints={[92]}
        dismissOnSnapToBottom
        transition="medium"
      >
        <Sheet.Overlay
          transition="quick"
          backgroundColor="$shadow6"
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Sheet.Handle />
        <Sheet.Frame backgroundColor="$navBg" paddingTop="$2">
          <XStack alignItems="center" justifyContent="space-between">
            <Brand />
            <Button
              testID="close-nav"
              aria-label="Close navigation"
              onPress={() => setDrawerOpen(false)}
              icon={X}
              minWidth={44}
              minHeight={44}
              marginRight="$2"
              backgroundColor="transparent"
              color="$navText"
              borderWidth={0}
            />
          </XStack>
          <NavList onNavigate={() => setDrawerOpen(false)} />
        </Sheet.Frame>
      </Sheet>
    </XStack>
  )
}
