'use client'

import { useTheme } from '@/components/theme-provider'
import { Toaster as Sonner, ToasterProps } from 'sonner'

/**
 * Toasts use the app's own ThemeProvider (not next-themes) so they can never
 * disagree with the rest of the UI. Requires <Toaster /> to be rendered inside
 * <ThemeProvider> — see app/layout.tsx.
 *
 * Surface matches `.overlay-surface`: 16px radius, 1px --border, and the
 * sanctioned overlay shadow. Nothing else may sit above z-index 100000.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      closeButton
      toastOptions={{ duration: 4000 }}
      style={
        {
          '--normal-bg': 'var(--overlay)',
          '--normal-text': 'var(--foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }