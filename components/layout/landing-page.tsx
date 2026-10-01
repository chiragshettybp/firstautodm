'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap,
  MessageCircle,
  Sparkles,
  ArrowUpRight,
  Github,
  Star,
  Send,
  AtSign,
  Brain,
  Inbox,
  Lock,
  Terminal,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Eyebrow } from '@/components/ui/eyebrow'

const TELEGRAM_URL = 'https://t.me/instagramautomationp8'
const GITHUB_URL = 'https://github.com/ayuuxh2/insta-p8'

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
  const [stars, setStars] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('https://api.github.com/repos/ayuuxh2/insta-p8')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.stargazers_count === 'number')
          setStars(d.stargazers_count)
      })
      .catch(() => {})
  }, [])

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
    <div className="overflow-x-hidden antialiased">
      {/* ==================================================================
          Dark editorial hero. Deliberately fixed-dark rather than theme-aware:
          the marketing surface owns its own contrast, independent of whether
          the visitor's app is in light or dark mode.
          ================================================================== */}
      <div className="bg-neutral-950 text-neutral-100 selection:bg-brand selection:text-neutral-950">
        {/* Nav */}
        <nav
          aria-label="Primary"
          className="sticky top-0 z-50 border-b border-white/8 bg-neutral-950/80 backdrop-blur-xl"
        >
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-[6px] bg-brand text-brand-foreground"
              >
                <Zap className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="text-sm font-bold tracking-[-0.02em]">
                insta-p8
              </span>
              <Badge>open source</Badge>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="flex h-8 items-center gap-1.5 rounded-full border border-white/12 px-3 text-xs text-neutral-400 transition-colors duration-200 hover:border-white/30 hover:text-white"
              >
                <Github className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Star</span>
                {stars !== null ? (
                  <span className="font-semibold text-brand">{stars}</span>
                ) : null}
              </a>
              {isDev ? (
                <Button
                  size="sm"
                  variant="on-dark-outline"
                  onClick={handleTestLogin}
                >
                  Dev Login
                </Button>
              ) : null}
              <Button size="sm" variant="on-dark" onClick={handleLogin}>
                Log in
              </Button>
            </div>
          </div>
        </nav>

        <main>
          {/* Hero */}
          <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 md:pt-28 md:pb-28">
            <p className="fade-up mb-6 text-[11px] font-semibold tracking-[0.25em] text-neutral-500 uppercase">
              Instagram automation // self-hosted // no monthly fees
            </p>

            <h1 className="fade-up text-5xl leading-[0.95] font-bold tracking-[-0.04em] text-balance sm:text-6xl md:text-[6rem]">
              Your DMs,
              <br />
              <span className="text-brand">on autopilot.</span>
            </h1>

            <div className="fade-up mt-12 flex flex-col gap-8 md:flex-row md:items-end md:gap-16">
              <p className="max-w-md text-base leading-7 text-neutral-400 text-pretty md:text-lg">
                Comment-to-DM funnels, keyword triggers, story reactions, AI
                replies, a live inbox, and Reels scheduling. The open-source
                ManyChat alternative — your data stays in your own Supabase.
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
                <Button size="lg" variant="on-dark-outline" asChild>
                  <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">
                    <Send aria-hidden="true" />
                    Telegram support
                  </a>
                </Button>
              </div>
            </div>
          </section>

          {/* Marquee */}
          <div
            aria-hidden="true"
            className="overflow-hidden border-y border-white/8 py-3"
          >
            <div className="marquee-track flex w-max gap-8 text-xs font-semibold tracking-[0.2em] whitespace-nowrap text-neutral-600 uppercase">
              {Array.from({ length: 2 }).map((_, copy) => (
                <div key={copy} className="flex gap-8">
                  {MARQUEE_ITEMS.map((item) => (
                    <span key={item} className="flex items-center gap-8">
                      {item} <span className="text-brand">✦</span>
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

        {/* Community strip */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 md:pb-28">
          <div className="flex flex-col items-start justify-between gap-8 rounded-[16px] border border-border bg-surface p-8 md:flex-row md:items-center md:p-12">
            <div>
              <Eyebrow>Community</Eyebrow>
              <h3 className="mt-3 mb-2 text-3xl leading-tight font-bold tracking-[-0.03em] md:text-4xl">
                Built in the open.
              </h3>
              <p className="max-w-md text-sm leading-6 text-muted-text">
                Stars, sponsors, and testers keep this project alive. Questions,
                bugs, feature requests — the Telegram chat is where it all
                happens.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" asChild>
                <a href={TELEGRAM_URL} target="_blank" rel="noreferrer">
                  <Send aria-hidden="true" />
                  Join Telegram
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Star className="text-brand" aria-hidden="true" />
                  Star on GitHub
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:px-6 md:flex-row">
            <span className="text-[11px] text-muted-text">
              insta-p8 — open-source Instagram automation. MIT licensed.
            </span>
            <div className="flex items-center gap-5 text-[11px] text-muted-text">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-200 hover:text-foreground"
              >
                GitHub
              </a>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-200 hover:text-foreground"
              >
                Telegram support
              </a>
            </div>
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

/**
 * Marketing-only chip. The app's `Badge` is tuned for light surfaces, so the
 * dark hero needs one tone that survives on neutral-950.
 */
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden h-5 items-center rounded-full border border-white/12 px-2 text-[10px] font-semibold text-neutral-500 sm:inline-flex">
      {children}
    </span>
  )
}