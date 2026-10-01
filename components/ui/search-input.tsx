import * as React from 'react'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * SearchInput — a `.field` with a leading 16px icon and a clear button that
 * only exists while there is something to clear, so the icon never shifts.
 *
 * The wrapper owns focus so the ring wraps the whole control, and the input
 * itself is transparent — a field should look like one surface.
 */
export function SearchInput({
  className,
  containerClassName,
  value,
  onValueChange,
  onClear,
  placeholder = 'Search',
  ...props
}: Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> & {
  value?: string
  onValueChange?: (value: string) => void
  onClear?: () => void
  containerClassName?: string
}) {
  const inner = React.useRef<HTMLInputElement>(null)

  return (
    <div
      className={cn(
        'field group flex items-center gap-2 p-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        containerClassName,
      )}
    >
      <Search
        aria-hidden="true"
        className="ml-3 size-4 shrink-0 text-muted-text"
      />
      <Input
        ref={inner}
        type="search"
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        placeholder={placeholder}
        className="flex-1 border-0 bg-transparent shadow-none focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onClear?.()
            if (!onClear) onValueChange?.('')
            inner.current?.focus()
          }}
          className="press-subtle mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-text hover:bg-default hover:text-foreground"
        >
          <span aria-hidden="true" className="text-sm leading-none">
            &times;
          </span>
          <span className="sr-only">Clear search</span>
        </button>
      ) : null}
    </div>
  )
}