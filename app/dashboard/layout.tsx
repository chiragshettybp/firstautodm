'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { BrandMark, BRAND_NAME } from '@/components/layout/brand-mark'
import { ThemeToggle } from '@/components/theme-toggle'
import { LoadingState } from '@/components/ui/page-state'
import { useInstagramSession } from '@/hooks/use-instagram-session'

/**
 * App shell.
 *
 * Below 1024px: sticky header + fixed bottom navigation, with 112px of bottom
 * padding reserved in `.shell-main` so content never hides behind the bar.
 * At 1024px and up: fixed 264px sidebar, no bottom navigation.
 *
 * The sidebar switches at `lg`, not `md`, because a 768px viewport cannot fit
 * a 264px rail plus a readable 48rem page measure.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { username, profilePic, logout, isLoading } = useInstagramSession()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingState label="Loading your workspace" className="min-h-screen" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar — fixed, 264px */}
      <div className="fixed inset-y-0 left-0 z-[var(--z-index-sidebar)] hidden w-66 lg:block">
        <Sidebar
          className="h-full border-r border-border"
          username={username || 'User'}
          profilePic={profilePic}
          onLogout={logout}
        />
      </div>

      <div className="flex min-h-screen flex-col lg:pl-66">
        {/* Sticky header on every app page, mobile and desktop. */}
        <header className="sticky top-0 z-[var(--z-index-header)] border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1152px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <span className="flex items-center gap-2.5 lg:hidden">
              <BrandMark />
              <span className="text-sm font-bold tracking-[-0.02em]">
                {BRAND_NAME}
              </span>
            </span>
            <div className="flex-1" />
            <span className="lg:hidden">
              <ThemeToggle />
            </span>
          </div>
        </header>

        <main className="flex-1">
          <div className="shell-main">{children}</div>
        </main>
      </div>

      <MobileNav
        username={username || 'User'}
        profilePic={profilePic}
        onLogout={logout}
      />
    </div>
  )
}