import { Activity } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Deep Analytics"
        description="Engagement, conversions, and automation performance in one place."
        action={<Badge variant="brand">Coming soon</Badge>}
      />

      <Card className="page-pad-airy">
        <div className="flex flex-col items-center justify-center gap-5 text-center">
          <span
            aria-hidden="true"
            className="flex size-20 items-center justify-center rounded-[16px] border border-brand-soft bg-brand-soft"
          >
            <Activity className="size-9 text-brand-soft-foreground" />
          </span>
          <p className="max-w-md text-sm leading-6 text-muted-text text-pretty">
            We&apos;re building a comprehensive analytics suite to help you track
            engagement, conversions, and automation performance.
          </p>
        </div>
      </Card>
    </div>
  )
}