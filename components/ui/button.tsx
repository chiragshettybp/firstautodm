import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Height/radius/press behaviour lives in `.button` (globals.css) so every
 * control in the product shares one interaction language. This file owns the
 * colour language and the public variant names.
 *
 * Variant names are additive: `default`, `secondary`, `ghost`, `outline`,
 * `destructive` and `link` predate the redesign and stay stable so existing
 * call sites keep working. `danger-soft`, `outline-dashed`, `brand-outline`,
 * `on-dark` and `on-dark-outline` were added by the design system — the first
 * for "add another" affordances that should read as an empty slot, the rest for
 * the dark editorial marketing hero, which owns its own contrast.
 */
const buttonVariants = cva(
  [
    'button shrink-0 select-none outline-none',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "[&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'button--primary',
        secondary: 'button--secondary',
        ghost: 'button--ghost',
        outline: 'button--outline',
        'outline-dashed': 'button--outline button--dashed',
        destructive: 'button--danger',
        'danger-soft': 'button--danger-soft',
        'brand-outline': 'button--outline button--brand',
        'on-dark': 'button--on-dark',
        'on-dark-outline': 'button--on-dark-outline',
        link: 'h-auto rounded-none p-0 font-medium text-foreground underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: '',
        sm: 'button--sm',
        lg: 'button--lg',
        icon: 'w-10 px-0 md:w-9',
        'icon-sm': 'button--sm w-9 px-0 md:w-8',
        'icon-lg': 'button--lg w-11 px-0 md:w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }