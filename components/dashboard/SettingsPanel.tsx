'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Bell,
  Bot,
  Check,
  Copy,
  Database,
  ExternalLink,
  Gauge,
  Inbox,
  KeyRound,
  Link2,
  ListChecks,
  LogOut,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  UserX,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Eyebrow } from '@/components/ui/eyebrow'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState } from '@/components/ui/page-state'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { StatCard } from '@/components/ui/stat-card'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useInstagramSession } from '@/hooks/use-instagram-session'
import { useLiveRefresh } from '@/hooks/use-live-refresh'
import { cn } from '@/lib/utils'
import {
  LIMIT_PRESETS,
  SETTING_BOUNDS,
  type SendLimits,
} from '@/lib/messaging-window'

interface TokenInfo {
  status: 'valid' | 'expiring' | 'expired' | 'unknown'
  expiresAt: string | null
  daysRemaining: number | null
}

interface QueueProblem {
  id: string
  recipient_username: string | null
  last_error: string | null
  attempts: number
  max_attempts: number
  status: string
  created_at: string
}

interface QueueSnapshot {
  counts: Record<string, number>
  dueNow: number
  nextSendAt: string | null
  lastSentAt: string | null
  problems: QueueProblem[]
}

interface SettingsResponse {
  account: {
    id: string
    username: string
    businessAccountId: string | null
    pageId: string | null
    aiAutoReplyEnabled: boolean
    token: TokenInfo
  }
  limits: SendLimits
  queue: QueueSnapshot
}

const OAUTH_SCOPE =
  'instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments'

function buildReconnectUrl(): string | null {
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
  const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI
  if (!appId || !redirectUri) return null
  return `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=${OAUTH_SCOPE}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffSec = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  return rtf.format(Math.round(diffSec / 86_400), 'day')
}

const TOKEN_TONE: Record<TokenInfo['status'], StatusTone> = {
  valid: 'success',
  expiring: 'warning',
  expired: 'danger',
  unknown: 'neutral',
}

const TOKEN_LABEL: Record<TokenInfo['status'], string> = {
  valid: 'Connected',
  expiring: 'Expires soon',
  expired: 'Expired',
  unknown: 'Status unknown',
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label} copied`)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Your browser blocked the clipboard.')
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={copy}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  )
}

function DetailRow({
  label,
  value,
  copyable = false,
}: {
  label: string
  value: string | null
  copyable?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <span className="shrink-0 text-xs font-medium text-muted-text">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-xs text-foreground">
          {value ?? '—'}
        </span>
        {copyable && value ? <CopyButton value={value} label={label} /> : null}
      </span>
    </div>
  )
}

function LimitControl({
  id,
  label,
  description,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  minLabel,
  maxLabel,
}: {
  id: string
  label: string
  description: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  onChange: (next: number) => void
  minLabel: string
  maxLabel: string
}) {
  const safe = Number.isFinite(value) ? value : min

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={id}>{label}</Label>
          <p className="text-xs leading-5 text-muted-text text-pretty">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={Number.isFinite(value) ? value : ''}
            onChange={(event) => onChange(Number(event.target.value))}
            onBlur={(event) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return onChange(min)
              onChange(Math.min(max, Math.max(min, next)))
            }}
            className="tnum w-24 text-right"
          />
          <span className="w-14 text-xs text-muted-text">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safe}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-brand"
      />
      <div className="flex justify-between text-[10px] text-muted-text">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}

