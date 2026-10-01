'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

/**
 * Checked state uses `--brand` — the one accent. Unchecked uses `--default`
 * (off) and `--separator` (disabled), never the old translucent input fill.
 * The thumb is `--surface` so it stays legible on both the yellow and the
 * neutral track.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5',
        'transition-standard outline-none',
        'data-[state=checked]:bg-brand',
        'data-[state=unchecked]:bg-default',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-surface shadow-xs',
          'transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform',
          'data-[state=checked]:translate-x-5',
          'data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }