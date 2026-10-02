'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Filter,
  Inbox,
  MessageSquare,
  Percent,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from 'recharts'

import { useInstagramSession } from '@/hooks/use-instagram-session'
import {
  useAnalyticsOverview,
  useFunnelBreakdown,
  useRulePerformance,
  type AnalyticsRange,
} from '@/hooks/use-analytics'
import { useLiveRefresh } from '@/hooks/use-live-refresh'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState, ErrorState } from '@/components/ui/page-state'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

const chartConfig = {
  sent: { label: 'Sent', color: 'var(--color-brand)' },
  received: { label: 'Received', color: 'var(--color-instagram-online)' },
}

function triggerLabel(source: string, type: string): string {
  if (type === 'reply_all') return 'Comment reply-all'
  if (type === 'postback') return 'Button / quick reply'
  if (type === 'mention') return 'Story mention'
  if (type === 'reaction') return 'Story reaction'
  if (type === 'reply') return 'Story reply'
  if (type === 'keyword') return source === 'comment' ? 'Comment keyword' : 'DM keyword'
  return type
}

export default function AnalyticsPage() {
  const { userId, isLoading: isSessionLoading } = useInstagramSession()
  const [range, setRange] = useState<AnalyticsRange>('7d')

  const overview = useAnalyticsOverview(userId, range)
  const rules = useRulePerformance(userId, range)
  const funnels = useFunnelBreakdown(userId, range)

  const isRefreshing = overview.isLoading || rules.isLoading || funnels.isLoading

  // Feature 9: refresh quietly while the tab is open. Kept above the early
  // returns so hook order is stable on every render.
  useLiveRefresh(
    () => {
      overview.refetch()
      rules.refetch()
      funnels.refetch()
    },
    { enabled: Boolean(userId), intervalMs: 30_000 },
  )

  const genieGo = useMemo(
    () =>
      (overview.data?.messagesPerDay ?? []).map((d) => ({
        ...d,
        label: d.date.slice(5),
      })),
    [overview.data],
  )

  if (isSessionLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="size-5 text-muted-text" />
        <span className="sr-only">Loading analytics</span>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="Engagement and automation performance." />
        <Card className="page-pad-airy">
          <EmptyState
            icon={<Activity />}
            title="Log in to see your analytics"
            description="Analytics are tied to your connected Instagram account."
          />
        </Card>
      </div>
    )
  }

  const schemaMissing = overview.error?.code === 'analytics_schema_missing'

  const refreshAll = () => {
    overview.refetch()
    rules.refetch()
    funnels.refetch()
  }

  const totals = overview.data?.totals
  const hasAnyActivity =
    !!totals &&
    (totals.sent > 0 ||
      totals.fired > 0 ||
      (overview.data?.messagesPerDay.length ?? 0) > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Analytics"
        description="How your automations fire, deliver and convert."
        action={
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="Date range"
              className="flex items-center gap-1 rounded-full border border-border bg-surface-secondary p-1"
            >
              {RANGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  aria-pressed={range === option.value}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    range === option.value
                      ? 'bg-brand text-brand-foreground'
                      : 'text-muted-text hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={refreshAll}
              disabled={isRefreshing}
              title="Refresh"
              aria-label="Refresh analytics"
            >
              <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />

      {overview.error && !schemaMissing ? (
        <Card className="p-0">
          <ErrorState
            icon={<AlertTriangle />}
            title="Analytics could not be loaded"
            description={overview.error.message}
            action={
              <Button variant="outline" onClick={refreshAll}>
                <RefreshCw /> Try again
              </Button>
            }
          />
        </Card>
      ) : null}

      {schemaMissing ? (
        <Card className="page-pad-airy">
          <EmptyState
            icon={<AlertTriangle />}
            title="Finish setting up analytics"
            description="Run the latest schema.sql in the Supabase SQL editor once, then reload this page."
          />
        </Card>
      ) : null}

      {overview.isLoading && !overview.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[124px] animate-pulse rounded-[16px] border border-border bg-surface-secondary"
            />
          ))}
          <span className="sr-only">Loading analytics</span>
        </div>
      ) : null}

      {totals && !hasAnyActivity ? (
        <Card className="page-pad-airy">
          <EmptyState
            icon={<Inbox />}
            title="No activity in this window"
            description={`Nothing was triggered in the last ${range.replace('d', ' days')}. Once someone comments or DMs a keyword, it shows up here.`}
          />
        </Card>
      ) : null}

      {totals && hasAnyActivity ? (
        <>
          <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Messages sent"
              value={totals.sent.toLocaleString()}
              hint={`${totals.failed} failed · ${totals.blockedWindow + totals.rateLimited} held back`}
              icon={<Send />}
              tone="brand"
              live
            />
            <StatCard
              label="Reply rate"
              value={`${totals.replyRate}%`}
              hint={`${totals.replies} of ${totals.conversations} conversations`}
              icon={<MessageSquare />}
              tone="success"
              live
            />
            <StatCard
              label="Automations triggered"
              value={totals.fired.toLocaleString()}
              hint={`${totals.conversions} reached a conversion step`}
              icon={<Zap />}
              tone="neutral"
              live
            />
            <StatCard
              label="Conversion rate"
              value={`${totals.conversionRate}%`}
              hint="Share of triggered people who converted"
              icon={<Target />}
              tone="warning"
              live
            />
          </section>

          {overview.data?.truncated ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[12px] border border-warning-soft bg-warning-soft px-3 py-2.5 text-[11px] text-warning-soft-foreground"
            >
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              This window holds a very large amount of activity, so the figures
              below are a recent sample rather than a complete total.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-4 p-5">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-brand-soft-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Messages per day</h2>
              </div>
              {genieGo.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-text">
                  No messages recorded yet.
                </p>
              ) : (
                <ChartContainer config={chartConfig} className="aspect-[16/9] w-full">
                  <AreaChart data={genieGo} margin={{ left: -18, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="fillSent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-sent)" stopOpacity={0.7} />
                        <stop offset="95%" stopColor="var(--color-sent)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="fillReceived" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-received)" stopOpacity={0.7} />
                        <stop offset="95%" stopColor="var(--color-received)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Area
                      dataKey="sent"
                      type="monotone"
                      fill="url(#fillSent)"
                      stroke="var(--color-sent)"
                      strokeWidth={2}
                    />
                    <Area
                      dataKey="received"
                      type="monotone"
                      fill="url(#fillReceived)"
                      stroke="var(--color-received)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </Card>

            <Card className="gap-4 p-5">
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-brand-soft-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Top trigger types</h2>
              </div>
              {(overview.data?.topTriggers.length ?? 0) === 0 ? (
                <p className="py-10 text-center text-xs text-muted-text">
                  No triggers recorded yet.
                </p>
              ) : (
                <ChartContainer config={{}} className="aspect-[16/9] w-full">
                  <BarChart
                    data={overview.data?.topTriggers}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={130}
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={6} fill="var(--color-brand)">
                      {(overview.data?.topTriggers ?? []).map((_, index) => (
                        <Cell
                          key={index}
                          fill={`color-mix(in oklab, var(--brand) ${100 - index * 12}%, var(--color-instagram-blue) ${index * 12}%)`}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </Card>
          </div>

          <Card className="gap-4 p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-brand-soft-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Rule performance</h2>
              {rules.data?.truncated ? (
                <Badge variant="muted" size="sm">
                  Sampled
                </Badge>
              ) : null}
            </div>
            {rules.isLoading && !rules.data ? (
              <div className="flex items-center gap-2 py-8 text-xs text-muted-text">
                <Spinner className="size-4" /> Loading rule performance…
              </div>
            ) : rules.error ? (
              <p role="alert" className="py-6 text-xs text-danger-soft-foreground">
                {rules.error.message}
              </p>
            ) : (rules.data?.rules.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-xs text-muted-text">
                No rule activity in this window.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead className="text-right">Fired</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Gated</TableHead>
                      <TableHead className="text-right">Conversions</TableHead>
                      <TableHead className="text-right">Conv. rate</TableHead>
                      <TableHead className="text-right">Avg latency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.data?.rules.map((rule) => (
                      <TableRow key={rule.automationId ?? `deleted-${rule.name}`}>
                        <TableCell className="font-medium">
                          {rule.name}
                          {rule.automationId === null ? (
                            <Badge variant="muted" size="sm" className="ml-2">
                              Deleted
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-text">
                          {triggerLabel(rule.triggerSource, rule.triggerType)}
                        </TableCell>
                        <TableCell className="tnum text-right">{rule.fired}</TableCell>
                        <TableCell className="tnum text-right">{rule.sent}</TableCell>
                        <TableCell className="tnum text-right">{rule.failed}</TableCell>
                        <TableCell className="tnum text-right">{rule.gated}</TableCell>
                        <TableCell className="tnum text-right">{rule.conversions}</TableCell>
                        <TableCell className="tnum text-right">{rule.conversionRate}%</TableCell>
                        <TableCell className="tnum text-right">
                          {rule.avgLatencyMs > 0
                            ? `${(rule.avgLatencyMs / 1000).toFixed(1)}s`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="gap-5 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand-soft-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Funnel breakdown</h2>
              {funnels.data?.truncated ? (
                <Badge variant="muted" size="sm">
                  Sampled
                </Badge>
              ) : null}
            </div>
            {funnels.isLoading && !funnels.data ? (
              <div className="flex items-center gap-2 py-8 text-xs text-muted-text">
                <Spinner className="size-4" /> Loading funnels…
              </div>
            ) : funnels.error ? (
              <p role="alert" className="py-6 text-xs text-danger-soft-foreground">
                {funnels.error.message}
              </p>
            ) : (funnels.data?.funnels.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-xs text-muted-text">
                No follow-up sequences ran in this window.
              </p>
            ) : (
              <div className="space-y-6">
                {funnels.data?.funnels.map((funnel) => (
                  <div key={funnel.automationId} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{funnel.name}</h3>
                      <Badge variant="brand" size="sm">
                        {funnel.conversionRate}% converted
                      </Badge>
                      <span className="text-[11px] text-muted-text">
                        {funnel.completed} completed · {funnel.active} in progress ·{' '}
                        {funnel.abandoned} abandoned
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {funnel.steps.map((step) => (
                        <li key={step.stepIndex} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="flex items-center gap-1.5 truncate font-medium text-foreground">
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-[6px] bg-surface-secondary text-[10px] font-bold text-muted-text">
                                {step.stepIndex + 1}
                              </span>
                              <span className="truncate">{step.stepName}</span>
                              {step.isConversionStep ? (
                                <CheckCircle2
                                  className="size-3.5 shrink-0 text-brand"
                                  aria-label="Conversion step"
                                />
                              ) : null}
                            </span>
                            <span className="shrink-0 text-muted-text tnum">
                              {step.entered} reached · {step.dropOffRate}% drop-off
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
                            <div
                              className="h-full rounded-full bg-brand transition-all"
                              style={{ width: `${Math.min(100, step.reachedRate)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}
