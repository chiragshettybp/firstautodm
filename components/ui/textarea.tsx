import * as React from 'react'

import { cn } from '@/lib/utils'

/** Matches `.field` exactly — same borderless depth, same 12px radius. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn('field field-sizing-content min-h-16', className)}
      {...props}
    />
  )
}

export { Textarea }