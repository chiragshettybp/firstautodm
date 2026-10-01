import { Settings } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        description="Account preferences, notifications, and integrations."
        action={<Badge variant="muted">Coming soon</Badge>}
      />

      <Card className="page-pad-airy">
        <div className="flex flex-col items-center justify-center gap-5 text-center">
          <span
            aria-hidden="true"
            className="flex size-20 items-center justify-center rounded-[16px] border border-border bg-surface-secondary"
          >
            <Settings className="size-9 text-muted-text" />
          </span>
          <p className="max-w-md text-sm leading-6 text-muted-text text-pretty">
            Configure your account preferences, notifications, and integration
            settings here.
          </p>
        </div>
      </Card>
    </div>
  )
}