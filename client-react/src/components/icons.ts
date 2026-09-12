/**
 * Every icon the app uses, re-exported from `@tamagui/lucide-icons`' **deep
 * paths**.
 *
 * ## Import icons from here, never from `@tamagui/lucide-icons` directly
 *
 * That package's root entry is a barrel over 1,700 icons, and nothing
 * downstream shakes it: importing one icon from the barrel put a 1MB chunk in
 * the production build, and made a single Vitest file time out at five seconds
 * just parsing it. Each `@tamagui/lucide-icons/icons/<Name>` subpath is its own
 * module, so this file costs exactly the icons listed in it.
 *
 * Adding an icon is one line here. Keep the list alphabetical.
 */

export { AlertTriangle } from '@tamagui/lucide-icons/icons/AlertTriangle'
export { ArrowDownLeft } from '@tamagui/lucide-icons/icons/ArrowDownLeft'
export { ArrowUpRight } from '@tamagui/lucide-icons/icons/ArrowUpRight'
export { Barcode } from '@tamagui/lucide-icons/icons/Barcode'
export { BookOpen } from '@tamagui/lucide-icons/icons/BookOpen'
export { Check } from '@tamagui/lucide-icons/icons/Check'
export { ChevronDown } from '@tamagui/lucide-icons/icons/ChevronDown'
export { ChevronRight } from '@tamagui/lucide-icons/icons/ChevronRight'
export { FileText } from '@tamagui/lucide-icons/icons/FileText'
export { Filter } from '@tamagui/lucide-icons/icons/Filter'
export { Inbox } from '@tamagui/lucide-icons/icons/Inbox'
export { LayoutDashboard } from '@tamagui/lucide-icons/icons/LayoutDashboard'
export { LogOut } from '@tamagui/lucide-icons/icons/LogOut'
export { MapPin } from '@tamagui/lucide-icons/icons/MapPin'
export { Menu } from '@tamagui/lucide-icons/icons/Menu'
export { Moon } from '@tamagui/lucide-icons/icons/Moon'
export { MoreVertical } from '@tamagui/lucide-icons/icons/MoreVertical'
export { Pencil } from '@tamagui/lucide-icons/icons/Pencil'
export { Plus } from '@tamagui/lucide-icons/icons/Plus'
export { RefreshCw } from '@tamagui/lucide-icons/icons/RefreshCw'
export { Search } from '@tamagui/lucide-icons/icons/Search'
export { Settings } from '@tamagui/lucide-icons/icons/Settings'
export { Shield } from '@tamagui/lucide-icons/icons/Shield'
export { Sun } from '@tamagui/lucide-icons/icons/Sun'
export { Tag } from '@tamagui/lucide-icons/icons/Tag'
export { Trash2 } from '@tamagui/lucide-icons/icons/Trash2'
export { Undo2 } from '@tamagui/lucide-icons/icons/Undo2'
export { UserPen } from '@tamagui/lucide-icons/icons/UserPen'
export { Users } from '@tamagui/lucide-icons/icons/Users'
export { X } from '@tamagui/lucide-icons/icons/X'

import type { BookOpen as BookOpenIcon } from '@tamagui/lucide-icons/icons/BookOpen'

/**
 * The type of an icon from this module. Use it when a component takes an icon
 * as a prop — `React.ComponentType<{ size?: number }>` looks equivalent but is
 * not: Tamagui icons take themed values (`color="$navText"`), not plain
 * strings, so the looser type fails to accept them.
 */
export type AppIcon = typeof BookOpenIcon
