import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * `.field` (globals.css): borderless, 12px radius, depth from
 * `--field-shadow`, placeholder at `--field-placeholder`. Depth without a
 * border is the design system's signature — do not add one back.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'field',
        'file:text-foreground selection:bg-brand selection:text-brand-foreground',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'disabled:pointer-events-none disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  )
}

export { Input }