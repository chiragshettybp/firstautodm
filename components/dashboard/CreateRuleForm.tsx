"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Plus, Trash2, Film, Check, MessageCircle, Send, AtSign, Heart,
  MessageSquare, Image as ImageIcon, Timer, Eye, Megaphone, Lock,
  Link2, Zap, ChevronDown, ChevronRight, ChevronLeft, X, Loader2,
  ArrowLeft, Phone, Video, Info, Sparkles, Smile, Camera, Mic, Image as PicIcon,
  Globe
} from "lucide-react"
import { TagInput } from "@/components/ui/tag-input"
import { MediaPicker } from "@/components/dashboard/MediaPicker"
import type { AutomationTemplate } from "@/components/dashboard/TemplateGallery"
import type { ProButton, QuickReplyOption, Automation } from "@/lib/types"
import { IG } from "@/lib/validation"
import { toast } from "sonner"

/* ============================================================
   AESTHETIC & SEXY WIZARD FOR INSTAGRAM AUTOMATION RULES
   Step 1: TRIGGER  — Select Reel/Post first, then set keywords
   Step 2: RESPONSE — What do they get?
   Step 3: SETTINGS — Name it & delivery options
   ============================================================ */

interface CreateRuleFormProps {
  userId: string
  triggerSource: "comment" | "dm" | "story"
  onSuccess: () => void
  editRule?: Automation | null
  /** Feature 8: fills every step of the wizard without saving anything yet. */
  template?: AutomationTemplate | null
}

const STEPS = [
  { key: "trigger", label: "Trigger Source", sub: "When does it fire?" },
  { key: "response", label: "Reply Payload", sub: "What do they get?" },
  { key: "settings", label: "Final Settings", sub: "Speed & restrictions" },
] as const

/** Editor shape of a `automations.follow_up_steps` entry (see lib/validation). */
interface FollowUpStep {
  id: string
  name: string
  waitMinutes: number
  message: string
  advanceKind: "quick_reply" | "keyword" | "payload" | "timeout"
  advanceValue: string
  isConversion: boolean
}

function newStep(index: number): FollowUpStep {
  return {
    id: `step_${Date.now().toString(36)}_${index}`,
    name: `Step ${index + 1}`,
    waitMinutes: index === 0 ? 1440 : 2880,
    message: "",
    advanceKind: "timeout",
    advanceValue: "",
    isConversion: false,
  }
}

