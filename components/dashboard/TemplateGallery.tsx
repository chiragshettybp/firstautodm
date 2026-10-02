'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Gift,
  Handshake,
  Layers,
  LifeBuoy,
  Link2,
  Magnet,
  Percent,
  Radio,
  RefreshCw,
  Rocket,
  Sparkles,
  Tag,
  Target,
  Zap,
} from 'lucide-react'

/**
 * Feature 8 — starter template gallery.
 *
 * The catalogue is real rows in `automation_templates`; picking one only fills the
 * wizard, it never creates a rule behind the user's back. Saving from the wizard
 * is the single write path.
 */

export interface AutomationTemplate {
  id: string
  name: string
  description: string
  icon: string
  accent: string
  category: string
  payload: {
    name?: string
    trigger_source?: string
    trigger_type?: string
    trigger_value?: string
    response_content?: Record<string, unknown>
    follow_up_steps?: unknown[]
  }
}

const ICONS: Record<string, React.ReactNode> = {
  magnet: <Magnet className="size-5" />,
  link: <Link2 className="size-5" />,
  tag: <Tag className="size-5" />,
  sparkles: <Sparkles className="size-5" />,
  gift: <Gift className="size-5" />,
  radio: <Radio className="size-5" />,
  lifebuoy: <LifeBuoy className="size-5" />,
  percent: <Percent className="size-5" />,
  rocket: <Rocket className="size-5" />,
  layers: <Layers className="size-5" />,
  handshake: <Handshake className="size-5" />,
  target: <Target className="size-5" />,
}

const ACCENTS: Record<string, string> = {
  violet: 'bg-brand-soft text-brand-soft-foreground',
  blue: 'bg-instagram-blue/10 text-instagram-blue',
  amber: 'bg-warning-soft text-warning-soft-foreground',
  emerald: 'bg-instagram-online/10 text-instagram-online',
  rose: 'bg-danger-soft text-danger-soft-foreground',
}

interface TemplateGalleryProps {
  onUse: (template: AutomationTemplate) => void
}

export function TemplateGallery({ onUse }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<AutomationTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/automation-templates')
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? 'The template catalogue could not be loaded.')
        return
      }
      setTemplates(Array.isArray(json?.templates) ? json.templates : [])
    } catch {
      setError('You appear to be offline. Templates will load when you reconnect.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (isLoading) {
    return (
      <section aria-label="Starter templates" className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-muted-text uppercase">
          Start from a template
        </h2>
        <div
          role="status"
          aria-live="polite"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="h-[104px] animate-pulse rounded-[16px] border border-border bg-surface-secondary"
            />
          ))}
          <span className="sr-only">Loading starter templates</span>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section aria-label="Starter templates" className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-muted-text uppercase">
          Start from a template
        </h2>
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-[16px] border border-danger-soft bg-danger-soft p-4 text-xs text-danger-soft-foreground"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 font-semibold underline underline-offset-2"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      </section>
    )
  }

  if (templates.length === 0) return null

  return (
    <section aria-label="Starter templates" className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-muted-text uppercase">
        Start from a template
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {templates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onUse(template)}
              className="card flex h-full w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-surface-secondary"
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={`flex size-9 items-center justify-center rounded-[10px] ${
                    ACCENTS[template.accent] ?? 'bg-surface-secondary text-muted-text'
                  }`}
                >
                  {ICONS[template.icon] ?? <Zap className="size-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {template.name}
                  </span>
                  <span className="block text-[10px] text-muted-text">
                    {template.category}
                  </span>
                </span>
              </span>
              <span className="text-[11px] leading-5 text-muted-text text-pretty">
                {template.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}