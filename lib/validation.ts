import { z } from "zod"

import { SETTING_BOUNDS } from "./messaging-window"

/**
 * Shared validation contracts for features 6-12.
 *
 * Meta enforces hard limits on the Instagram Messaging API. Accepting a rule
 * that violates them produces a send-time failure the user cannot diagnose, so
 * every limit below is enforced on write (API route) as well as in the editor.
 */

// ---- Meta / Instagram platform limits -------------------------------
export const IG = {
  messageMax: 1000,
  cardTitleMax: 80,
  cardSubtitleMax: 80,
  buttonTitleMax: 20,
  buttonMax: 3,
  quickReplyTitleMax: 20,
  quickReplyMax: 13,
  delayMaxSeconds: 60,
  stepsMax: 10,
} as const

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)

const requiredText = (max: number, label: string) =>
  trimmed(max, label).min(1, `${label} is required`)

/** Card buttons: `web_url` needs a real URL, `postback` needs a payload. */
export const buttonSchema = z
  .object({
    type: z.enum(["web_url", "postback"]),
    title: requiredText(IG.buttonTitleMax, "Button title"),
    url: z.string().trim().optional(),
    payload: z.string().trim().max(100, "Payload must be 100 characters or fewer").optional(),
  })
  .superRefine((button, ctx) => {
    if (button.type === "web_url") {
      if (!button.url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "A destination link is required for web link buttons",
        })
      } else if (!/^https?:\/\/\S+$/i.test(button.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Link must start with http:// or https://",
        })
      }
    } else if (!button.payload) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: "A payload is required for action buttons",
      })
    }
  })

const cardSchema = z.object({
  title: requiredText(IG.cardTitleMax, "Card title"),
  subtitle: trimmed(IG.cardSubtitleMax, "Card subtitle").optional(),
  image_url: z.string().trim().optional(),
  buttons: z
    .array(buttonSchema)
    .max(IG.buttonMax, `Cards support up to ${IG.buttonMax} buttons`)
    .default([]),
})

const mediaSchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  url: z
    .string()
    .trim()
    .min(1, "A media URL is required")
    .refine((v) => /^https?:\/\/\S+$/i.test(v), "Media URL must start with http:// or https://"),
})

const quickRepliesSchema = z
  .array(
    z.object({
      title: requiredText(IG.quickReplyTitleMax, "Quick reply title"),
      payload: z.string().trim().max(100, "Quick reply payload must be 100 characters or fewer").optional(),
    }),
  )
  .max(IG.quickReplyMax, `Instagram supports up to ${IG.quickReplyMax} quick replies`)

/**
 * The `automations.response_content` contract, validated on write.
 *
 * Covers exactly the fields the delivery engine reads. A rule must carry at
 * least one deliverable element, otherwise Instagram rejects the send.
 */
export const responseContentSchema = z
  .object({
    message: trimmed(IG.messageMax, "Message").optional(),
    card: cardSchema.optional(),
    media: mediaSchema.optional(),
    quick_replies: quickRepliesSchema.optional(),
    check_follow: z.boolean().optional(),
    reply_mode: z.enum(["both", "dm_only", "public_only"]).optional(),
    public_replies: z
      .array(requiredText(IG.messageMax, "Public reply"))
      .max(10, "You can save up to 10 public replies")
      .optional(),
    include_replies: z.boolean().optional(),
    delay_seconds: z.coerce
      .number()
      .int("Delay must be a whole number of seconds")
      .min(0, "Delay cannot be negative")
      .max(IG.delayMaxSeconds, `Delay cannot exceed ${IG.delayMaxSeconds} seconds`)
      .optional(),
    typing_indicator: z.boolean().optional(),
    mark_seen: z.boolean().optional(),
  })
  .superRefine((content, ctx) => {
    if (!content.message && !content.card && !content.media) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "Add a message, card, or media so Instagram has something to send",
      })
    }
    if (content.card?.image_url && !/^https?:\/\/\S+$/i.test(content.card.image_url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["card", "image_url"],
        message: "Card image must start with http:// or https://",
      })
    }
    if (content.reply_mode === "dm_only" && content.public_replies?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["public_replies"],
        message: "Public replies are ignored when replies are DM only",
      })
    }
  })

