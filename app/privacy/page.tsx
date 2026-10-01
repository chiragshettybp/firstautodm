import { Card } from '@/components/ui/card'
import { Eyebrow } from '@/components/ui/eyebrow'

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl py-12">
      <header className="mb-8 flex flex-col gap-3">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="text-3xl leading-9 font-bold tracking-[-0.03em]">
          Privacy Policy
        </h1>
        <p className="text-sm leading-6 text-muted-text">
          Last updated: July 2026
        </p>
      </header>

      <Card className="space-y-6 p-6 md:p-8">
        <section className="space-y-4">
          <p className="leading-7">
            This app (&quot;Insta P8&quot;) is owned and operated by{' '}
            <strong>ayuuxh labs</strong>. The app uses the Instagram Graph API to
            help users manage their Instagram account, including posting reels,
            auto-replying to messages, and viewing analytics.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
            Data We Collect
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 leading-7 marker:text-muted-text">
            <li>Instagram profile information (username, name, profile picture)</li>
            <li>Instagram content (media, captions, comments)</li>
            <li>Messages and conversations (for auto-reply features)</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
            How We Use Data
          </h2>
          <ul className="list-disc space-y-1.5 pl-5 leading-7 marker:text-muted-text">
            <li>To post content to your Instagram account when you request it</li>
            <li>To send automated replies to messages and comments</li>
            <li>To display analytics about your account performance</li>
            <li>
              We do <strong>not</strong> sell your data to third parties
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
            Data Storage
          </h2>
          <p className="leading-7">
            Your Instagram access tokens and profile data are stored securely in
            our database (Supabase). You can disconnect your account at any time,
            which will remove the stored tokens.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg leading-7 font-semibold tracking-[-0.02em]">
            Contact
          </h2>
          <p className="leading-7">
            For any questions, please reach out via the app dashboard or email at{' '}
            <a
              href="mailto:flexhunt1@gmail.com"
              className="font-medium text-foreground underline decoration-border-tertiary underline-offset-4 transition-colors hover:decoration-foreground"
            >
              flexhunt1@gmail.com
            </a>
            .
          </p>
        </section>
      </Card>
    </div>
  )
}