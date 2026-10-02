'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  MessageCircle,
  Sparkles,
  ArrowUpRight,
  Send,
  AtSign,
  Brain,
  Inbox,
  Lock,
  Terminal,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/components/layout/brand-mark'

const MARQUEE_ITEMS = [
  'comment → DM',
  'keyword triggers',
  'story reactions',
  'AI auto-reply',
  'live inbox',
  'ice breakers',
  'follow gate',
  'quick replies',
  'media attachments',
  'public + private replies',
]

const FEATURES = [
  {
    icon: <MessageCircle />,
    title: 'Comment → DM funnels',
    desc: 'Keyword or reply-all triggers on any post. Choose DM only, public reply only, or both — with your own rotating public replies.',
  },
  {
    icon: <Send />,
    title: 'DM keyword automation',
    desc: 'Auto-respond to DMs with text, media, or rich cards with buttons. Quick-reply chips guide people through your funnel.',
  },
  {
    icon: <AtSign />,
    title: 'Story triggers',
    desc: 'React to story mentions, emoji reactions, and story replies. Filter by emoji or keyword.',
  },
  {
    icon: <Brain />,
    title: 'AI auto-reply',
    desc: 'Feed it your account context — niche, products, tone — and let AI handle unmatched DMs like a human.',
  },
  {
    icon: <Inbox />,
    title: 'Live inbox',
    desc: 'Every conversation in one dashboard. Jump in manually anytime, fire quick responses from your saved automations.',
  },
  {
    icon: <Lock />,
    title: 'Follow gate',
    desc: 'Lock content behind a follow. Non-followers get a follow prompt; one tap later they unlock the goods.',
  },
  {
    icon: <Sparkles />,
    title: 'Human-like sending',
    desc: 'Optional typing indicators and randomized delays so replies land natural, not botty.',
  },
  {
    icon: <Terminal />,
    title: 'Self-hosted & hackable',
    desc: 'Next.js + Supabase. Deploy on free tiers. Read every line, fork it, own your data and your tokens.',
  },
]

export function LandingPage() {
  const router = useRouter()

  const handleLogin = () => {
    // Instagram Business Login (Instagram API with Instagram Login). client_id must be the
    // Instagram app ID from the Instagram product page, not the parent Meta app ID.
    window.location.href = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID}&redirect_uri=${process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI}&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments`
  }

  const handleTestLogin = () => {
    localStorage.setItem('ig_user_id', '9999999999')
    localStorage.setItem('ig_username', 'test_creator')
    router.push('/dashboard')
  }

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="light overflow-x-hidden bg-background antialiased">
      {/* ==================================================================
          Light editorial hero. The `.light` scope on the root pins the whole
          marketing surface to the light palette, so it stays white even when
          the visitor's app session is in dark mode.
          ================================================================== */}
      <div className="bg-white text-foreground selection:bg-brand selection:text-brand-foreground">
        {/* Nav */}
        <nav
          aria-label="Primary"
          className="sticky top-0 z-50 border-b border-separator bg-white/85 backdrop-blur-xl"
        >
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden">
                <Image
                  src="/logo.png"
                  alt=""
                  width={1254}
                  height={1254}
                  priority
                  className="size-7 object-contain"
                />
              </span>
              <span className="text-sm font-bold tracking-[-0.02em]">
                {BRAND_NAME}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isDev ? (
                <Button size="sm" variant="outline" onClick={handleTestLogin}>
                  Dev Login
                </Button>
              ) : null}
              <Button size="sm" onClick={handleLogin}>
                Log in
              </Button>
            </div>
          </div>
        </nav>

        <main>
          {/* Hero */}
          <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 md:pt-28 md:pb-28">
            <p className="fade-up mb-6 text-[11px] font-semibold tracking-[0.25em] text-muted-text uppercase">
              Instagram automation // self-hosted // no monthly fees
            </p>

            <h1 className="fade-up text-5xl leading-[0.95] font-bold tracking-[-0.04em] text-balance sm:text-6xl md:text-[6rem]">
              Your DMs,
              <br />
              <span className="text-brand-soft-foreground">on autopilot.</span>
            </h1>

            <div className="fade-up mt-12 flex flex-col gap-8 md:flex-row md:items-end md:gap-16">
              <p className="max-w-md text-base leading-7 text-muted-text text-pretty md:text-lg">
                Comment-to-DM funnels, keyword triggers, story reactions, AI
                replies, a live inbox, and Reels scheduling. A ManyChat
                alternative — your data stays in your own Supabase.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={handleLogin}>
                  Connect Instagram
                  <ArrowUpRight
                    className="size-4"
                    aria-hidden="true"
                  />
                </Button>
                {isDev ? (
                  <Button
                    size="lg"
                    variant="brand-outline"
                    onClick={handleTestLogin}
                  >
                    <Terminal aria-hidden="true" />
                    Dev Login
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          {/* Marquee */}
          <div
            aria-hidden="true"
            className="overflow-hidden border-y border-separator bg-surface-secondary py-3"
          >
            <div className="marquee-track flex w-max gap-8 text-xs font-semibold tracking-[0.2em] whitespace-nowrap text-muted-text uppercase">
              {Array.from({ length: 2 }).map((_, copy) => (
                <div key={copy} className="flex gap-8">
                  {MARQUEE_ITEMS.map((item) => (
                    <span key={item} className="flex items-center gap-8">
                      {item}{' '}
                      <span className="text-brand-soft-foreground">✦</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* ==================================================================
          Light product body — the reading + selling surface.
          ================================================================== */}
      <div className="bg-background text-foreground">
        {/* Feature grid */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="max-w-2xl text-3xl leading-tight font-bold tracking-[-0.03em] text-balance md:text-5xl">
              Everything the paid tools do.
            </h2>
            <span className="shrink-0 text-sm font-semibold text-muted-text">
              $0/month
            </span>
          </div>

          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <Feature {...feature} />
              </li>
            ))}
          </ul>
        </section>

        {/* Footer */}
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-8 sm:px-6">
            <span className="text-[11px] text-muted-text">
              {BRAND_NAME} — Instagram automation.
            </span>
            <a
              href="https://paypageapp.vercel.app/dashboard"
              className="text-[11px] text-muted-text transition-colors duration-200 hover:text-foreground"
            >
              Go back to PayPage Dashboard
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <article className="card-hover card flex h-full flex-col gap-3 rounded-[16px] border border-border bg-card p-6">
      <span
        aria-hidden="true"
        className="mb-1 flex size-9 items-center justify-center rounded-[8px] border border-border bg-surface-secondary text-muted-text [&_svg]:size-4"
      >
        {icon}
      </span>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="text-[13px] leading-6 text-muted-text text-pretty">
        {desc}
      </p>
    </article>
  )
}