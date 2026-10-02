import Image from 'next/image'

import { cn } from '@/lib/utils'

export const BRAND_NAME = 'Paypage Autodm'

/**
 * BrandMark — the logo, used as an identity chip.
 *
 * Renders `/public/logo.png` at a fixed square box so it stays crisp across
 * the marketing nav, the desktop sidebar and the mobile header.
 */
export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string
  iconClassName?: string
}) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden',
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt=""
        width={1254}
        height={1254}
        priority
        className={cn('size-8 object-contain', iconClassName)}
      />
    </span>
  )
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className={markClassName} />
      <span className="text-base leading-6 font-bold tracking-[-0.02em]">
        {BRAND_NAME}
      </span>
    </span>
  )
}