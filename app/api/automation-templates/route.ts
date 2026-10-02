import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin, handle, ApiError } from "@/lib/ownership"
import { automationUpsertSchema } from "@/lib/validation"

export const dynamic = "force-dynamic"

/**
 * Feature 8 — starter automation templates.
 *
 * Templates are seeded by an idempotent upsert that runs on the first request.
 * That keeps them as real rows in `automation_templates` (editable and
 * queryable, not code fixtures) without depending on the optional `exec_sql`
 * migration path, so a fresh database self-heals on first load.
 *
 * The catalogue ships in two tiers:
 *  - "Everyday" templates cover the highest-frequency creator jobs (giveaways,
 *    channel invites, FAQs, discount codes) and stay simple to set up.
 *  - "Psychology" templates are engineered around a specific motivator — FOMO,
 *    reciprocity, authority, scarcity and commitment — to move people from a
 *    comment or DM to a conversion.
 *
 * Every seed is validated with `automationUpsertSchema` before it is written,
 * so the wizard can never prefill a payload that fails its own save.
 */

interface TemplateSeed {
  id: string
  name: string
  description: string
  icon: string
  accent: string
  category: string
  sort_order: number
  payload: Record<string, unknown>
}

const TEMPLATES: TemplateSeed[] = [
  {
    id: "lead-magnet",
    name: "Lead magnet",
    description:
      "Someone comments a keyword on your post. Send them a short DM with a card linking to your free resource.",
    icon: "magnet",
    accent: "violet",
    category: "Comment",
    sort_order: 1,
    payload: {
      name: "Lead magnet delivery",
      trigger_source: "comment",
      trigger_type: "keyword",
      trigger_value: "magnet, guide, ebook, checklist",
      response_type: "card",
      response_content: {
        message: "Here you go — grab it while it's hot 🔥",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 2,
        quick_replies: [{ title: "Thanks!", payload: "LEAD_MAGNET_THANKS" }],
        card: {
          title: "The Free Growth Guide",
          subtitle: "Instant access · no signup wall",
          buttons: [
            { type: "web_url", title: "Download the guide", url: "https://example.com/guide" },
          ],
        },
        public_replies: ["Sent to your DMs! 📥", "Check your inbox! 📥"],
        reply_mode: "both",
      },
    },
  },
  {
    id: "link-in-bio-dm",
    name: "Link in bio DM",
    description:
      "Someone asks for your links in a DM. Reply with a card that sends them straight to your link hub.",
    icon: "link",
    accent: "blue",
    category: "DM",
    sort_order: 2,
    payload: {
      name: "Link in bio",
      trigger_source: "dm",
      trigger_type: "keyword",
      trigger_value: "link, links, bio, website, shop",
      response_type: "card",
      response_content: {
        message: "Happy to send those over 👇",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [
          { title: "Got it, thanks!", payload: "LINKS_THANKS" },
          { title: "More options?", payload: "LINKS_MORE" },
        ],
        card: {
          title: "Everything in one place",
          subtitle: "Links, shop and recent posts",
          buttons: [
            { type: "web_url", title: "Open link hub", url: "https://example.com/links" },
          ],
        },
      },
    },
  },
  {
    id: "price-request",
    name: "Price request",
    description:
      "Someone asks what you charge. Answer with a pricing card and offer a quick-reply hand-off to sales.",
    icon: "tag",
    accent: "amber",
    category: "DM",
    sort_order: 3,
    payload: {
      name: "Price request",
      trigger_source: "dm",
      trigger_type: "keyword",
      trigger_value: "price, pricing, cost, how much, rates",
      response_type: "card",
      response_content: {
        message: "Great question! Here's a quick overview 👇",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 2,
        quick_replies: [
          { title: "Talk to a human", payload: "PRICING_TALK_TO_SALES" },
          { title: "Not right now", payload: "PRICING_NOT_NOW" },
        ],
        card: {
          title: "Pricing",
          subtitle: "Pick whichever plan fits",
          buttons: [
            { type: "web_url", title: "See full pricing", url: "https://example.com/pricing" },
            { type: "postback", title: "Talk to sales", payload: "PRICING_TALK_TO_SALES" },
          ],
        },
      },
    },
  },
  {
    id: "story-reply",
    name: "Story reply",
    description:
      "Someone mentions you in their story. Open a DM with a quick reply so they can keep the conversation going.",
    icon: "sparkles",
    accent: "emerald",
    category: "Story",
    sort_order: 4,
    payload: {
      name: "Story mention reply",
      trigger_source: "story",
      trigger_type: "mention",
      trigger_value: "",
      response_type: "text",
      response_content: {
        message: "Thanks for the shout-out! 🙌",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [
          { title: "Yes, send it over", payload: "STORY_SEND_DETAILS" },
          { title: "Maybe later", payload: "STORY_NOT_NOW" },
        ],
      },
    },
  },
  {
    id: "giveaway-entry",
    name: "Giveaway entry",
    description:
      "Someone comments your giveaway keyword. Confirm their entry in the DMs so they feel locked in.",
    icon: "gift",
    accent: "rose",
    category: "Comment",
    sort_order: 5,
    payload: {
      name: "Giveaway entry",
      trigger_source: "comment",
      trigger_type: "keyword",
      trigger_value: "giveaway, enter, entry, win, contest",
      response_type: "text",
      response_content: {
        message:
          "You're in 🎉 Your entry is locked. Want me to DM you the moment the winner is picked?",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [
          { title: "Yes, notify me", payload: "GIVEAWAY_NOTIFY" },
          { title: "Already following", payload: "GIVEAWAY_FOLLOWING" },
        ],
        public_replies: ["You're entered! Check your DMs 🎉", "Entry confirmed — check DMs 📩"],
        reply_mode: "both",
      },
    },
  },
  {
    id: "broadcast-invite",
    name: "Broadcast channel",
    description:
      "Turn a comment into channel members. Invite them to the place you share the stuff you don't post publicly.",
    icon: "radio",
    accent: "blue",
    category: "Comment",
    sort_order: 6,
    payload: {
      name: "Broadcast channel invite",
      trigger_source: "comment",
      trigger_type: "keyword",
      trigger_value: "vip, channel, broadcast, insider, close friends",
      response_type: "card",
      response_content: {
        message: "You made the list 🎟️ This is where the unreleased stuff goes:",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [{ title: "Joining now", payload: "CHANNEL_JOIN" }],
        card: {
          title: "The Insiders' Channel",
          subtitle: "Unreleased drops & behind-the-scenes",
          buttons: [
            { type: "web_url", title: "Join the channel", url: "https://example.com/channel" },
          ],
        },
        public_replies: ["Sent the invite 📩", "Check your DMs to join 🎟️"],
        reply_mode: "both",
      },
    },
  },
  {
    id: "faq-autoreply",
    name: "FAQ auto-answer",
    description:
      "Answer the questions you get every day, then hand off to a human only when it is actually needed.",
    icon: "lifebuoy",
    accent: "emerald",
    category: "DM",
    sort_order: 7,
    payload: {
      name: "FAQ auto-answer",
      trigger_source: "dm",
      trigger_type: "keyword",
      trigger_value: "help, faq, question, how, support, info",
      response_type: "text",
      response_content: {
        message:
          "Happy to help 💬 Tap what you need — or just type your question and a human will jump in.",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [
          { title: "Pricing", payload: "FAQ_PRICING" },
          { title: "Shipping", payload: "FAQ_SHIPPING" },
          { title: "Talk to a human", payload: "FAQ_HUMAN" },
        ],
      },
    },
  },
  {
    id: "discount-code",
    name: "Discount code drop",
    description:
      "Someone comments for a deal. Send a code straight to the DMs so they buy while the intent is hot.",
    icon: "percent",
    accent: "amber",
    category: "Comment",
    sort_order: 8,
    payload: {
      name: "Discount code drop",
      trigger_source: "comment",
      trigger_type: "keyword",
      trigger_value: "discount, code, sale, deal, promo, offer",
      response_type: "card",
      response_content: {
        message: "Here's your code 🎁 It works at checkout — grab it before it expires:",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [{ title: "Shopping now", payload: "DISCOUNT_SHOP" }],
        card: {
          title: "YOUR10 — 10% off",
          subtitle: "Tap to shop before it's gone",
          buttons: [
            { type: "web_url", title: "Shop with code", url: "https://example.com/shop" },
          ],
        },
        public_replies: ["Sent your code 📩", "Check your DMs for the code 🎁"],
        reply_mode: "both",
      },
    },
  },
  {
    id: "launch-waitlist",
    name: "Launch waitlist",
    description:
      "Comment-to-waitlist with two timed reminders. Built on anticipation and a closing deadline.",
    icon: "rocket",
    accent: "rose",
    category: "Funnel",
    sort_order: 9,
    payload: {
      name: "Launch waitlist",
      trigger_source: "comment",
      trigger_type: "keyword",
      trigger_value: "waitlist, drop, launch, notify, early, soon",
      response_type: "text",
      response_content: {
        message:
          "You're on the early list 🚀 You'll get the link here first — before it goes public.",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [{ title: "Can't wait", payload: "WAITLIST_YES" }],
        public_replies: ["You're on the list 🚀 Check your DMs", "Added you — check DMs 📩"],
        reply_mode: "both",
      },
      follow_up_steps: [
        {
          id: "waitlist-reminder",
          name: "Warm-up reminder",
          wait_minutes: 1440,
          content: {
            message:
              "Tomorrow's the day 👀 The drop goes live at 9am — you'll get the link right here first.",
          },
          advance_on: { kind: "timeout", value: "" },
          is_conversion_step: false,
        },
        {
          id: "waitlist-live",
          name: "Launch is live",
          wait_minutes: 1440,
          content: {
            message:
              "It's live 🎉 Early access is open for a few hours only. The link is in my bio — go grab yours before it sells out.",
          },
          advance_on: { kind: "timeout", value: "" },
          is_conversion_step: true,
        },
      ],
    },
  },
  {
    id: "nurture-funnel",
    name: "Value-first nurture",
    description:
      "Free guide, then a quick win, a real result and finally the offer. Reciprocity before the ask.",
    icon: "layers",
    accent: "blue",
    category: "Funnel",
    sort_order: 10,
    payload: {
      name: "Value-first nurture funnel",
      trigger_source: "comment",
      trigger_type: "keyword",
      trigger_value: "tips, free, learn, grow, training, guide",
      response_type: "card",
      response_content: {
        message:
          "Awesome — here's the free guide 👇 Then I'll send the 3 things that actually moved the needle for me.",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 2,
        quick_replies: [{ title: "Send it", payload: "NURTURE_GO" }],
        card: {
          title: "The Free Guide",
          subtitle: "The 10-minute version",
          buttons: [
            { type: "web_url", title: "Open the guide", url: "https://example.com/guide" },
          ],
        },
        public_replies: ["Sent! Check your DMs 📥", "Guide is in your DMs 📩"],
        reply_mode: "both",
      },
      follow_up_steps: [
        {
          id: "nurture-tip",
          name: "Quick win",
          wait_minutes: 1440,
          content: {
            message:
              "Quick win for today: pick ONE thing from the guide and do it before you sleep. That single rep beats rereading it. Reply YES and I'll send the next step tomorrow.",
          },
          advance_on: { kind: "timeout", value: "" },
          is_conversion_step: false,
        },
        {
          id: "nurture-proof",
          name: "Real result",
          wait_minutes: 1440,
          content: {
            message:
              "A student used exactly this and went from 200 to 5k followers in 30 days 📈 Same methods, same order. Want the before and after?",
          },
          advance_on: { kind: "timeout", value: "" },
          is_conversion_step: false,
        },
        {
          id: "nurture-offer",
          name: "Soft offer",
          wait_minutes: 1440,
          content: {
            message:
              "If you'd rather have me walk you through this live, enrollment closes Sunday. Reply INFO and I'll send the details 🤝",
          },
          advance_on: { kind: "timeout", value: "" },
          is_conversion_step: true,
        },
      ],
    },
  },
  {
    id: "collab-pitch",
    name: "Collab / brand pitch",
    description:
      "Give brands your media kit immediately, then collect the rates request on a tap. Authority first, ask second.",
    icon: "handshake",
    accent: "violet",
    category: "Funnel",
    sort_order: 11,
    payload: {
      name: "Collab / brand pitch",
      trigger_source: "dm",
      trigger_type: "keyword",
      trigger_value: "collab, brand, partnership, sponsor, ugc, work with me",
      response_type: "card",
      response_content: {
        message:
          "Love that you're thinking of working together 🤝 Here's everything brands ask for, upfront:",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [{ title: "Send rates", payload: "COLLAB_RATES" }],
        card: {
          title: "Media Kit",
          subtitle: "Audience, results & rates",
          buttons: [
            { type: "web_url", title: "Open media kit", url: "https://example.com/media-kit" },
            { type: "postback", title: "Get rates", payload: "COLLAB_RATES" },
          ],
        },
      },
      follow_up_steps: [
        {
          id: "collab-rates",
          name: "Rates & availability",
          wait_minutes: 0,
          content: {
            message:
              "Here are my current rates and open slots. Reply with your budget and timeline and I'll send a tailored proposal today 🤝",
          },
          advance_on: { kind: "payload", value: "COLLAB_RATES" },
          is_conversion_step: true,
        },
      ],
    },
  },
  {
    id: "limited-spots",
    name: "Limited spots",
    description:
      "Open a small number of spots with a clear deadline, then take the application on a tap. Scarcity plus commitment.",
    icon: "target",
    accent: "emerald",
    category: "Funnel",
    sort_order: 12,
    payload: {
      name: "Limited spots",
      trigger_source: "dm",
      trigger_type: "keyword",
      trigger_value: "apply, spots, coaching, program, enroll, join",
      response_type: "text",
      response_content: {
        message:
          "We only open 10 spots a month — small on purpose so everyone gets real attention. Applications close Friday. Want one of the remaining spots?",
        mark_seen: true,
        typing_indicator: true,
        delay_seconds: 1,
        quick_replies: [{ title: "Show me how", payload: "SPOTS_APPLY" }],
      },
      follow_up_steps: [
        {
          id: "spots-apply",
          name: "Application",
          wait_minutes: 0,
          content: {
            message:
              "Here's the short application (2 minutes). Once it's in, I'll review it personally and reply either way: https://example.com/apply",
          },
          advance_on: { kind: "payload", value: "SPOTS_APPLY" },
          is_conversion_step: true,
        },
      ],
    },
  },
]

