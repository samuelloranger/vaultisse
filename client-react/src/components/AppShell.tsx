import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button, Sheet, Text, useMedia, XStack, YStack } from 'tamagui'
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

type NavItem = {
  label: string
  to: string
  icon: AppIcon
}

/**
 * Only the dashboard is a real route so far. The rest are listed because the
 * nav is part of the shell being verified at 390px, and they become live as
 * their screens land — deliberately rendered as disabled rows rather than dead
 * links that 404.
 */
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Library', to: '/library/search', icon: Search },
  { label: 'Locations', to: '/locations', icon: MapPin },
  { label: 'Categories', to: '/categories', icon: Tag },
  { label: 'Authors', to: '/authors', icon: UserPen },
  { label: 'Loans', to: '/loans', icon: BookOpen },
  { label: 'Customers', to: '/customers', icon: Users },
]

const IMPLEMENTED_ROUTES = new Set([
  '/',
  '/library/search',
  '/locations',
  '/categories',
  '/authors',
  '/customers',
  '/loans',
])

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <YStack gap="$1" padding="$3" role="navigation" aria-label="Main">
      {NAV_ITEMS.map((item) => {
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