function SendingLimitsSection({
  userId,
  limits,
  onSaved,
}: {
  userId: string
  limits: SendLimits
  onSaved: (next: SendLimits) => void
}) {
  const [form, setForm] = useState<SendLimits>(limits)
  const [saving, setSaving] = useState(false)

  const dirty =
    form.dailyLimit !== limits.dailyLimit ||
    form.minSpacingSec !== limits.minSpacingSec ||
    form.windowHours !== limits.windowHours

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // Re-sync from the server only when the user has no unsaved edits, so the
  // 20s background refresh can never clobber a half-typed value.
  useEffect(() => {
    if (!dirtyRef.current) setForm(limits)
  }, [limits])

  const set = <K extends keyof SendLimits>(key: K, value: SendLimits[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const valid =
    form.dailyLimit >= SETTING_BOUNDS.dailyLimit.min &&
    form.dailyLimit <= SETTING_BOUNDS.dailyLimit.max &&
    form.minSpacingSec >= SETTING_BOUNDS.minSpacingSec.min &&
    form.minSpacingSec <= SETTING_BOUNDS.minSpacingSec.max &&
    form.windowHours >= SETTING_BOUNDS.windowHours.min &&
    form.windowHours <= SETTING_BOUNDS.windowHours.max

  const activePreset = LIMIT_PRESETS.find(
    (preset) =>
      preset.values.dailyLimit === form.dailyLimit &&
      preset.values.minSpacingSec === form.minSpacingSec &&
      preset.values.windowHours === form.windowHours,
  )

  const warning =
    form.dailyLimit > 500
      ? 'That daily cap is above Instagram’s comfortable range. Expect throttling to hold messages back.'
      : form.minSpacingSec < 30
        ? 'Very fast pacing is the most common cause of temporary rate limits.'
        : null

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          dm_daily_limit: form.dailyLimit,
          dm_min_spacing_secs: form.minSpacingSec,
          dm_window_hours: form.windowHours,
        }),
      })
      const body = (await response.json().catch(() => null)) as
        | { limits?: SendLimits; error?: string }
        | null
      if (!response.ok || !body?.limits) {
        throw new Error(body?.error || 'Could not save your settings.')
      }
      onSaved(body.limits)
      toast.success('Sending limits saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save your settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="gap-5 p-5">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-brand-soft-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Sending limits</h2>
          {dirty ? (
            <Badge variant="warning" size="sm">
              Unsaved
            </Badge>
          ) : null}
        </div>

        <div className="space-y-6">
          <LimitControl
            id="daily-limit"
            label="Daily message cap"
            description="Maximum outbound messages across all automations in a rolling 24 hours. The queue pauses and resumes automatically when it resets."
            unit="msgs"
            min={SETTING_BOUNDS.dailyLimit.min}
            max={SETTING_BOUNDS.dailyLimit.max}
            step={SETTING_BOUNDS.dailyLimit.step}
            value={form.dailyLimit}
            onChange={(next) => set('dailyLimit', next)}
            minLabel={String(SETTING_BOUNDS.dailyLimit.min)}
            maxLabel={String(SETTING_BOUNDS.dailyLimit.max)}
          />
          <Separator />
          <LimitControl
            id="min-spacing"
            label="Minimum spacing"
            description="How long to wait between two messages to the same person. A floor here is the single best protection against rate limits."
            unit="seconds"
            min={SETTING_BOUNDS.minSpacingSec.min}
            max={SETTING_BOUNDS.minSpacingSec.max}
            step={SETTING_BOUNDS.minSpacingSec.step}
            value={form.minSpacingSec}
            onChange={(next) => set('minSpacingSec', next)}
            minLabel={`${SETTING_BOUNDS.minSpacingSec.min}s`}
            maxLabel={`${SETTING_BOUNDS.minSpacingSec.max}s`}
          />
          <Separator />
          <LimitControl
            id="window-hours"
            label="Messaging window"
            description="How long after someone messages you the conversation stays open to reply. Instagram’s standard DM window is 24 hours."
            unit="hours"
            min={SETTING_BOUNDS.windowHours.min}
            max={SETTING_BOUNDS.windowHours.max}
            step={SETTING_BOUNDS.windowHours.step}
            value={form.windowHours}
            onChange={(next) => set('windowHours', next)}
            minLabel={`${SETTING_BOUNDS.windowHours.min}h`}
            maxLabel={`${SETTING_BOUNDS.windowHours.max}h`}
          />
        </div>

        {warning ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-[12px] border border-warning-soft bg-warning-soft px-3 py-2.5 text-[11px] leading-5 text-warning-soft-foreground"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {warning}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={!dirty || !valid || saving}>
            {saving ? <Spinner /> : <Check />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setForm(limits)}
            disabled={!dirty || saving}
          >
            Reset
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="gap-4 p-5">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-brand-soft-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Presets</h2>
          </div>
          <div className="space-y-2">
            {LIMIT_PRESETS.map((preset) => {
              const selected = activePreset?.id === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    setForm({
                      dailyLimit: preset.values.dailyLimit,
                      minSpacingSec: preset.values.minSpacingSec,
                      windowHours: preset.values.windowHours,
                    })
                  }
                  aria-pressed={selected}
                  className={cn(
                    'w-full rounded-[12px] border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-brand bg-brand-soft'
                      : 'border-border bg-surface hover:border-brand/60',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{preset.label}</span>
                    <span className="tnum text-[11px] text-muted-text">
                      {preset.values.dailyLimit}/day · {preset.values.minSpacingSec}s
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-text">
                    {preset.description}
                  </span>
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="gap-2 p-5">
          <Eyebrow>Effective pacing</Eyebrow>
          <p className="text-sm leading-6 text-muted-text text-pretty">
            Up to{' '}
            <span className="font-semibold text-foreground">
              {form.dailyLimit.toLocaleString()} messages/day
            </span>
            , no more than once every{' '}
            <span className="font-semibold text-foreground">
              {form.minSpacingSec}s
            </span>{' '}
            per person, inside a{' '}
            <span className="font-semibold text-foreground">
              {form.windowHours}h
            </span>{' '}
            window.
          </p>
        </Card>
      </div>
    </div>
  )
}

function QueueSection({
  userId,
  queue,
  onDrained,
}: {
  userId: string
  queue: QueueSnapshot
  onDrained: () => void
}) {
  const [draining, setDraining] = useState(false)

  const queued = (queue.counts.pending ?? 0) + (queue.counts.rate_limited ?? 0)
  const sending = queue.counts.processing ?? 0
  const sent = queue.counts.sent ?? 0
  const attention = (queue.counts.failed ?? 0) + (queue.counts.blocked_window ?? 0)

  const drain = async () => {
    setDraining(true)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'drain' }),
      })
      const body = (await response.json().catch(() => null)) as
        | { summary?: { claimed: number; sent: number; failed: number; deferred: number; blocked: number }; error?: string }
        | null
      if (!response.ok) throw new Error(body?.error || 'Could not run the queue.')
      const summary = body?.summary
      toast.success(
        summary
          ? `Delivered ${summary.sent} · deferred ${summary.deferred} · failed ${summary.failed}`
          : 'Queue run complete',
      )
      onDrained()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not run the queue.')
    } finally {
      setDraining(false)
    }
  }

  return (
    <div className="space-y-4">
      <section aria-label="Queue status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting"
          value={queued.toLocaleString()}
          hint={queue.dueNow > 0 ? `${queue.dueNow} due right now` : 'Nothing due yet'}
          icon={<Inbox />}
          tone="neutral"
          live
        />
        <StatCard
          label="Sending"
          value={sending.toLocaleString()}
          hint="Claimed and in flight"
          icon={<Spinner className="size-4" />}
          tone="brand"
          live
        />
        <StatCard
          label="Delivered"
          value={sent.toLocaleString()}
          hint={queue.lastSentAt ? `Last ${formatRelative(queue.lastSentAt)}` : 'No sends yet'}
          icon={<Send />}
          tone="success"
          live
        />
        <StatCard
          label="Needs attention"
          value={attention.toLocaleString()}
          hint="Failed or outside the messaging window"
          icon={<AlertTriangle />}
          tone={attention > 0 ? 'danger' : 'neutral'}
          live
        />
      </section>

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Timer className="size-4 text-brand-soft-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Delivery schedule</h2>
            </div>
            <p className="text-xs leading-5 text-muted-text">
              Next eligible send:{' '}
              <span className="font-medium text-foreground">
                {queue.nextSendAt ? formatDateTime(queue.nextSendAt) : 'nothing scheduled'}
              </span>
              {queue.nextSendAt ? ` (${formatRelative(queue.nextSendAt)})` : ''}
            </p>
          </div>
          <Button variant="outline" onClick={drain} disabled={draining}>
            {draining ? <Spinner /> : <RefreshCw />}
            {draining ? 'Sending…' : 'Send queued now'}
          </Button>
        </div>
        <p className="text-[11px] leading-5 text-muted-text">
          The queue normally runs on a schedule. “Send queued now” delivers what is
          already eligible without waiting for the next pass — it never bypasses the
          limits above.
        </p>
      </Card>

      <Card className="gap-4 p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-brand-soft-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Recent problems</h2>
        </div>
        {queue.problems.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-text">
            No failed or window-blocked messages. Everything is flowing.
          </p>
        ) : (
          <ul className="space-y-2">
            {queue.problems.map((problem) => (
              <li
                key={problem.id}
                className="rounded-[12px] border border-border bg-surface-secondary px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium">
                    {problem.recipient_username
                      ? `@${problem.recipient_username}`
                      : 'Unknown recipient'}
                  </span>
                  <Badge
                    variant={problem.status === 'failed' ? 'destructive' : 'warning'}
                    size="sm"
                  >
                    {problem.status === 'failed' ? 'Failed' : 'Window closed'}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] leading-5 text-muted-text">
                  {problem.last_error ?? 'No error detail was recorded.'}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-text">
                  Attempt {problem.attempts} of {problem.max_attempts} ·{' '}
                  {formatRelative(problem.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ComingSoonSection() {
  const items = [
    {
      icon: <Bot className="size-4" />,
      title: 'AI auto-reply',
      description:
        'Let a language model draft replies to common questions. The engine is not wired up in this build yet.',
    },
    {
      icon: <Bell className="size-4" />,
      title: 'Notifications',
      description:
        'Email or push alerts when an automation fires or the queue needs attention. Coming in a later release.',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <Card key={item.title} className="gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full bg-surface-secondary text-muted-text"
              >
                {item.icon}
              </span>
              <h2 className="text-sm font-semibold">{item.title}</h2>
            </span>
            <Badge variant="muted" size="sm">
              Not available
            </Badge>
          </div>
          <p className="text-xs leading-5 text-muted-text text-pretty">
            {item.description}
          </p>
        </Card>
      ))}
    </div>
  )
}

function AdvancedSection({
  accountId,
  onLogout,
}: {
  accountId: string
  onLogout: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="space-y-4">
      <Card className="gap-4 p-5">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-brand-soft-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Platform</h2>
        </div>
        <div>
          <DetailRow
            label="Webhook endpoint"
            value="/api/instagram/webhook"
            copyable
          />
          <DetailRow label="Periodic drain route" value="/api/cron/drain-queue" copyable />
          <DetailRow label="Account reference" value={accountId} copyable />
        </div>
        <p className="text-[11px] leading-5 text-muted-text">
          Instagram delivers comments and DMs to the webhook endpoint, which queues a
          reply. The scheduled drain then paces delivery against your limits.
        </p>
      </Card>

      <Card className="gap-4 border-danger-soft p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-danger-soft-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Danger zone</h2>
        </div>
        <p className="text-xs leading-5 text-muted-text text-pretty">
          Logging out clears this browser&rsquo;s session. Your automations stay saved and
          resume the next time you connect.
        </p>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="destructive" onClick={onLogout}>
              <LogOut /> Yes, log out
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="danger-soft" onClick={() => setConfirming(true)}>
              <LogOut /> Log out
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

export function SettingsPanel() {
  const router = useRouter()
  const { userId, username, profilePic, isLoading: isSessionLoading, logout } =
    useInstagramSession()

  const [data, setData] = useState<SettingsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!userId) return
      if (!options?.quiet) setIsLoading(true)
      try {
        const response = await fetch(
          `/api/settings?userId=${encodeURIComponent(userId)}`,
          { cache: 'no-store' },
        )
        const body = (await response.json().catch(() => null)) as
          | (SettingsResponse & { error?: string })
          | null
        if (!response.ok || !body?.account) {
          throw new Error(body?.error || 'Could not load your settings.')
        }
        setData({
          account: body.account,
          limits: body.limits,
          queue: body.queue,
        })
        setLoadError(null)
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : 'Could not load your settings.',
        )
      } finally {
        if (!options?.quiet) setIsLoading(false)
      }
    },
    [userId],
  )

  useEffect(() => {
    void load()
  }, [load])

  useLiveRefresh(() => void load({ quiet: true }), {
    enabled: Boolean(userId),
    intervalMs: 20_000,
  })

  const reconnectUrl = buildReconnectUrl()
  const account = data?.account ?? null
  const token = account?.token ?? null

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <Eyebrow>Configuration</Eyebrow>
        <h1 className="text-2xl font-bold tracking-[-0.03em]">Settings</h1>
        <p className="max-w-xl text-sm leading-6 text-muted-text text-pretty">
          Your connected account, sending limits, and delivery queue — the controls
          that keep automated replies safe and on time.
        </p>
      </div>
      {token ? (
        <StatusPill tone={TOKEN_TONE[token.status]}>{TOKEN_LABEL[token.status]}</StatusPill>
      ) : null}
    </div>
  )

  if (isSessionLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-5 text-muted-text" />
        <span className="sr-only">Loading settings</span>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="page-pad-airy">
          <EmptyState
            icon={<UserX />}
            title="Log in to manage settings"
            description="Settings are tied to your connected Instagram account."
            action={<Button onClick={() => router.push('/')}>Go to sign in</Button>}
          />
        </Card>
      </div>
    )
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-[124px] animate-pulse rounded-[16px] border border-border bg-surface-secondary"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-[16px] border border-border bg-surface-secondary" />
        <span className="sr-only">Loading settings</span>
      </div>
    )
  }

  if (!data || !account || !token) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="p-0">
          <ErrorState
            icon={<AlertTriangle />}
            title="Settings could not be loaded"
            description={loadError ?? 'Something went wrong.'}
            action={
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCw /> Try again
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  const initial = (username ?? account.username ?? '?').charAt(0).toUpperCase()

  return (
    <div className="space-y-6">
      {header}

      {loadError ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-[12px] border border-warning-soft bg-warning-soft px-3 py-2.5 text-[11px] text-warning-soft-foreground"
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          Showing the last loaded settings — {loadError}
        </p>
      ) : null}

      <Tabs defaultValue="connection" className="gap-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-[12px] border border-border bg-surface-secondary p-1 sm:w-fit">
          <TabsTrigger
            value="connection"
            className="gap-1.5 px-3 text-muted-text data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Link2 /> Connection
          </TabsTrigger>
          <TabsTrigger
            value="limits"
            className="gap-1.5 px-3 text-muted-text data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Gauge /> Sending limits
          </TabsTrigger>
          <TabsTrigger
            value="queue"
            className="gap-1.5 px-3 text-muted-text data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Inbox /> Queue
          </TabsTrigger>
          <TabsTrigger
            value="soon"
            className="gap-1.5 px-3 text-muted-text data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Sparkles /> Coming soon
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="gap-1.5 px-3 text-muted-text data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <KeyRound /> Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="space-y-4">
          <Card className="gap-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {profilePic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePic}
                    alt=""
                    className="size-12 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-full border border-border bg-surface-secondary text-lg font-bold text-muted-text">
                    {initial}
                  </span>
                )}
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">
                      @{username ?? account.username}
                    </h2>
                    <StatusPill tone={TOKEN_TONE[token.status]}>
                      {TOKEN_LABEL[token.status]}
                    </StatusPill>
                  </div>
                  <p className="text-xs text-muted-text">
                    Connected Instagram professional account
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {reconnectUrl ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.location.href = reconnectUrl
                    }}
                  >
                    <ExternalLink /> Reconnect
                  </Button>
                ) : (
                  <Button variant="outline" disabled title="Instagram app not configured">
                    <ExternalLink /> Reconnect
                  </Button>
                )}
                <Button variant="ghost" onClick={logout}>
                  <LogOut /> Log out
                </Button>
              </div>
            </div>

            <Separator />

            <div>
              <DetailRow label="Account ID" value={account.id} copyable />
              <DetailRow
                label="Business account ID"
                value={account.businessAccountId}
                copyable
              />
              <DetailRow label="Page ID" value={account.pageId} copyable />
              <DetailRow
                label="Token expires"
                value={token.expiresAt ? formatDateTime(token.expiresAt) : null}
              />
            </div>

            {token.status === 'expiring' || token.status === 'expired' ? (
              <p
                role="status"
                className={cn(
                  'flex items-start gap-2 rounded-[12px] border px-3 py-2.5 text-[11px] leading-5',
                  token.status === 'expired'
                    ? 'border-danger-soft bg-danger-soft text-danger-soft-foreground'
                    : 'border-warning-soft bg-warning-soft text-warning-soft-foreground',
                )}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {token.status === 'expired'
                  ? 'Your Instagram access token has expired. Reconnect to resume sending.'
                  : `Your access token expires in about ${token.daysRemaining ?? 0} day(s). Reconnect to refresh it.`}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-[11px] text-muted-text">
                <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
                {token.daysRemaining !== null
                  ? `Token is healthy — roughly ${token.daysRemaining} days remaining.`
                  : 'Token expiry is not recorded for this account.'}
              </p>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="limits">
          <SendingLimitsSection
            userId={userId}
            limits={data.limits}
            onSaved={(next) =>
              setData((current) => (current ? { ...current, limits: next } : current))
            }
          />
        </TabsContent>

        <TabsContent value="queue">
          <QueueSection
            userId={userId}
            queue={data.queue}
            onDrained={() => void load({ quiet: true })}
          />
        </TabsContent>

        <TabsContent value="soon">
          <ComingSoonSection />
        </TabsContent>

        <TabsContent value="advanced">
          <AdvancedSection accountId={account.id} onLogout={logout} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