// ---- Funnels ---------------------------------------------------------

/**
 * How a funnel advances from one step to the next.
 *
 * `timeout` advances on a timer (sent via the queue) rather than on user
 * action; the other kinds advance when the recipient replies with matching
 * text or taps a matching quick reply / card button.
 */
export const advanceTriggerSchema = z.object({
  kind: z.enum(["quick_reply", "keyword", "payload", "timeout"]),
  value: trimmed(100, "Advance trigger").default(""),
})

export const funnelStepSchema = z.object({
  id: z.string().trim().min(1, "Step id is required").max(64),
  name: requiredText(60, "Step name"),
  wait_minutes: z.coerce
    .number()
    .int("Wait must be a whole number of minutes")
    .min(0, "Wait cannot be negative")
    .max(60 * 24 * 7, "Wait cannot exceed 7 days")
    .default(0),
  content: responseContentSchema,
  advance_on: advanceTriggerSchema.default({ kind: "timeout", value: "" }),
  is_conversion_step: z.boolean().default(false),
})

export const followUpStepsSchema = z
  .array(funnelStepSchema)
  .max(IG.stepsMax, `A funnel can hold up to ${IG.stepsMax} steps`)
  .superRefine((steps, ctx) => {
    const ids = new Set<string>()
    steps.forEach((step, index) => {
      if (ids.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `Duplicate step id "${step.id}"`,
        })
      }
      ids.add(step.id)
      if (step.advance_on.kind !== "timeout" && !step.advance_on.value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "advance_on", "value"],
          message: `Tell us what advances past "${step.name}"`,
        })
      }
    })
  })

// ---- Automation CRUD --------------------------------------------------

export const automationUpsertSchema = z
  .object({
    name: requiredText(80, "Rule name"),
    trigger_source: z.enum(["comment", "dm", "story"]),
    trigger_type: z.enum(["keyword", "postback", "reply_all", "mention", "reaction", "reply"]),
    trigger_value: trimmed(500, "Trigger").default(""),
    response_type: z.string().trim().optional(),
    response_content: responseContentSchema,
    follow_up_steps: followUpStepsSchema.optional(),
    specific_media_id: z.string().trim().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .superRefine((rule, ctx) => {
    if (rule.trigger_type === "keyword" && !rule.trigger_value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trigger_value"],
        message: "Enter at least one keyword, separated by commas",
      })
    }
    // `postback` is exempt: the API generates a unique payload for the rule and
    // wires it to the buttons the user creates in the editor.
  })

// ---- Account settings (Feature 9 limits) ------------------------------

const boundedInt = (
  min: number,
  max: number,
  label: string,
) =>
  z.coerce
    .number()
    .int(`${label} must be a whole number`)
    .min(min, `${label} cannot be lower than ${min}`)
    .max(max, `${label} cannot be higher than ${max}`)

export const settingsUpdateSchema = z
  .object({
    dm_daily_limit: boundedInt(
      SETTING_BOUNDS.dailyLimit.min,
      SETTING_BOUNDS.dailyLimit.max,
      "Daily limit",
    ).optional(),
    dm_min_spacing_secs: boundedInt(
      SETTING_BOUNDS.minSpacingSec.min,
      SETTING_BOUNDS.minSpacingSec.max,
      "Minimum spacing",
    ).optional(),
    dm_window_hours: boundedInt(
      SETTING_BOUNDS.windowHours.min,
      SETTING_BOUNDS.windowHours.max,
      "Messaging window",
    ).optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Send at least one setting to update" },
  )

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>

// ---- Analytics --------------------------------------------------------

export const RANGE_PRESETS = ["7d", "30d", "90d"] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export function parseRange(value: string | null): { days: number; key: RangePreset } {
  if (value === "30d") return { days: 30, key: "30d" }
  if (value === "90d") return { days: 90, key: "90d" }
  return { days: 7, key: "7d" }
}

/** Flatten a ZodError into `{ "field.path": "message" }` for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root"
    if (!out[key]) out[key] = issue.message
  }
  return out
}