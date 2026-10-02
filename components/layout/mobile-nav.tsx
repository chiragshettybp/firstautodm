'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal, ArrowLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  MOBILE_PRIMARY_NAV,
  MOBILE_SECONDARY_NAV,
  PAYPAGE_NAV_ITEM,
  isNavActive,
} from '@/components/layout/nav-items'

const ITEM_BASE =
  'flex flex-1 flex-col items-center justify-center gap-1 rounded-[10px] py-1.5 text-[10px] leading-tight font-medium transition-colors'

export interface MobileNavProps {
  username?: string
  profilePic?: string | null
  onLogout?: () => void
}

/**
 * Bottom navigation for viewports below 1024px: four primary destinations plus
 * "More". "More" is a real sheet trigger, not a link, so it announces its
 * expanded state and returns focus to the trigger on close.
 *
 * Safe-area padding is applied twice on purpose: the bar keeps its colour
 * behind the home indicator while the items stay clear of it.
 */
export function MobileNav({ username = 'creator', profilePic, onLogout }: MobileNavProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  // "More" reads as active when the current route lives inside the sheet.
  const moreActive = MOBILE_SECONDARY_NAV.some((item) =>
    isNavActive(pathname, item.href),
  )

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[var(--z-index-bottom-nav)] border-t border-border bg-surface/95 backdrop-blur-xl lg:hidden"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch gap-0.5 px-2 py-1.5">
          {MOBILE_PRIMARY_NAV.map(({ href, icon: Icon, label }) => {
            const active = isNavActive(pathname, href)
            return (
              <li key={href} className="flex flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    ITEM_BASE,
                    active
                      ? 'text-brand-soft-foreground'
                      : 'text-muted-text hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center rounded-full px-4 py-1 transition-colors',
                      active ? 'bg-brand-soft' : 'bg-transparent',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            )
          })}

          <li className="flex flex-1">
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-current={moreActive ? 'page' : undefined}
                  className={cn(
                    ITEM_BASE,
                    moreActive
                      ? 'text-brand-soft-foreground'
                      : 'text-muted-text hover:text-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center rounded-full px-4 py-1 transition-colors',
                      moreOpen || moreActive ? 'bg-brand-soft' : 'bg-transparent',
                    )}
                  >
                    <MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="truncate">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="gap-0">
                <SheetHeader className="pb-3">
                  <SheetTitle>More</SheetTitle>
                </SheetHeader>

                <nav aria-label="More" className="flex flex-col gap-1 px-4 pb-2">
                  {MOBILE_SECONDARY_NAV.map(({ href, icon: Icon, label }) => {
                    const active = isNavActive(pathname, href)
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm transition-colors',
                          active
                            ? 'bg-brand-soft font-semibold text-brand-soft-foreground'
                            : 'text-muted-text hover:bg-surface-secondary hover:text-foreground',
                        )}
                      >
                        <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
                        <span>{label}</span>
                      </Link>
                    )
                  })}

                  <a
                    href={PAYPAGE_NAV_ITEM.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-muted-text transition-colors hover:bg-surface-secondary hover:text-foreground"
                  >
                    <ArrowLeft
                      aria-hidden="true"
                      className="size-4 shrink-0"
                      strokeWidth={1.8}
                    />
                    <span>{PAYPAGE_NAV_ITEM.label}</span>
                  </a>
                </nav>

                <div className="mt-2 flex flex-col gap-3 border-t border-border px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-sm font-bold text-muted-text">
                      {profilePic ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profilePic} alt="" className="size-full object-cover" />
                      ) : (
                        username.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">@{username}</span>
                      <span className="text-[10px] font-semibold tracking-[0.1em] text-success uppercase">
                        Connected
                      </span>
                    </span>
                    <ThemeToggle />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMoreOpen(false)
                      onLogout?.()
                    }}
                  >
                    Log out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>
    </>
  )
}