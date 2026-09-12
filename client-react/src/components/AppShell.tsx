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

/**
 * One nav row's contents, in its resting or selected state.
 *
 * Selection is carried three ways, none of which is load-bearing alone: the
 * `$navActiveBg` wash, the icon in `$navAccent`, and the label at 600. The wash
 * is only 1.37:1 against `$navBg` — a tint, not an outline — so it is not
 * allowed to be the only indicator, and the row's `<a>` also gets
 * `aria-current="page"` from the router (see {@link NavList}).
 *
 * Measured on the composited row (`$navActiveBg` over `$navBg`): `$navText`
 * 9.67:1 light / 11.63:1 dark, `$navAccent` 3.30:1 / 5.28:1 — the latter is a
 * non-text graphic, so 3:1 is the bar.
 */
function NavRow({
  item,
  active,
  live,
}: {
  item: NavItem
  active: boolean
  live: boolean
}) {
  const Icon = item.icon
  return (
    <XStack
      alignItems="center"
      gap="$3"
      // The 44px touch-target floor. The nav is the app's most-used
      // control and the one most likely to be tapped one-handed.
      minHeight={44}
      paddingHorizontal="$3"
      borderRadius="$control"
      opacity={live ? 1 : 0.45}
      backgroundColor={active ? '$navActiveBg' : 'transparent'}
    >
      <Icon size={18} color={active ? '$navAccent' : '$navTextMuted'} />
      <Text color="$navText" fontSize={16} fontWeight={active ? '600' : '400'}>
        {item.label}
      </Text>
    </XStack>
  )
}

/**
 * The nav rows themselves.
 *
 * Exported for the test: which row is lit on which route is the whole point of
 * {@link NavRow}, and it is decided by the router, so unlike
 * {@link visibleNavItems} it cannot be asserted without one.
 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  // A cache hit, not a fetch: the _app route's loader already awaited this.
  // It is also live: the lending toggle invalidates the policy key, so flipping
  // lending adds or drops these rows without a reload (see queries/user.ts).
  const { data: policy } = usePolicy()

  return (
    <YStack gap="$1" padding="$3" role="navigation" aria-label="Main">
      {visibleNavItems(policy).map((item) => {
        const live = IMPLEMENTED_ROUTES.has(item.to)

        if (!live) {
          return (
            <YStack key={item.to} aria-disabled testID={`nav-${item.label}`}>
              <NavRow item={item} active={false} live={false} />
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
            // The router decides, not `location.pathname`: `Link` already knows
            // whether it points at the current match, and it puts
            // `aria-current="page"` and `data-status="active"` on the anchor
            // for free. Comparing paths by hand would be a second, drifting
            // copy of that — and would have to re-learn search params, the
            // basepath and trailing slashes.
            //
            // `exact` for `/` alone, and it is deliberate rather than
            // cargo-culted. The dashboard is the root and every other screen is
            // a path under it, so "does the current path start with `/`" is
            // true everywhere. Router 1.170 does not answer it that way — its
            // prefix test also requires a `/` boundary, so `/library/search`
            // does not match `/` (checked against the running app: with this
            // line removed, exactly one row is still lit on every screen). But
            // "the dashboard row is lit only *on* the dashboard" is the rule
            // this nav wants, and saying so costs one expression and does not
            // depend on that boundary check staying where it is.
            //
            // Every other row wants the prefix match it gets by default, so a
            // child route (`/locations/3`) keeps its section lit.
            activeOptions={{ exact: item.to === '/' }}
          >
            {({ isActive }) => <NavRow item={item} active={isActive} live />}
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
