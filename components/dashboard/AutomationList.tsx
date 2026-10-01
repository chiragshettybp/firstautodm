'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/ui/page-state'
import {
  Trash2,
  Globe,
  Instagram,
  Zap,
  ArrowRight,
  Lock,
  MessageCircle,
  Send,
  Pencil,
  Copy,
  Image as ImageIcon,
  Megaphone,
  EyeOff,
  Timer,
} from 'lucide-react'
import type { Automation } from '@/lib/types'
import { toast } from 'sonner'

interface AutomationListProps {
  automations: Automation[]
  onDelete: (id: string) => void
  onEdit: (rule: Automation) => void
  onChanged: () => void
  userId: string
}

export function AutomationList({
  automations,
  onDelete,
  onEdit,
  onChanged,
  userId,
}: AutomationListProps) {
  const [mediaMap, setMediaMap] = useState<Record<string, string>>({})

  const globalRules = automations.filter((rule) => !rule.specific_media_id)
  const postSpecificRules = automations.filter((rule) => rule.specific_media_id)

  useEffect(() => {
    if (!userId || postSpecificRules.length === 0) return
    const fetchMedia = async () => {
      try {
        const res = await fetch(`/api/instagram/media?userId=${userId}`)
        const data = await res.json()
        if (data.data && Array.isArray(data.data)) {
          const map: Record<string, string> = {}
          data.data.forEach((item: any) => {
            map[item.id] = item.thumbnail_url || item.media_url
          })
          setMediaMap(map)
        }
      } catch (e) {
        console.error('Failed to load thumbnails', e)
      }
    }
    fetchMedia()
  }, [userId, automations.length])

  const handleToggle = async (rule: Automation, active: boolean) => {
    const res = await fetch('/api/automations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, is_active: active }),
    })
    if (res.ok) {
      toast.success(active ? 'Automation enabled' : 'Automation paused')
      onChanged()
    } else {
      toast.error('Failed to update')
    }
  }

  const handleDuplicate = async (rule: Automation) => {
    const res = await fetch('/api/automations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, action: 'duplicate' }),
    })
    if (res.ok) {
      toast.success('Duplicated — the copy starts paused')
      onChanged()
    } else {
      toast.error('Failed to duplicate')
    }
  }

  if (automations.length === 0) {
    return (
      <EmptyState
        icon={<Zap />}
        title="No automations yet"
        description="Create your first automation above — it just takes 30 seconds."
        className="rounded-[16px] border border-dashed bg-surface/40"
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-muted-text uppercase">
        Rules
        <Badge variant="muted" size="sm">
          {automations.length}
        </Badge>
      </h2>

      <div className="flex flex-col gap-6">
        {globalRules.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="ml-1 flex items-center gap-2 text-[10px] font-bold tracking-[0.15em] text-muted-text uppercase">
              <Globe className="size-3" aria-hidden="true" /> Global
            </div>
            {globalRules.map((rule, idx) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onDelete={onDelete}
                onEdit={onEdit}
                onToggle={handleToggle}
                onDuplicate={handleDuplicate}
                index={idx}
              />
            ))}
          </div>
        )}

        {postSpecificRules.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="ml-1 flex items-center gap-2 text-[10px] font-bold tracking-[0.15em] text-muted-text uppercase">
              <Instagram className="size-3" aria-hidden="true" /> Post Specific
            </div>
            {postSpecificRules.map((rule, idx) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onDelete={onDelete}
                onEdit={onEdit}
                onToggle={handleToggle}
                onDuplicate={handleDuplicate}
                index={idx}
                mediaUrl={mediaMap[rule.specific_media_id || '']}
                isSpecific
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const ICON_BUTTON_CLASS =
  'text-muted-text hover:bg-surface-secondary hover:text-foreground'

function RuleCard({
  rule,
  onDelete,
  onEdit,
  onToggle,
  onDuplicate,
  index,
  isSpecific,
  mediaUrl,
}: {
  rule: Automation
  onDelete: (id: string) => void
  onEdit: (rule: Automation) => void
  onToggle: (rule: Automation, active: boolean) => void
  onDuplicate: (rule: Automation) => void
  index: number
  isSpecific?: boolean
  mediaUrl?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const keywords = rule.trigger_value
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  const content: any = rule.response_content || {}
  const isCard = !!content.card
  const isMedia = !!content.media
  const responsePreview = isCard
    ? content.card.title
    : isMedia
      ? `${content.media.type} attachment`
      : (content.message?.slice(0, 50) || '') +
        (content.message?.length > 50 ? '...' : '')

  const replyMode = content.reply_mode
  const isPaused = rule.is_active === false

  return (
    <div
      className={`card fade-up p-4 ${isPaused ? 'opacity-70' : ''}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        {isSpecific ? (
          <div className="size-10 shrink-0 overflow-hidden rounded-[8px] border border-border bg-surface-secondary">
            {mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Instagram className="size-4 text-muted-text" aria-hidden="true" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[8px] border border-brand-soft bg-brand-soft">
            <Globe className="size-4 text-brand-soft-foreground" aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-sm font-semibold">{rule.name}</h4>
            <div className="flex shrink-0 items-center gap-1">
              {confirming ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirming(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onDelete(rule.id)}
                    className="text-xs"
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <>
                  {/* Edit / Duplicate / Delete are ALWAYS visible (no hover reveal) */}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEdit(rule)}
                    title="Edit"
                    aria-label={`Edit ${rule.name}`}
                    className={ICON_BUTTON_CLASS}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDuplicate(rule)}
                    title="Duplicate"
                    aria-label={`Duplicate ${rule.name}`}
                    className={ICON_BUTTON_CLASS}
                  >
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConfirming(true)}
                    title="Delete"
                    aria-label={`Delete ${rule.name}`}
                    className="text-muted-text transition-colors hover:bg-danger-soft hover:text-danger-soft-foreground"
                  >
                    <Trash2 />
                  </Button>
                  <Switch
                    checked={!isPaused}
                    onCheckedChange={(v) => onToggle(rule, v)}
                    aria-label={isPaused ? 'Resume automation' : 'Pause automation'}
                    title={isPaused ? 'Resume automation' : 'Pause automation'}
                    className="ml-1 scale-90"
                  />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {keywords.slice(0, 3).map((kw, i) => (
                <Badge key={i} variant="muted" size="sm">
                  {kw}
                </Badge>
              ))}
              {keywords.length > 3 && (
                <span className="text-[10px] text-muted-text">
                  +{keywords.length - 3}
                </span>
              )}
            </div>

            <ArrowRight className="size-3 shrink-0 text-muted-text" aria-hidden="true" />

            <div className="flex items-center gap-1.5">
              {isCard ? (
                <Send className="size-3 text-brand-soft-foreground" aria-hidden="true" />
              ) : isMedia ? (
                <ImageIcon className="size-3 text-muted-text" aria-hidden="true" />
              ) : (
                <MessageCircle className="size-3 text-brand-soft-foreground" aria-hidden="true" />
              )}
              <span className="max-w-[120px] truncate text-[11px] text-muted-text">
                {responsePreview}
              </span>
            </div>

            {replyMode === 'dm_only' && (
              <Badge variant="muted" size="sm">
                <EyeOff className="mr-0.5 size-2.5" aria-hidden="true" /> DM only
              </Badge>
            )}
            {replyMode === 'public_only' && (
              <Badge variant="muted" size="sm">
                <Megaphone className="mr-0.5 size-2.5" aria-hidden="true" /> Public only
              </Badge>
            )}
            {content.delay_seconds > 0 && (
              <Badge variant="muted" size="sm">
                <Timer className="mr-0.5 size-2.5" aria-hidden="true" />{' '}
                {content.delay_seconds}s
              </Badge>
            )}
            {content.check_follow && (
              <Badge variant="brand" size="sm">
                <Lock className="mr-0.5 size-2.5" aria-hidden="true" /> Follow
              </Badge>
            )}
            {isPaused && (
              <Badge variant="muted" size="sm">
                Paused
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}