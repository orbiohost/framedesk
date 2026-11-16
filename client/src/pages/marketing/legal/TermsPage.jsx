import { Link } from 'react-router-dom';
import { Ext, LEGAL, LegalPage, Mail } from './LegalPage.jsx';

const sections = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <p>
        These terms are an agreement between you and {LEGAL.operator} ({LEGAL.country}), which runs{' '}
        {LEGAL.product} at {LEGAL.site}. By creating an account or using {LEGAL.product}, you agree to these terms
        and to our{' '}
        <Link to="/privacy" className="text-accent hover:underline">
          Privacy Policy
        </Link>
        . If you use {LEGAL.product} for a company, you confirm you may accept these terms for it. You must be at
        least 18.
      </p>
    ),
  },
  {
    id: 'service',
    title: 'The service',
    body: (
      <p>
        {LEGAL.product} lets you manage projects, tasks, files, clients, moodboards and notes, share work with
        clients, transcribe media, connect social media accounts for analytics, and use AI features. We may add,
        change or remove features over time; if we remove something important to a paid plan, we will tell you
        in advance.
      </p>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <ul>
        <li>Give accurate details and keep your password and devices secure.</li>
        <li>You are responsible for what happens under your account and in workspaces you own.</li>
        <li>Workspace owners decide who is invited and what each member can do.</li>
        <li>Tell us straight away at <Mail /> if you think your account has been misused.</li>
      </ul>
    ),
  },
  {
    id: 'content',
    title: 'Your content',
    body: (
      <>
        <p>
          You keep all rights to what you upload and create. You give us permission to store, process, copy and
          display it only as needed to run {LEGAL.product} for you, for example to make previews, transcripts,
          backups, and AI answers you ask for.
        </p>
        <p>
          You confirm you have the right to upload your content and to share it with the people you share it
          with, including your clients&apos; material.
        </p>
      </>
    ),
  },
  {
    id: 'social',
    title: 'Connected social media accounts',
    body: (
      <>
        <p>
          You may connect only accounts you own or are authorised to manage. Connecting gives {LEGAL.product}
          read-only access to the account&apos;s profile, posts and statistics, as described in our{' '}
          <Link to="/privacy#social" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          . We never post or act on your behalf.
        </p>
        <p>
          Your use of each platform remains subject to that platform&apos;s own terms, including the{' '}
          <Ext href="https://www.youtube.com/t/terms">YouTube Terms of Service</Ext>,{' '}
          <Ext href="https://help.instagram.com/581066165581870">Instagram Terms of Use</Ext>,{' '}
          <Ext href="https://www.facebook.com/terms.php">Meta Terms</Ext> and{' '}
          <Ext href="https://www.tiktok.com/legal/terms-of-service">TikTok Terms of Service</Ext>. Platforms can
          change or withdraw their APIs at any time, so statistics may sometimes be delayed, incomplete or
          unavailable. You can disconnect an account at any time.
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI features',
    body: (
      <p>
        AI answers, briefs, transcripts and content suggestions are generated automatically and can be wrong or
        incomplete. Check them before relying on them or publishing them; you are responsible for what you
        publish. AI use counts against your plan&apos;s AI credits.
      </p>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>Do not use {LEGAL.product} to:</p>
        <ul>
          <li>upload anything illegal, infringing, or that you have no right to share;</li>
          <li>harass people, send spam, or spread malware;</li>
          <li>connect social accounts you are not authorised to manage, or scrape other people&apos;s data;</li>
          <li>try to break, overload or get around the security or limits of the service;</li>
          <li>resell the service or create fake accounts to get extra free storage, credits or referral rewards.</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules.</p>
      </>
    ),
  },
  {
    id: 'plans',
    title: 'Plans, payments and refunds',
    body: (
      <>
        <p>
          The Free plan includes limited storage and AI use. Paid plans are billed in advance in Indian Rupees,
          plus GST where it applies, at the prices shown on our pricing page at the time you buy. Plans renew
          only when you pay for the next period; if a paid plan ends, your workspace moves to the Free plan
          limits.
        </p>
        <p>
          If you are not happy, contact <Mail /> within 7 days of your first payment for a plan and we will
          refund it. After that, payments are not refundable except where the law requires. Coupons and
          referral rewards have no cash value and may end at any time.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and backups',
    body: (
      <p>
        We work to keep {LEGAL.product} running and your data safe, but we cannot promise it will never be
        interrupted or that data will never be lost. Keep your own copies of important files.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Ending your use',
    body: (
      <p>
        You can stop using {LEGAL.product} at any time and ask us to delete your account (see the{' '}
        <Link to="/privacy#data-deletion" className="text-accent hover:underline">
          Privacy Policy
        </Link>
        ). We may suspend or close accounts that seriously or repeatedly break these terms, or when the law
        requires it; where we can, we will warn you first and give you time to download your files.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Warranty and liability',
    body: (
      <p>
        {LEGAL.product} is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for
        indirect losses such as lost profits, lost data or lost business, and our total liability for any claim
        is limited to the amount you paid us in the 12 months before it. Nothing in these terms limits rights you
        have under consumer law that cannot be excluded.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Law and disputes',
    body: (
      <p>
        These terms are governed by the laws of India. Please contact us first so we can try to resolve any
        problem. If we cannot, the courts of India have jurisdiction.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes and contact',
    body: (
      <p>
        We may update these terms. We will change the date at the top and, for important changes, tell you by
        email or in the app before they take effect. Continuing to use {LEGAL.product} after that means you
        accept the new terms. Questions: <Mail />.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These are the rules for using {LEGAL.product}, including connecting your social media accounts and
          using AI features. They are written to be read, so please do.
        </p>
      }
      sections={sections}
      other={{ to: '/privacy', label: 'Privacy Policy' }}
    />
  );
}
