'use client'

import { useEffect, useState } from 'react'
import { Activity, MessageCircle, Users, Zap } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/page-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useInstagramSession } from '@/hooks/use-instagram-session'

interface DashboardStats {
  metrics: {
    totalAutomations: number
    activeTriggers: number
    audienceReached: number
    messagesSent: number
  }
  recentActivity: Array<{
    id: string
    content: string
    created_at: string
    recipient?: {
      recipient_username: string
    }
  }>
}

export default function DashboardPage() {
  const { username, userId, isLoading: isSessionLoading } =
    useInstagramSession()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/dashboard/stats?userId=${userId}`)
        const data = await res.json()
        if (data && !data.error) {
          setStats(data)
        }
      } catch (err) {
        console.error('Failed to load dashboard stats', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [userId])

  if (isSessionLoading || loading) {
    return <OverviewSkeleton />
  }

  const activity = stats?.recentActivity ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Overview"
        title={`Hey, ${username}.`}
        description="Here's what your automations did while you were away."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total automations"
          value={stats?.metrics.totalAutomations.toString() || '0'}
          hint="All time"
          tone="brand"
          icon={<Zap />}
        />
        <StatCard
          label="Messages sent"
          value={stats?.metrics.messagesSent.toString() || '0'}
          hint="Lifetime"
          icon={<MessageCircle />}
        />
        <StatCard
          label="Active triggers"
          value={stats?.metrics.activeTriggers.toString() || '0'}
          hint="Running"
          tone="success"
          icon={<Activity />}
        />
        <StatCard
          label="Audience reached"
          value={stats?.metrics.audienceReached.toString() || '0'}
          hint="Unique users"
          icon={<Users />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="gap-0 p-4 sm:p-5">
          <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
            Recent activity
          </h2>
          {activity.length > 0 ? (
            <ul className="-mx-2 mt-2 flex flex-col">
              {activity.map((msg) => (
                <li
                  key={msg.id}
                  className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-surface-secondary"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-soft-foreground"
                  >
                    <MessageCircle className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      Auto-reply to @
                      {msg.recipient?.recipient_username || 'user'}
                    </span>
                    <span className="truncate text-xs text-muted-text">
                      {msg.content}
                    </span>
                  </span>
                  <time
                    dateTime={msg.created_at}
                    className="shrink-0 text-xs whitespace-nowrap text-muted-text"
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<MessageCircle />}
              title="No recent activity"
              description="Replies your automations send will show up here."
              className="min-h-0 py-8"
            />
          )}
        </Card>

        <Card className="gap-0 p-4 sm:p-5">
          <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
            Quick actions
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="group flex h-24 flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-border transition-colors hover:border-brand">
              <Zap
                aria-hidden="true"
                className="size-5 text-muted-text transition-colors group-hover:text-brand"
              />
              <span className="text-xs font-medium">New Rule</span>
            </div>
            <div className="group flex h-24 flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-border transition-colors hover:border-brand">
              <Users
                aria-hidden="true"
                className="size-5 text-muted-text transition-colors group-hover:text-brand"
              />
              <span className="text-xs font-medium">View Audience</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-[16px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-[16px]" />
        <Skeleton className="h-72 rounded-[16px]" />
      </div>
      <span className="sr-only">Loading dashboard</span>
    </div>
  )
}