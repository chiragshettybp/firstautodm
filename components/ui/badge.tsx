import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Status tone always routes through the semantic tokens — never a raw colour.
 * `brand` is the only accent; `success` / `warning` / `danger` are calm.
 *
 * Heights stay on the 4px grid. `sm` is the 16px compact status chip the
 * design system uses inline inside rows; the default is 20px for standalone
 * tags. `StatusPill` (components/ui/status-pill.tsx) wraps this with the
 * status dot.
 */
const badgeVariants = cva(
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-medium transition-colors focus-visible:outline-none",
    {
        variants: {
            variant: {
                default: "border-transparent bg-brand text-brand-foreground",
                brand: "border-transparent bg-brand text-brand-foreground",
                secondary: "border-transparent bg-default text-default-foreground",
                success: "border-transparent bg-success-soft text-success-soft-foreground",
                warning: "border-transparent bg-warning-soft text-warning-soft-foreground",
                destructive: "border-transparent bg-danger-soft text-danger-soft-foreground",
                danger: "border-transparent bg-danger-soft text-danger-soft-foreground",
                outline: "border-border bg-surface text-foreground",
                muted: "border-transparent bg-surface-secondary text-muted-text",
            },
            size: {
                default: "h-5 px-2 text-xs",
                sm: "h-4 px-1.5 text-xs",
                lg: "h-6 px-2.5 text-sm",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, size, ...props }: BadgeProps) {
    return (
        <span
            data-slot="badge"
            className={cn(badgeVariants({ variant, size }), className)}
            {...props}
        />
    )
}

export { Badge, badgeVariants }