async function ensureSeeded() {
  const supabase = getSupabaseAdmin()

  // Only upsert when something is missing, so a normal page load is a cheap read.
  const { data: existing } = await supabase
    .from("automation_templates")
    .select("id, created_at")
    .order("id")
  const have = new Set((existing ?? []).map((row) => (row as { id: string }).id))
  const missing = TEMPLATES.filter((template) => !have.has(template.id))
  if (missing.length === 0) return

  // Never seed a payload the save path would reject; skip it loudly instead.
  const valid = missing.filter((template) => {
    const parsed = automationUpsertSchema.safeParse(template.payload)
    if (!parsed.success) {
      console.warn(
        `[templates] skipping invalid template "${template.id}": ${parsed.error.issues[0]?.message}`,
      )
      return false
    }
    return true
  })
  if (valid.length === 0) return

  const { error } = await supabase
    .from("automation_templates")
    .upsert(
      valid.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        icon: template.icon,
        accent: template.accent,
        category: template.category,
        payload: template.payload,
        is_active: true,
        sort_order: template.sort_order,
      })),
      { onConflict: "id" },
    )

  if (error) {
    // Not fatal: the catalogue falls back to the in-code definitions below so
    // the page still works while the table is unavailable.
    console.warn("[templates] seed failed:", error.message)
  }
}

/** List the starter templates. */
export async function GET(_request: NextRequest) {
  return handle(async () => {
    await ensureSeeded()

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("automation_templates")
      .select("id, name, description, icon, accent, category, payload, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })

    // No in-code fallback: if the table is unreachable the UI shows an honest
    // error instead of template cards that are not real persisted data.
    if (error) {
      throw new ApiError(
        500,
        "The template catalogue could not be loaded. Please try again.",
        "templates_unavailable",
      )
    }

    return NextResponse.json({ templates: data ?? [], persisted: true })
  })
}