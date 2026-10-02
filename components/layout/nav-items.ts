import {
  ArrowLeft,
  BarChart3,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Snowflake,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Single source of truth for app navigation.
 *
 * The desktop sidebar, the mobile bottom navigation and the "More" sheet all
 * read from this list, so a destination can never appear in one surface and be
 * missing from another. Order and destinations are unchanged from the original
 * sidebar — only the presentation moved.
 */
export interface NavItem {
  href: string
  icon: LucideIcon
  label: string
  /** Shown in the mobile bottom navigation; the rest live under "More". */
  primaryMobile?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    icon: LayoutDashboard,
    label: 'Overview',
    primaryMobile: true,
  },
  {
    href: '/dashboard/automations',
    icon: Zap,
    label: 'Automations',
    primaryMobile: true,
  },
  {
    href: '/dashboard/inbox',
    icon: MessageSquare,
    label: 'Inbox',
    primaryMobile: true,
  },
  {
    href: '/dashboard/ice-breakers',
    icon: Snowflake,
    label: 'Ice breakers',
    primaryMobile: true,
  },
  {
    href: '/dashboard/analytics',
    icon: BarChart3,
    label: 'Analytics',
  },
]

/** Secondary desktop destination, rendered below the divider. */
export const SETTINGS_NAV_ITEM: NavItem = {
  href: '/dashboard/settings',
  icon: Settings,
  label: 'Settings',
}

/**
 * External destination back to the PayPage app — not a route, so it is not in
 * the list. Same-tab navigation on purpose: it is an escape hatch, not a
 * parallel app.
 */
export const PAYPAGE_NAV_ITEM = {
  href: 'https://paypageapp.vercel.app/dashboard',
  label: 'Go back to PayPage Dashboard',
  icon: ArrowLeft,
} as const

/** The four destinations that always sit in the bottom navigation bar. */
export const MOBILE_PRIMARY_NAV = NAV_ITEMS.filter((item) => item.primaryMobile)

/** Everything else reachable from the "More" sheet. */
export const MOBILE_SECONDARY_NAV = [
  ...NAV_ITEMS.filter((item) => !item.primaryMobile),
  SETTINGS_NAV_ITEM,
]

/**
 * Exact match for the overview, prefix match for everything else, so
 * `/dashboard/automations/new` keeps the Automations row lit.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}