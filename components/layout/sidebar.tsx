'use client'

import type React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Send } from 'lucide-react'
import { Settings as SettingsIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrandMark } from '@/components/layout/brand-mark'
import {
  NAV_ITEMS,
  SETTINGS_NAV_ITEM,
  SUPPORT_NAV_ITEM,
  isNavActive,
} from '@/components/layout/nav-items'

const ROW_BASE =
  'group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors'

function navRowClassName(active: boolean) {
  return cn(
    ROW_BASE,
    active
      ? 'bg-brand-soft font-semibold text-brand-soft-foreground'
      : 'text-muted-text hover:bg-surface-secondary hover:text-foreground',
  )
}

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  username?: string
  profilePic?: string | null
  className?: string
  onLogout?: () => void
  onNavigate?: () => void
  /** Hides the theme toggle and account block (used when embedded in a sheet). */
  hideFooter?: boolean
}

export function Sidebar({
  className,
  username = 'creator',
  profilePic,
  onLogout,
  onNavigate,
  hideFooter = false,
  ...props
}: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      data-slot="sidebar"
      className={cn('flex flex-col bg-surface text-foreground', className)}
      {...props}
    >
      <div className="flex items-center gap-2.5 px-4 py-4">
        <BrandMark />
        <span className="flex-1 text-sm font-bold tracking-[-0.02em]">
          insta-p8
        </span>
        <ThemeToggle />
      </div>

      <div className="mx-4 h-px bg-separator" />

      <nav aria-label="Dashboard" className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = isNavActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={navRowClassName(active)}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active ? 'text-brand' : 'text-muted-text group-hover:text-foreground',
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className="truncate">{label}</span>
            </Link>
          )
        })}

        <div className="px-3 pt-5 pb-1">
          <div className="h-px bg-separator" />
        </div>

        <Link
          href={SETTINGS_NAV_ITEM.href}
          onClick={onNavigate}
          aria-current={
            isNavActive(pathname, SETTINGS_NAV_ITEM.href) ? 'page' : undefined
          }
          className={navRowClassName(isNavActive(pathname, SETTINGS_NAV_ITEM.href))}
        >
          <SettingsIcon
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 transition-colors',
              isNavActive(pathname, SETTINGS_NAV_ITEM.href)
                ? 'text-brand'
                : 'text-muted-text group-hover:text-foreground',
            )}
            strokeWidth={isNavActive(pathname, SETTINGS_NAV_ITEM.href) ? 2.2 : 1.8}
          />
          <span className="truncate">{SETTINGS_NAV_ITEM.label}</span>
        </Link>

        <a
          href={SUPPORT_NAV_ITEM.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className={cn(ROW_BASE, 'text-muted-text hover:bg-surface-secondary hover:text-foreground')}
        >
          <Send
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-text group-hover:text-foreground"
            strokeWidth={1.8}
          />
          <span className="truncate">{SUPPORT_NAV_ITEM.label}</span>
        </a>
      </nav>

      {hideFooter ? null : (
        <div className="px-3 pb-4">
          <div className="flex items-center gap-2.5 rounded-[12px] border border-border bg-surface px-3 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-xs font-bold text-muted-text">
              {profilePic ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profilePic}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                username.charAt(0).toUpperCase()
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-semibold">@{username}</span>
              <span className="text-[10px] font-semibold tracking-[0.1em] text-success uppercase">
                Connected
              </span>
            </span>
            <button
              type="button"
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className="press-subtle flex size-8 shrink-0 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-danger-soft hover:text-danger-soft-foreground"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}