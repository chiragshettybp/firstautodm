'use client'

import { useState, useCallback, useEffect } from 'react'
import { MessageCircle, Send, Sparkles, Plus, Brain } from 'lucide-react'

import { useInstagramSession } from '@/hooks/use-instagram-session'
import { useLiveRefresh } from '@/hooks/use-live-refresh'
import { AutomationList } from '@/components/dashboard/AutomationList'
import { CreateRuleForm } from '@/components/dashboard/CreateRuleForm'
import {
  TemplateGallery,
  type AutomationTemplate,
} from '@/components/dashboard/TemplateGallery'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { SlidingTabs } from '@/components/ui/sliding-tabs'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import type { Automation } from '@/lib/types'

type TriggerSource = 'comment' | 'dm' | 'story'

export default function AutomationsPage() {
  const { userId, isLoading: isSessionLoading } = useInstagramSession()
  const [automations, setAutomations] = useState<Automation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TriggerSource>('comment')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editRule, setEditRule] = useState<Automation | null>(null)
  const [template, setTemplate] = useState<AutomationTemplate | null>(null)
  const [templateTab, setTemplateTab] = useState<TriggerSource>('comment')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiLoading, setAiLoading] = useState(true)
  const [aiToggling, setAiToggling] = useState(false)
  const [showAiContext, setShowAiContext] = useState(false)
  const [aiContext, setAiContext] = useState('')
  const [aiContextSaving, setAiContextSaving] = useState(false)
  const [aiContextSaved, setAiContextSaved] = useState(false)

  useEffect(() => {
    if (!userId) return
    fetch(`/api/groq/auto-reply?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setAiEnabled(data.enabled ?? false)
        setAiContext(data.ai_context ?? '')
      })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [userId])

  const handleSaveAiContext = async () => {
    if (aiContextSaving) return
    setAiContextSaving(true)
    try {
      await fetch('/api/groq/auto-reply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          enabled: aiEnabled,
          ai_context: aiContext,
        }),
      })
      setAiContextSaved(true)
      setTimeout(() => setAiContextSaved(false), 2000)
    } catch {}
    setAiContextSaving(false)
  }

  const handleToggleAI = async () => {
    if (aiToggling) return
    setAiToggling(true)
    const newState = !aiEnabled
    try {
      const res = await fetch('/api/groq/auto-reply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, enabled: newState }),
      })
      if (res.ok) setAiEnabled(newState)
    } catch {}
    setAiToggling(false)
  }

  const fetchAutomations = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`/api/automations?userId=${userId}`)
      const data = await res.json()
      if (res.ok) setAutomations(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (userId) fetchAutomations()
  }, [userId, fetchAutomations])

  // Feature 9: pick up rules changed in another tab.
  useLiveRefresh(fetchAutomations, { enabled: Boolean(userId), intervalMs: 20_000 })

  const handleDeleteRule = async (id: string) => {
    if (!userId) return
    await fetch(
      `/api/automations?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    )
    fetchAutomations()
  }

  const handleEditRule = (rule: Automation) => {
    setEditRule(rule)
    setTemplate(null)
    setShowCreateForm(true)
  }

  /** Feature 8: a template fills the wizard, it does not create the rule. */
  const handleUseTemplate = (chosen: AutomationTemplate) => {
    setEditRule(null)
    setTemplate(chosen)
    if (
      chosen.payload?.trigger_source === 'comment' ||
      chosen.payload?.trigger_source === 'dm' ||
      chosen.payload?.trigger_source === 'story'
    ) {
      setTemplateTab(chosen.payload.trigger_source)
      setActiveTab(chosen.payload.trigger_source)
    }
    setShowCreateForm(true)
  }

  const handleCloseForm = () => {
    setShowCreateForm(false)
    setEditRule(null)
    setTemplate(null)
  }

  if (isSessionLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="size-5 text-muted-text" />
        <span className="sr-only">Loading</span>
      </div>
    )
  }
  if (!userId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-text">
        Please log in
      </div>
    )
  }

  const filteredAutomations = automations.filter(
    (a) => a.trigger_source === activeTab,
  )

  // A template may target a different trigger than the tab the user is on.
  const formTriggerSource: TriggerSource = editRule
    ? editRule.trigger_source
    : template
      ? templateTab
      : activeTab
  const counts = {
    comment: automations.filter((a) => a.trigger_source === 'comment').length,
    dm: automations.filter((a) => a.trigger_source === 'dm').length,
    story: automations.filter((a) => a.trigger_source === 'story').length,
  }

  const tabs = [
    {
      value: 'comment' as const,
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
      label: 'Comments',
      count: counts.comment,
    },
    {
      value: 'dm' as const,
      icon: <Send className="size-4" aria-hidden="true" />,
      label: 'DMs',
      count: counts.dm,
    },
    {
      value: 'story' as const,
      icon: <Sparkles className="size-4" aria-hidden="true" />,
      label: 'Stories',
      count: counts.story,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Rules engine"
        title="Automations"
        action={
          <>
            {aiLoading ? (
              <Spinner className="size-4 text-muted-text" />
            ) : (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAiContext(!showAiContext)}
                  aria-expanded={showAiContext}
                  aria-controls="ai-context-panel"
                  title="AI settings"
                  aria-label="AI settings"
                >
                  <Brain />
                </Button>
                <Button
                  variant={aiEnabled ? 'default' : 'secondary'}
                  onClick={handleToggleAI}
                  disabled={aiToggling}
                  aria-pressed={aiEnabled}
                >
                  <Sparkles className={aiToggling ? 'animate-pulse' : ''} />
                  {aiToggling ? '...' : aiEnabled ? 'AI ON' : 'AI OFF'}
                </Button>
              </>
            )}
            <Button
              variant={showCreateForm ? 'outline' : 'default'}
              onClick={() => {
                if (showCreateForm) {
                  handleCloseForm()
                } else {
                  setEditRule(null)
                  setTemplate(null)
                  setShowCreateForm(true)
                }
              }}
              aria-expanded={showCreateForm}
            >
              <Plus
                className={showCreateForm ? 'rotate-45 transition-transform duration-200' : ''}
              />
              {showCreateForm ? 'Close' : 'New Rule'}
            </Button>
          </>
        }
      />

      {showAiContext ? (
        <Card
          id="ai-context-panel"
          className="notice-in gap-3 border-brand-soft bg-brand-soft p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Brain
              aria-hidden="true"
              className="size-4 shrink-0 text-brand-soft-foreground"
            />
            <span className="text-sm font-semibold">AI Personality Context</span>
          </div>
          <p className="text-xs leading-5 text-muted-text">
            Tell AI about your account — niche, products, tone, what to
            say/avoid. More context = more human replies.
          </p>
          <Textarea
            value={aiContext}
            onChange={(e) => setAiContext(e.target.value)}
            placeholder={`e.g. This is a fitness coaching account. I sell online training programs (₹2999/mo). My tone is motivating but chill. If someone asks about pricing, tell them to DM for a free consultation. Never promise specific results.`}
            rows={4}
            aria-label="AI personality context"
          />
          <div>
            <Button
              size="sm"
              onClick={handleSaveAiContext}
              disabled={aiContextSaving}
            >
              {aiContextSaving
                ? 'Saving...'
                : aiContextSaved
                  ? 'Saved ✓'
                  : 'Save Context'}
            </Button>
          </div>
        </Card>
      ) : null}

      <SlidingTabs
        items={tabs}
        value={activeTab}
        onValueChange={setActiveTab}
        aria-label="Automation trigger type"
        className="self-start"
      />

      {showCreateForm ? (
        <Card className="fade-up p-4 sm:p-6">
          <CreateRuleForm
            userId={userId}
            triggerSource={formTriggerSource}
            editRule={editRule}
            template={template}
            onSuccess={() => {
              fetchAutomations()
              handleCloseForm()
            }}
          />
        </Card>
      ) : (
        <TemplateGallery onUse={handleUseTemplate} />
      )}

      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={-1}
        className="outline-none"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="size-5 text-muted-text" />
            <span className="sr-only">Loading automations</span>
          </div>
        ) : (
          <AutomationList
            automations={filteredAutomations}
            onDelete={handleDeleteRule}
            onEdit={handleEditRule}
            onChanged={fetchAutomations}
            userId={userId}
          />
        )}
      </div>
    </div>
  )
}