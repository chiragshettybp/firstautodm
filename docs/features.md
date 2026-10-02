P0 — Blockers (fix before selling this to anyone)
1. Real authentication. Every API route trusts a client-supplied ?userId= from localStorage (hooks/use-instagram-session.ts). Anyone can read/modify another account's automations and DMs by changing one query param. Fix: Supabase Auth session, derive user_id server-side, delete userId from all client calls.
2. Build the AI auto-reply — it's the #1 differentiator vs ManyChat and you already have the DB columns and /api/groq documented. Fallback when no keyword matches, read last N messages, use ai_context as personality.
3. Automated tests + CI. Nothing exists — no test files, no .github/workflows. The webhook is 832 lines of branching on an external API; it's the one thing you cannot afford to break silently.
4. Token expiry handling. 60-day long-lived tokens are stored in users.token_expires_at. Nothing refreshes or warns. Add proactive refresh + a "reconnect" banner.
5. Webhook event debugger UI. webhook_events already logs everything but there's no way to read it. Debugging IG automations without this is brutal, and it's a cheap internal tool.
P1 — Product gaps that block real usage
 6. Funnel analytics. Which rule fired, funnel step reached, conversion rate, per-rule performance. This is what "analytics" should have been.
 7. Real analytics charts using the already-installed recharts — messages/day, reply rate, top triggers.
 8. Automation templates (README roadmap) — blank rule builders for "lead magnet", "link in bio DM", "price request", "story reply".
 9. Rate-limit / messaging-window compliance. Instagram enforces 24h windows and rate limits. You have dm_queue for this — build the queue and a throttle.
10. Multistep funnels. automations.follow_up_steps JSONB exists but the engine never reads it. Big feature, already half-designed.
11. Media in DMs from uploads. sendMediaDM only takes a URL. Add Supabase Storage upload so users pick files instead of pasting links.
12. Rich response editor. response_content supports cards, quick replies, media, typing indicator, delay — but the UI likely can't configure all of it. Verify and close the gap.
P2 — Growth / monetization
13. Multi-account workspace (README roadmap). Currently hard-locked to one account; agencies can't use this.
14. Reels/carousel scheduler — build on the 4 orphan tables. Scheduling needs a Vercel cron hitting a publish route.
15. Team seats + roles (admin/editor/viewer) for agencies.
16. Billing — Stripe, plan gating on automation count / DM volume.
17. Onboarding wizard (README roadmap) — connect → first rule → test it, in one flow.
18. Public API + webhooks out so customers can pipe events into their own stack.
P3 — Quality of life
19. One-click Vercel deploy button + Docker (README roadmap).
20. Reels/media picker UI over the existing /api/instagram/media cache.
21. Export/import automations as JSON (README roadmap).
22. Privacy policy page exists — add ToS, and a delete-my-account flow (Meta review requires it).
23. Dark/light toggle audit + empty states + error boundaries.
24. Re-do the docs — README/release_notes still describe InstaAuto, GitHub, Telegram, and a Groq integration that doesn't exist.