export function CreateRuleForm({ userId, triggerSource, onSuccess, editRule, template }: CreateRuleFormProps) {
  const isEditing = !!editRule
  const [step, setStep] = useState(0)

  /* ---------- WHEN ---------- */
  const [triggers, setTriggers] = useState<string[]>([])
  const [storyTriggerType, setStoryTriggerType] = useState<"mention" | "reaction" | "reply">("mention")
  const [selectedReel, setSelectedReel] = useState<any | null>(null)
  const [hasSelectedReelOption, setHasSelectedReelOption] = useState<boolean>(false)

  /* ---------- THEN ---------- */
  const [type, setType] = useState<"text" | "card" | "media">("text")
  const [messageText, setMessageText] = useState("")
  const [cardTitle, setCardTitle] = useState("")
  const [cardSubtitle, setCardSubtitle] = useState("")
  const [cardImage, setCardImage] = useState("")
  const [buttons, setButtons] = useState<ProButton[]>([])
  const [mediaUrl, setMediaUrl] = useState("")
  const [mediaType, setMediaType] = useState<"image" | "video" | "audio">("image")
  const [quickReplies, setQuickReplies] = useState<QuickReplyOption[]>([])

  /* ---------- Public comment reply ---------- */
  const [replyMode, setReplyMode] = useState<"both" | "dm_only" | "public_only">("both")
  const [publicReplies, setPublicReplies] = useState<string[]>([])
  const [includeReplies, setIncludeReplies] = useState(false)

  /* ---------- EXTRAS ---------- */
  const [name, setName] = useState("")
  const [checkFollow, setCheckFollow] = useState(false)
  const [delaySeconds, setDelaySeconds] = useState(0)
  const [typingIndicator, setTypingIndicator] = useState(false)
  const [markSeen, setMarkSeen] = useState(true)

  /* ---------- Funnel follow-up steps (feature 10) ---------- */
  const [followUpSteps, setFollowUpSteps] = useState<FollowUpStep[]>([])

  /* Server-side field errors, mapped back onto the inputs below */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [reels, setReels] = useState<any[]>([])
  const [loadingReels, setLoadingReels] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoadingReels(true)
    fetch(`/api/instagram/media?userId=${userId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const list = j.data && Array.isArray(j.data) ? j.data : Array.isArray(j) ? j : []
        setReels(list)
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingReels(false))
    return () => { cancelled = true }
  }, [userId])

  /* Prefill on edit */
  useEffect(() => {
    if (!editRule) return
    const content: any =
      typeof editRule.response_content === "string"
        ? JSON.parse(editRule.response_content as any)
        : editRule.response_content || {}

    setName(editRule.name)
    if (["mention", "reaction", "reply"].includes(editRule.trigger_type)) {
      setStoryTriggerType(editRule.trigger_type as any)
    }
    const rawTriggers = (editRule.trigger_value || "")
      .split(",").map((t) => t.trim())
      .filter((t) => t && !["ALL", "ALL_COMMENTS", "ALL_MENTIONS", "ALL_REACTIONS"].includes(t.toUpperCase()))
    setTriggers(rawTriggers)

    if (content.media?.url) {
      setType("media"); setMediaUrl(content.media.url); setMediaType(content.media.type || "image"); setMessageText(content.message || "")
    } else if (content.card) {
      setType("card"); setCardTitle(content.card.title || ""); setCardSubtitle(content.card.subtitle || ""); setCardImage(content.card.image_url || "")
      setButtons((content.card.buttons || []).map((b: any, i: number) => ({ id: `${Date.now()}_${i}`, ...b })))
    } else {
      setType("text"); setMessageText(content.message || "")
    }
    setQuickReplies((content.quick_replies || []).map((q: any, i: number) => ({ id: `${Date.now()}_qr${i}`, title: q.title, payload: q.payload })))
    setReplyMode(content.reply_mode || "both")
    setPublicReplies(content.public_replies || [])
    setIncludeReplies(content.include_replies === true)
    setCheckFollow(content.check_follow === true)
    setDelaySeconds(Number(content.delay_seconds) || 0)
    setTypingIndicator(content.typing_indicator === true)
    setMarkSeen(content.mark_seen !== false)

    const rawSteps: any[] = Array.isArray(editRule.follow_up_steps)
      ? editRule.follow_up_steps
      : []
    setFollowUpSteps(
      rawSteps.map((step: any, i: number) => ({
        id: String(step.id ?? `step_${i}`),
        name: String(step.name ?? `Step ${i + 1}`),
        waitMinutes: Number(step.wait_minutes) || 0,
        message: String(step.content?.message ?? ""),
        advanceKind: step.advance_on?.kind ?? "timeout",
        advanceValue: String(step.advance_on?.value ?? ""),
        isConversion: step.is_conversion_step === true,
      })),
    )
    
    if (editRule.specific_media_id) {
      setSelectedReel({ id: editRule.specific_media_id, caption: "Selected post" })
      setHasSelectedReelOption(true)
    } else {
      setHasSelectedReelOption(false)
    }
  }, [editRule])

  /* Prefill from a starter template (feature 8). Applied on selection only, so
     the user still has to review the payload and press save. */
  useEffect(() => {
    if (!template) return
    const payload = template.payload ?? {}
    const content: any = payload.response_content ?? {}

    if (payload.name) setName(payload.name)
    if (payload.trigger_type && ["mention", "reaction", "reply"].includes(payload.trigger_type)) {
      setStoryTriggerType(payload.trigger_type as any)
    }
    const rawTriggers = (payload.trigger_value || "")
      .split(",").map((t: string) => t.trim())
      .filter((t: string) => t && !["ALL", "ALL_COMMENTS", "ALL_MENTIONS", "ALL_REACTIONS"].includes(t.toUpperCase()))
    setTriggers(rawTriggers)

    if (content.media?.url) {
      setType("media"); setMediaUrl(content.media.url); setMediaType(content.media.type || "image")
    } else if (content.card) {
      setType("card")
      setCardTitle(content.card.title || "")
      setCardSubtitle(content.card.subtitle || "")
      setCardImage(content.card.image_url || "")
      setButtons((content.card.buttons || []).map((b: any, i: number) => ({ id: `${Date.now()}_${i}`, ...b })))
    } else {
      setType("text")
    }
    setMessageText(content.message || "")
    setQuickReplies((content.quick_replies || []).map((q: any, i: number) => ({ id: `${Date.now()}_qr${i}`, title: q.title, payload: q.payload })))
    setReplyMode(content.reply_mode || "both")
    setPublicReplies(content.public_replies || [])
    setIncludeReplies(content.include_replies === true)
    setCheckFollow(content.check_follow === true)
    setDelaySeconds(Number(content.delay_seconds) || 0)
    setTypingIndicator(content.typing_indicator === true)
    setMarkSeen(content.mark_seen !== false)

    const rawSteps: any[] = Array.isArray(payload.follow_up_steps) ? payload.follow_up_steps : []
    setFollowUpSteps(
      rawSteps.map((step: any, i: number) => ({
        id: String(step.id ?? `step_${i}`),
        name: String(step.name ?? `Step ${i + 1}`),
        waitMinutes: Number(step.wait_minutes) || 0,
        message: String(step.content?.message ?? ""),
        advanceKind: step.advance_on?.kind ?? "timeout",
        advanceValue: String(step.advance_on?.value ?? ""),
        isConversion: step.is_conversion_step === true,
      })),
    )

    setFieldErrors({})
    setStep(1)
    setAppliedTemplate(template.name)
  }, [template])

  /* Auto name */
  useEffect(() => {
    if (name || isEditing) return
    const isReplyAll = triggerSource === "comment" && triggers.length === 0
    if (isReplyAll) setName("Reply to every comment")
    else if (triggers.length > 0) setName(`Reply to "${triggers[0]}"`)
  }, [triggers, name, isEditing, triggerSource])

  /* ---------- helpers ---------- */
  const addButton = () => {
    if (buttons.length >= 3) return
    setButtons([...buttons, { id: Date.now().toString(), type: "web_url", title: "", url: "", payload: "" }])
  }
  const updateButton = (id: string, field: keyof ProButton, value: string) =>
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
  const removeButton = (id: string) => setButtons(buttons.filter((b) => b.id !== id))

  const addQuickReply = () => {
    if (quickReplies.length >= 4) return
    setQuickReplies([...quickReplies, { id: Date.now().toString(), title: "" }])
  }
  const updateQuickReply = (id: string, title: string) =>
    setQuickReplies(quickReplies.map((q) => (q.id === id ? { ...q, title } : q)))
  const removeQuickReply = (id: string) => setQuickReplies(quickReplies.filter((q) => q.id !== id))

  /* ---------- funnel step helpers ---------- */
  const addStep = () => {
    if (followUpSteps.length >= IG.stepsMax) return
    setFollowUpSteps([...followUpSteps, newStep(followUpSteps.length)])
  }
  const updateStep = (id: string, patch: Partial<FollowUpStep>) =>
    setFollowUpSteps(followUpSteps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const removeStep = (id: string) => setFollowUpSteps(followUpSteps.filter((s) => s.id !== id))
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= followUpSteps.length) return
    const next = [...followUpSteps]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setFollowUpSteps(next)
  }

  /** Steps the editor will actually persist: complete, correctly-shaped ones. */
  const usableSteps = followUpSteps.filter((s) => s.name.trim() && s.message.trim())
  const stepsValid = followUpSteps.every(
    (s) =>
      s.name.trim().length > 0 &&
      s.message.trim().length > 0 &&
      s.message.trim().length <= IG.messageMax &&
      (s.advanceKind === "timeout" || s.advanceValue.trim().length > 0),
  )

  const needsKeywords = triggerSource === "dm" || (triggerSource === "story" && storyTriggerType !== "mention")

  const whenValid = triggerSource === "comment" 
    ? hasSelectedReelOption // Comment trigger is valid once they select a specific post or global option
    : !needsKeywords || triggers.length > 0

  const thenValid =
    replyMode === "public_only" ||
    (type === "text" ? messageText.trim().length > 0 : type === "card" ? cardTitle.trim().length > 0 : isHttpUrl(mediaUrl))
  const canSave = whenValid && thenValid && name.trim().length > 0 && stepsValid

  const stepValid = [
    whenValid,  // step 0
    thenValid,  // step 1
    name.trim().length > 0 && stepsValid, // step 2
  ]

  /* Plain-language summary sentence */
  const summary = useMemo(() => {
    const isReplyAll = triggerSource === "comment" && triggers.length === 0
    const who =
      triggerSource === "comment"
        ? isReplyAll ? "anyone comments on your post" : `someone comments ${triggers.length ? `"${triggers[0]}"` : "a keyword"}`
        : triggerSource === "dm"
          ? `someone DMs you ${triggers.length ? `"${triggers[0]}"` : "a keyword"}`
          : storyTriggerType === "mention" ? "someone mentions you in a story"
            : storyTriggerType === "reaction" ? "someone reacts to your story"
              : "someone replies to your story"
    const what =
      replyMode === "public_only" ? "reply publicly"
        : type === "card" ? "send them a card with buttons"
          : type === "media" ? `send them ${mediaType === "image" ? "an image" : `a ${mediaType}`}`
            : "send them a DM"
    return { who, what }
  }, [triggerSource, triggers, storyTriggerType, replyMode, type, mediaType])

  /* ---------- save ---------- */
  const handleSubmit = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setFieldErrors({})

    const isReplyAll = triggerSource === "comment" && triggers.length === 0

    const content: any = { check_follow: checkFollow, mark_seen: markSeen }
    if (delaySeconds > 0) content.delay_seconds = delaySeconds
    if (typingIndicator) content.typing_indicator = true
    if (triggerSource === "comment") {
      content.reply_mode = replyMode
      if (publicReplies.length > 0) content.public_replies = publicReplies
      if (includeReplies) content.include_replies = true
    }
    if (quickReplies.filter((q) => q.title.trim()).length > 0) {
      content.quick_replies = quickReplies.filter((q) => q.title.trim()).map((q) => ({ title: q.title.trim(), payload: q.payload }))
    }

    if (type === "text") {
      content.message = messageText
    } else if (type === "media") {
      content.media = { type: mediaType, url: mediaUrl.trim() }
      if (messageText.trim()) content.message = messageText
    } else {
      const cleanButtons = buttons
        .map((b) => {
          if (b.type === "web_url") {
            let cleanUrl = b.url?.trim() || ""
            if (cleanUrl.startsWith("https://https://")) cleanUrl = cleanUrl.replace("https://https://", "https://")
            return { type: "web_url" as const, title: b.title, url: cleanUrl }
          }
          return { type: "postback" as const, title: b.title, payload: b.payload }
        })
        .filter((b) => b.title)
      content.card = { title: cardTitle, subtitle: cardSubtitle || undefined, image_url: cardImage || undefined, buttons: cleanButtons }
    }

    const payload = {
      userId,
      name,
      trigger_source: triggerSource,
      trigger_type: isReplyAll ? "reply_all" : triggerSource === "story" ? storyTriggerType : "keyword",
      trigger_value: isReplyAll ? "ALL_COMMENTS"
        : triggerSource === "story" && storyTriggerType === "mention" ? "ALL_MENTIONS"
          : triggerSource === "story" && storyTriggerType === "reaction" && triggers.length === 0 ? "ALL_REACTIONS"
            : triggers.length > 0 ? triggers.join(", ") : "ALL",
      content,
      follow_up_steps: usableSteps.length > 0
        ? usableSteps.map((s, i) => ({
            id: s.id,
            name: s.name.trim(),
            wait_minutes: s.waitMinutes,
            content: { message: s.message.trim() },
            advance_on: { kind: s.advanceKind, value: s.advanceValue.trim() },
            is_conversion_step: s.isConversion,
          }))
        : null,
      specific_media_id: selectedReel?.id || null,
    }

    try {
      const res = await fetch("/api/automations", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { ...payload, id: editRule!.id } : payload),
      })
      if (res.ok) {
        toast.success(isEditing ? "Automation updated" : "Automation is live")
        onSuccess()
        return
      }

      const json = await res.json().catch(() => null)
      if (json?.fields) {
        setFieldErrors(json.fields as Record<string, string>)
        toast.error(json.error ?? "Please fix the highlighted fields.")
        return
      }
      toast.error(json?.error ?? "Could not save — try again")
    } catch {
      toast.error("Network error — nothing was saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Stepper Timeline ── */}
      <div className="rounded-[16px] border border-border bg-card p-4 md:px-8">
        <div className="relative flex items-center justify-between gap-4">
          {STEPS.map((s, i) => {
            const isActive = i === step
            const isCompleted = i < step
            return (
              <div
                key={s.key}
                className="flex flex-1 items-center gap-3 last:flex-initial"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (i < step || stepValid[step]) setStep(i)
                  }}
                  aria-current={isActive ? 'step' : undefined}
                  className="group text-left"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-[12px] text-xs font-bold transition-colors duration-300 ${
                      isCompleted
                        ? 'bg-brand text-brand-foreground'
                        : isActive
                          ? 'border border-border bg-surface text-foreground'
                          : 'border border-border bg-surface-secondary text-muted-text'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="check-pop size-4" strokeWidth={3} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="hidden md:block">
                    <span
                      className={`block text-xs font-bold tracking-tight uppercase ${isActive ? 'text-foreground' : 'text-muted-text group-hover:text-foreground'}`}
                    >
                      {s.label}
                    </span>
                    <span className="block text-[10px] text-muted-text">{s.sub}</span>
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-separator">
                    <span
                      className={`absolute inset-y-0 left-0 bg-brand transition-all duration-300 ${isCompleted ? 'w-full' : 'w-0'}`}
                    />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Two Column Workspace ── */}
      <div className="grid lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px] items-start gap-6 xl:gap-8">
        {/* ── LEFT: Config Form ── */}
        <div className="min-w-0 space-y-6 rounded-[16px] border border-border bg-card p-5 md:p-8">
          {appliedTemplate && !isEditing ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-brand/20 bg-brand-soft p-3.5">
              <Sparkles className="size-4 shrink-0 text-brand-soft-foreground" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[11px] text-brand-soft-foreground">
                <span className="font-bold">{appliedTemplate}</span> filled in for you.
                Review each step, then save to activate it.
              </p>
              <button
                type="button"
                onClick={() => setAppliedTemplate(null)}
                aria-label="Dismiss template notice"
                className="press-subtle p-1 text-brand-soft-foreground/70 transition-colors hover:text-brand-soft-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {/* Server-side validation failures, echoed back by the API route */}
          {Object.keys(fieldErrors).length > 0 && (
            <div
              role="alert"
              className="flex flex-col gap-1.5 rounded-2xl border border-danger-soft bg-danger-soft p-4"
            >
              <p className="text-xs font-bold text-danger-soft-foreground">
                Instagram would reject this rule. Fix:
              </p>
              <ul className="list-inside list-disc space-y-0.5">
                {Object.entries(fieldErrors).map(([key, message]) => (
                  <li key={key} className="text-[11px] text-danger-soft-foreground">
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* ===== STEP 1: TRIGGER ===== */}
          {step === 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <StepHeader
                number={1}
                title={triggerSource === "comment" ? "Select the target post/reel" : triggerSource === "dm" ? "When someone DMs you" : "When someone interacts with your story"}
                description={triggerSource === "comment" ? "Choose the specific media to automate." : "Set the conditions that launch this automation."}
              />

              {triggerSource === "story" && (
                <div className="space-y-3">
                  <FieldLabel>Select Story Interaction Type</FieldLabel>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { key: "mention" as const, icon: <AtSign className="w-5 h-5" />, label: "Mentions me", desc: "Tagged in a story" },
                      { key: "reaction" as const, icon: <Heart className="w-5 h-5" />, label: "Reacts", desc: "Sends emoji reaction" },
                      { key: "reply" as const, icon: <MessageSquare className="w-5 h-5" />, label: "Replies", desc: "Text reply to story" },
                    ]).map(({ key, icon, label, desc }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStoryTriggerType(key)}
                        className={`flex flex-col gap-2 rounded-[12px] border p-4 text-left transition-colors duration-200 ${
                          storyTriggerType === key
                            ? 'border-brand bg-brand-soft text-brand-soft-foreground'
                            : 'border-border bg-surface text-muted-text hover:text-foreground'
                        }`}
                      >
                        <span className={storyTriggerType === key ? 'text-brand' : 'text-muted-text'}>
                          {icon}
                        </span>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
                          <p className="text-[10px] text-muted-text font-normal mt-0.5">{desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {triggerSource === "comment" && (
                <div className="space-y-4">
                  <FieldLabel>Automate which post or reel?</FieldLabel>
                  {loadingReels ? (
                    <div className="p-8 flex flex-col items-center justify-center gap-3 border border-border rounded-2xl bg-surface-secondary">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-soft-foreground" />
                      <span className="text-xs text-muted-text">Fetching Instagram feed...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-3 max-h-[55vh] sm:max-h-[420px] overflow-y-auto pr-1 pb-1">
                      {/* Option: Global Post Rule */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReel(null)
                          setHasSelectedReelOption(true)
                        }}
                        className={`aspect-square flex flex-col items-center justify-center rounded-[12px] border p-2 text-center transition-colors duration-200 sm:p-4 ${
                          hasSelectedReelOption && selectedReel === null
                            ? 'border-brand bg-brand-soft'
                            : 'border-border bg-card hover:bg-surface-secondary'
                        }`}
                      >
                        <Globe className="mb-2 size-6 text-brand" />
                        <span className="text-xs font-bold text-foreground">All Posts &amp; Reels</span>
                        <span className="mt-1 text-[10px] text-muted-text">Global Trigger</span>
                      </button>

                      {reels.map((reel) => {
                        const isSelected = hasSelectedReelOption && selectedReel?.id === reel.id
                        return (
                          <button
                            key={reel.id}
                            type="button"
                            onClick={() => {
                              setSelectedReel(reel)
                              setHasSelectedReelOption(true)
                            }}
                            className={`group relative aspect-square overflow-hidden rounded-[12px] border bg-neutral-900 text-left transition-colors duration-200 ${
                                                        isSelected
                                                          ? 'border-brand ring-2 ring-brand/30'
                                                          : 'border-border hover:border-foreground/40'
                                                      }`}
                                                    >
                                                      {reel.image_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                          src={reel.image_url}
                                                          alt=""
                                                          loading="lazy"
                                                          className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                                                        />
                                                      ) : (
                                                        <div className="flex size-full items-center justify-center bg-neutral-900">
                                                          <Film className="size-6 text-neutral-600" />
                                                        </div>
                                                      )}

                                                      {/* Subtle dark gradient so caption + type pill stay readable in BOTH themes */}
                                                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                                                      {/* Type Overlay */}
                                                      <span className="absolute top-2 left-2 rounded-[6px] border border-white/10 bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-white uppercase">
                                                        {reel.media_type === "STORY" ? "Story" : reel.media_type === "VIDEO" ? "Reel" : "Post"}
                                                      </span>

                                                      {/* Selected Check overlay */}
                                                      {isSelected && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-brand/20 backdrop-blur-[1px]">
                                                          <span className="check-pop flex size-9 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg ring-2 ring-brand-foreground">
                                                            <Check className="size-4" strokeWidth={3} />
                                                          </span>
                                                        </div>
                                                      )}

                                                      {/* Caption snippet at bottom — white text on dark gradient for contrast in BOTH themes */}
                                                      <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 pointer-events-none">
                                                        <p className="text-[10px] text-white line-clamp-1 font-sans drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{reel.caption || "Untitled"}</p>
                                                      </div>
                                                    </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Configure keywords only after selection (for Comment triggers) or always for others */}
              {(triggerSource !== "comment" || hasSelectedReelOption) && (
                <div className="space-y-4 pt-3 border-t border-border animate-in fade-in slide-in-from-top-2 duration-300">
                  {triggerSource === "comment" ? (
                    <div className="space-y-2">
                      <FieldLabel>Keywords to match</FieldLabel>
                      <p className="text-[11px] text-muted-text">
                        What keyword triggers this DM? <span className="text-brand-soft-foreground font-semibold">Keep empty to reply to every comment.</span>
                      </p>
                      <TagInput
                        value={triggers}
                        onChange={setTriggers}
                        placeholder="type keyword, press Enter (e.g. guide)"
                      />
                    </div>
                  ) : needsKeywords ? (
                    <div className="space-y-2 bg-surface-secondary p-5 rounded-2xl border border-border">
                      <FieldLabel>
                        {triggerSource === "story" && storyTriggerType === "reaction"
                          ? "Only react on these emojis"
                          : "Trigger keywords"}
                      </FieldLabel>
                      <p className="text-[11px] text-muted-text mb-3">
                        {triggerSource === "story" && storyTriggerType === "reaction"
                          ? "Leave empty to trigger on any emoji reaction."
                          : "Matches exact phrases or words (case-insensitive)."}
                      </p>
                      <TagInput
                        value={triggers}
                        onChange={setTriggers}
                        placeholder={
                          triggerSource === "story" && storyTriggerType === "reaction" ? "e.g. ❤️, 🔥, 👍" : "type keyword, press Enter (e.g. price)"
                        }
                      />
                    </div>
                  ) : null}

                  {triggerSource === "comment" && triggers.length > 0 && (
                    <ToggleRow
                      icon={<MessageSquare className="w-5 h-5" />}
                      title="Check replies to comments"
                      sub="Normally only primary post comments trigger replies"
                      on={includeReplies}
                      onToggle={() => setIncludeReplies(!includeReplies)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 2: RESPONSE ===== */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <StepHeader
                number={2}
                title="Compose response message"
                description="Pick the format and craft the message sent to prospects."
              />

              {triggerSource === "comment" && (
                <div className="space-y-2">
                  <FieldLabel>Flow direction</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: "both" as const, label: "Reply + DM" },
                      { key: "public_only" as const, label: "Reply only" },
                      { key: "dm_only" as const, label: "DM only" },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setReplyMode(key)}
                        className={`h-11 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                          replyMode === key ? "border-brand bg-brand-soft text-brand-soft-foreground" : "border-border text-muted-text hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {triggerSource === "comment" && replyMode !== "dm_only" && (
                <div className="space-y-2 bg-surface-secondary p-5 rounded-2xl border border-border">
                  <FieldLabel>Public comments rotation</FieldLabel>
                  <p className="text-[11px] text-muted-text mb-3">Add multiple phrases. We rotate them dynamically to look human.</p>
                  <TagInput value={publicReplies} onChange={setPublicReplies} placeholder={'e.g. "Sent you a DM!", "Check your inbox!"'} />
                </div>
              )}

              {replyMode !== "public_only" && (
                <div className="space-y-5 pt-2">
                  <div className="space-y-2">
                    <FieldLabel>Direct Message Format</FieldLabel>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { key: "text" as const, icon: <MessageCircle className="w-4.5 h-4.5" />, label: "Text Only" },
                        { key: "card" as const, icon: <Link2 className="w-4.5 h-4.5" />, label: "Card / Link" },
                        { key: "media" as const, icon: <ImageIcon className="w-4.5 h-4.5" />, label: "Rich Media" },
                      ]).map(({ key, icon, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setType(key)}
                          className={`p-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                            type === key ? "border-brand bg-brand-soft text-brand-soft-foreground" : "border-border text-muted-text hover:text-foreground"
                          }`}
                        >
                          {icon}
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {type === "text" && (
                    <div className="space-y-2">
                      <FieldLabel>DM Message Text</FieldLabel>
                      <textarea
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        rows={5}
                        maxLength={1000}
                        className="field resize-none"
                        placeholder="Type the message to send in DMs..."
                      />
                      <p className="text-[10px] text-muted-text text-right">{messageText.length}/1000</p>
                    </div>
                  )}

                  {type === "card" && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <FieldLabel>Card configuration</FieldLabel>
                        <TextField value={cardTitle} onChange={setCardTitle} placeholder="Card main title" />
<TextField value={cardSubtitle} onChange={setCardSubtitle} placeholder="Subtitle description (optional)" />
                      </div>
                      <MediaPicker
                        userId={userId}
                        value={cardImage}
                        onChange={setCardImage}
                        kind="image"
                        label="Card cover"
                        hint="Instagram downloads the cover when it delivers the card, so it must be a public URL."
                      />
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-border pb-2">
                          <FieldLabel>Interactive buttons ({buttons.length}/3)</FieldLabel>
                          <button type="button" onClick={addButton} disabled={buttons.length >= 3}
                            className="text-[11px] text-muted-text hover:text-foreground disabled:opacity-40 flex items-center gap-1 transition-colors">
                            <Plus className="w-3 h-3" /> Add button
                          </button>
                        </div>
                        {buttons.map((btn) => (
                          <div key={btn.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-surface-secondary p-3">
                            <input
                              value={btn.title}
                              onChange={(e) => updateButton(btn.id, "title", e.target.value)}
                              className="field h-8 flex-1 text-xs"
                              placeholder="Button label"
                              aria-label="Button label"
                            />
                            <select
                              value={btn.type}
                              onChange={(e) => updateButton(btn.id, "type", e.target.value)}
                              aria-label="Button type"
                              className="field h-8 w-auto cursor-pointer text-[11px]"
                            >
                              <option value="web_url">Open Link</option>
                              <option value="postback">Trigger Flow</option>
                            </select>
                            <input
                              value={btn.type === "web_url" ? btn.url : btn.payload}
                              onChange={(e) => updateButton(btn.id, btn.type === "web_url" ? "url" : "payload", e.target.value)}
                              className="field h-8 flex-1 text-xs"
                              aria-label={btn.type === "web_url" ? "Link URL" : "Flow keyword"}
                              placeholder={btn.type === "web_url" ? "https://link" : "flow_keyword"}
                            />
                            <button
                              type="button"
                              onClick={() => removeButton(btn.id)}
                              aria-label="Remove button"
                              className="press-subtle p-1.5 text-muted-text transition-colors hover:text-danger"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {type === "media" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <FieldLabel>Select File Type</FieldLabel>
                        <div className="grid grid-cols-3 gap-2">
                          {(["image", "video", "audio"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMediaType(m)}
                              className={`h-10 rounded-xl border text-xs font-bold uppercase transition-all ${
                                mediaType === m ? "border-brand bg-brand-soft text-brand-soft-foreground" : "border-border text-muted-text hover:text-foreground"
                              }`}
                            >
                              {m === "image" ? "Photo" : m === "video" ? "Video" : "Audio"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <MediaPicker
                        userId={userId}
                        value={mediaUrl}
                        onChange={setMediaUrl}
                        kind={mediaType}
                        label="Attachment"
                        hint="Instagram fetches this file when it sends the message, so the link has to be publicly reachable."
                      />
                      <TextField value={messageText} onChange={setMessageText} placeholder="Optional caption message to send after..." />
                    </div>
                  )}

                  {type !== "card" && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <FieldLabel>Quick Reply chips ({quickReplies.length}/4)</FieldLabel>
                        <button type="button" onClick={addQuickReply} disabled={quickReplies.length >= 4}
                          className="text-[11px] text-muted-text hover:text-foreground disabled:opacity-40 flex items-center gap-1 transition-colors">
                          <Plus className="w-3 h-3" /> Add chip
                        </button>
                      </div>
                      {quickReplies.length > 0 && (
                        <div className="space-y-2">
                          {quickReplies.map((q) => (
                            <div key={q.id} className="flex gap-2 items-center">
                              <input
                                value={q.title}
                                onChange={(e) => updateQuickReply(q.id, e.target.value)}
                                maxLength={20}
                                className="field h-10 text-xs flex-1"
                                placeholder='e.g. "Send Details!"'
                              />
                              <button type="button" onClick={() => removeQuickReply(q.id)} className="text-muted-text hover:text-danger p-1.5 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== STEP 3: SETTINGS ===== */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <StepHeader
                number={3}
                title="Configure rules & name"
                description="Finalize performance parameters and activate the automation."
              />

              <div className="space-y-2">
                <FieldLabel>Automation identifier name</FieldLabel>
                <TextField value={name} onChange={setName} placeholder='e.g. "Free Ebook Download Trigger"' />
              </div>

              <div className="space-y-4">
                <FieldLabel>Delivery options</FieldLabel>
                <ToggleRow icon={<Lock className="w-5 h-5" />} title="Follow gate required" sub="Only followers get the payload. Non-followers get follow prompt first." on={checkFollow} onToggle={() => setCheckFollow(!checkFollow)} />
                <ToggleRow icon={<Eye className="w-5 h-5" />} title="Mimic active typing status" sub="Displays typing bubble indicators to look completely organic." on={typingIndicator} onToggle={() => setTypingIndicator(!typingIndicator)} />
                <ToggleRow icon={<Check className="w-5 h-5" />} title="Mark the chat as read" sub="Opens the conversation as read instead of leaving an unread badge." on={markSeen} onToggle={() => setMarkSeen(!markSeen)} />
                
                <div className="flex items-center justify-between p-4 rounded-2xl border border-border bg-surface-secondary">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-surface-secondary flex items-center justify-center border border-border">
                      <Timer className="w-4.5 h-4.5 text-muted-text" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Randomized delivery delay</p>
                      <p className="text-[11px] text-muted-text mt-0.5">Waits before sending to simulate real human delays.</p>
                    </div>
                  </div>
                  <select
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="field h-10 w-auto shrink-0 cursor-pointer text-xs"
                  >
                    <option value={0}>Send Immediately</option>
                    <option value={3}>3s delay</option>
                    <option value={5}>5s delay</option>
                    <option value={10}>10s delay</option>
                    <option value={30}>30s delay</option>
                  </select>
                </div>
              </div>

              {/* ── Funnel follow-up steps (feature 10) ── */}
              {replyMode !== "public_only" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <div>
                      <FieldLabel>Follow-up sequence ({followUpSteps.length}/{IG.stepsMax})</FieldLabel>
                      <p className="text-[11px] text-muted-text">
                        Each step is scheduled automatically. Recipients can reply to move on faster.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addStep}
                      disabled={followUpSteps.length >= IG.stepsMax}
                      className="text-[11px] text-muted-text hover:text-foreground disabled:opacity-40 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add step
                    </button>
                  </div>

                  {followUpSteps.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border bg-surface-secondary px-4 py-3 text-[11px] leading-5 text-muted-text">
                      No follow-ups yet. Add a step to turn this into a sequence — for
                      example send the asset today, ask for the order link tomorrow.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {followUpSteps.map((step, index) => {
                        const stepError =
                          !step.name.trim()
                            ? "Name this step"
                            : !step.message.trim()
                              ? "Write the message to send"
                              : step.message.trim().length > IG.messageMax
                                ? `Keep it to ${IG.messageMax} characters`
                                : step.advanceKind !== "timeout" && !step.advanceValue.trim()
                                  ? "Tell us what advances past this step"
                                  : null
                        return (
                          <li
                            key={step.id}
                            className={`rounded-2xl border p-4 ${
                              stepError ? "border-danger-soft bg-danger-soft/40" : "border-border bg-surface-secondary"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-[10px] font-bold text-brand-soft-foreground">
                                {index + 1}
                              </span>
                              <input
                                value={step.name}
                                onChange={(e) => updateStep(step.id, { name: e.target.value })}
                                maxLength={60}
                                aria-label={`Follow-up step ${index + 1} name`}
                                className="field h-9 flex-1 text-xs"
                                placeholder="Step name"
                              />
                              <button
                                type="button"
                                onClick={() => moveStep(index, -1)}
                                disabled={index === 0}
                                aria-label={`Move step ${index + 1} earlier`}
                                className="press-subtle p-1.5 text-muted-text hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronLeft className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveStep(index, 1)}
                                disabled={index === followUpSteps.length - 1}
                                aria-label={`Move step ${index + 1} later`}
                                className="press-subtle p-1.5 text-muted-text hover:text-foreground disabled:opacity-30"
                              >
                                <ChevronRight className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeStep(step.id)}
                                aria-label={`Remove step ${index + 1}`}
                                className="press-subtle p-1.5 text-muted-text transition-colors hover:text-danger"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>

                            <textarea
                              value={step.message}
                              onChange={(e) => updateStep(step.id, { message: e.target.value })}
                              rows={3}
                              maxLength={IG.messageMax}
                              aria-label={`Follow-up step ${index + 1} message`}
                              className="field mt-2 resize-none text-xs"
                              placeholder="Message to send at this step…"
                            />

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <label className="flex items-center gap-1.5 text-[10px] text-muted-text">
                                Wait
                                <input
                                  type="number"
                                  min={0}
                                  max={10080}
                                  value={step.waitMinutes}
                                  onChange={(e) =>
                                    updateStep(step.id, { waitMinutes: Math.max(0, Number(e.target.value) || 0) })
                                  }
                                  aria-label={`Follow-up step ${index + 1} wait in minutes`}
                                  className="field h-8 w-20 text-xs"
                                />
                                min
                              </label>

                              <select
                                value={step.advanceKind}
                                onChange={(e) =>
                                  updateStep(step.id, {
                                    advanceKind: e.target.value as FollowUpStep["advanceKind"],
                                  })
                                }
                                aria-label={`Follow-up step ${index + 1} advances on`}
                                className="field h-8 w-auto cursor-pointer text-[10px]"
                              >
                                <option value="timeout">Advance on timer</option>
                                <option value="keyword">Advance on keyword reply</option>
                                <option value="quick_reply">Advance on quick reply</option>
                                <option value="payload">Advance on button tap</option>
                              </select>

                              {step.advanceKind !== "timeout" && (
                                <input
                                  value={step.advanceValue}
                                  onChange={(e) => updateStep(step.id, { advanceValue: e.target.value })}
                                  maxLength={100}
                                  aria-label={`Follow-up step ${index + 1} advance value`}
                                  className="field h-8 w-32 text-xs"
                                  placeholder={step.advanceKind === "keyword" ? "e.g. price" : "payload"}
                                />
                              )}

                              <label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-text">
                                <input
                                  type="checkbox"
                                  checked={step.isConversion}
                                  onChange={(e) => updateStep(step.id, { isConversion: e.target.checked })}
                                  className="size-3.5 accent-[var(--color-brand)]"
                                />
                                Conversion step
                              </label>
                            </div>

                            {stepError ? (
                              <p className="mt-1.5 text-[10px] text-danger-soft-foreground">{stepError}</p>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* Plain-text Summary Panel */}
              <div className="rounded-2xl border border-brand/15 bg-brand-soft p-5 space-y-2">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-brand-soft-foreground" />
                                <span className="text-xs uppercase tracking-widest text-brand-soft-foreground font-bold">Rule Logic Summary</span>
                              </div>
                              <p className="text-xs text-muted-text leading-relaxed">
                                When <span className="text-foreground font-semibold underline decoration-brand/40 decoration-2">{summary.who}</span>, we will <span className="text-brand-soft-foreground font-semibold">{summary.what}</span>.
                              </p>
              </div>
            </div>
          )}

          {/* ── Wizard Foot Navigation ── */}
          <div className="flex items-center justify-between border-t border-border pt-6">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="button button--outline text-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : <div />}

            {step < 2 ? (
              <button
                type="button"
                onClick={() => { if (stepValid[step]) setStep(step + 1) }}
                disabled={!stepValid[step]}
                className="button button--primary ml-auto text-xs"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSave || saving}
                className="button button--primary ml-auto text-sm"
              >
                {saving ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Zap className="w-4 h-4 stroke-[2.5]" />}
                {saving ? "Saving Changes..." : isEditing ? "Save Automation" : "Go Live"}
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: iPhone Mockup — ALWAYS dark regardless of page theme ── */}
        {replyMode !== "public_only" && (
          <div className="hidden lg:block sticky top-6 dark">
            <div className="text-center mb-3">
              <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-600 font-bold">Interactive Preview</span>
            </div>
            
            {/* iPhone Outer Frame — sized to fit the 300px right rail without overflowing */}
            <div className="mx-auto w-[260px] xl:w-[300px] h-[500px] xl:h-[560px] rounded-[2.5rem] xl:rounded-[3rem] border-[7px] xl:border-8 border-neutral-800 bg-black shadow-2xl relative flex flex-col overflow-hidden ring-1 ring-white/10">
              
              {/* iPhone Dynamic Island */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-50 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-surface-secondary border border-neutral-800 ml-auto mr-3" />
              </div>

              {/* Status Bar Mockup */}
              <div className="h-8 bg-neutral-950 flex items-end justify-between px-6 pb-1 text-[9px] text-foreground/80 z-40 select-none">
                <span>9:41</span>
                <div className="flex items-center gap-1">
                  <span>5G</span>
                  <div className="w-4 h-2 border border-white/40 rounded-sm p-[1px] flex items-center"><div className="w-2 h-full bg-white rounded-2xs" /></div>
                </div>
              </div>

              {/* True-to-life Instagram DM Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
                <div className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4 text-foreground cursor-pointer" />
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-instagram-story-ring p-[1.5px]">
                      <div className="w-full h-full rounded-full bg-neutral-950 flex items-center justify-center text-[10px] font-bold text-white">
                        {(editRule?.name || "T").substring(0,1).toUpperCase()}
                      </div>
                    </div>
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-instagram-online rounded-full border-2 border-neutral-950" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[11px] font-semibold text-foreground truncate max-w-[100px]">@{userId ? "test_creator" : "creator"}</p>
                    <p className="text-[8px] text-instagram-online font-medium">Active now</p>
                  </div>
                </div>
                <div className="flex items-center gap-3.5 text-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  <Video className="w-3.5 h-3.5" />
                  <Info className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Screen Body */}
              <div className="flex-1 bg-black px-3 py-4 space-y-4 overflow-y-auto font-sans flex flex-col justify-end">
                {/* Incoming bubble */}
                <div className="flex justify-start items-end gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-surface-secondary flex items-center justify-center text-[9px] text-foreground">U</div>
                  <div className="bg-instagram-bubble text-foreground rounded-2xl rounded-bl-sm px-3.5 py-2 text-xs max-w-[75%] shadow-md">
                    {incomingMsg(triggerSource, triggers)}
                  </div>
                </div>

                {/* Typing indicator simulator */}
                {typingIndicator && (
                  <div className="flex justify-end pr-1 animate-pulse">
                    <span className="text-[9px] text-muted-text italic">typing indicator active...</span>
                  </div>
                )}

                {/* Outgoing Reply Bubble */}
                {hasDMContent(type, messageText, cardTitle, mediaUrl) ? (
                  <div className="flex justify-end items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                    <div className="max-w-[80%] space-y-1.5 flex flex-col items-end">
                      {type === "text" && (
                        <div className="bg-instagram-blue text-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-xs whitespace-pre-wrap break-words leading-relaxed shadow-lg">
                          {messageText || "Type message content..."}
                        </div>
                      )}
                      {type === "card" && (
                        <div className="bg-surface-secondary border border-border rounded-2xl overflow-hidden w-48 shadow-2xl">
                          {cardImage && cardImage.startsWith("http") && (
                            <img src={cardImage} alt="" className="w-full h-24 object-cover" loading="lazy" />
                          )}
                          <div className="p-3">
                            <p className="text-xs font-bold text-foreground line-clamp-1">{cardTitle || "Card Title"}</p>
                            {cardSubtitle && <p className="text-[10px] text-muted-text mt-1 line-clamp-2 leading-tight">{cardSubtitle}</p>}
                          </div>
                          {buttons.filter((b) => b.title).map((b) => (
                            <div key={b.id} className="border-t border-border py-2 text-center text-[10px] font-bold text-instagram-blue bg-surface-secondary cursor-pointer hover:bg-surface-secondary transition-colors">
                              {b.title}
                            </div>
                          ))}
                        </div>
                      )}
                      {type === "media" && (
                        <div className="bg-surface-secondary border border-border rounded-2xl w-40 h-40 overflow-hidden flex items-center justify-center relative group shadow-xl">
                          {mediaType === "image" && mediaUrl.startsWith("http") ? (
                            <img src={mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 text-muted-text">
                              <ImageIcon className="w-6 h-6" />
                              <span className="text-[9px] uppercase tracking-wider">{mediaType}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {type === "media" && messageText && (
                        <div className="bg-instagram-blue text-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-xs leading-relaxed shadow-lg">{messageText}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end animate-pulse">
                    <div className="border border-dashed border-border bg-surface-secondary rounded-2xl px-4 py-3 text-[10px] text-muted-text italic text-center w-full">
                      Configure step 2 to build payload
                    </div>
                  </div>
                )}

                {/* Quick Reply Pills */}
                {type !== "card" && quickReplies.filter((q) => q.title.trim()).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-end pt-2">
                    {quickReplies.filter((q) => q.title.trim()).map((q) => (
                      <span key={q.id} className="border border-instagram-blue text-instagram-blue hover:bg-instagram-blue/5 cursor-pointer rounded-full px-3 py-1 text-[10px] font-bold transition-all">
                        {q.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* iPhone Footer Navigation Bar */}
              <div className="h-12 bg-neutral-950 border-t border-border flex items-center justify-between px-5 text-muted-text">
                <Camera className="w-4 h-4" />
                <div className="flex-1 max-w-[150px] h-7 bg-surface-secondary border border-border rounded-full px-3 flex items-center justify-between text-[9px] text-muted-text">
                  <span>Message...</span>
                  <Smile className="w-3 h-3" />
                </div>
                <Mic className="w-4 h-4" />
                <PicIcon className="w-4 h-4" />
              </div>

              {/* iPhone Bottom Bar Indicator */}
              <div className="h-5 bg-neutral-950 flex items-center justify-center pb-1">
                <div className="w-24 h-1 bg-white/40 rounded-full" />
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   Helper renders & string parsers
   ============================================================ */

function incomingMsg(triggerSource: string, triggers: string[]): string {
  const primaryKw = triggers.length > 0 ? triggers[0] : null
  if (triggerSource === "comment") {
    return primaryKw ? `Commented "${primaryKw}"` : "Commented on post"
  }
  if (triggerSource === "story") {
    return "Interacted with your Story"
  }
  return primaryKw ? `DMed keyword "${primaryKw}"` : "Sent you a message"
}

function hasDMContent(type: string, messageText: string, cardTitle: string, mediaUrl: string): boolean {
  if (type === "text" && messageText.trim().length > 0) return true
  if (type === "card" && cardTitle.trim().length > 0) return true
  if (type === "media" && isHttpUrl(mediaUrl)) return true
  return false
}

/** Instagram rejects anything that is not an absolute http(s) URL. */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim())
}

function StepHeader({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="border-b border-border pb-4">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="rounded-[6px] border border-brand/25 bg-brand-soft px-2 py-0.5 text-[9px] font-bold tracking-wider text-brand-soft-foreground uppercase">
          Phase {number}
        </div>
      </div>
      <h3 className="text-xl font-bold tracking-[-0.02em] text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-text">{description}</p>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[9px] font-bold tracking-[0.18em] text-muted-text uppercase">{children}</p>
}

function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-11 rounded-[12px] border-0 bg-surface-secondary px-4 text-xs text-foreground shadow-[var(--field-shadow)] transition-colors placeholder:text-muted-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    />
  )
}

/**
 * A whole-row toggle.
 *
 * Uses `role="switch"` + `aria-checked` on the row itself rather than nesting a
 * real <Switch> inside a <button>, which would be invalid HTML. This way the
 * entire row is one control, keyboard-reachable via Enter/Space, and the
 * visual state is never carried by colour alone.
 */
function ToggleRow({
  icon, title, sub, on, onToggle,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex w-full items-center gap-3.5 rounded-[12px] border p-4 text-left transition-colors duration-200 ${
        on ? 'border-brand bg-brand-soft' : 'border-border bg-surface hover:bg-surface-secondary'
      }`}
    >
      <span className={on ? 'text-brand' : 'text-muted-text'}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-text">{sub}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-brand' : 'bg-surface-secondary'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-xs transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${on ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </span>
    </button>
  )
}
