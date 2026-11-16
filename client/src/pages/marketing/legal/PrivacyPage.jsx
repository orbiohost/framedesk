import { Ext, LEGAL, LegalPage, Mail } from './LegalPage.jsx';

const sections = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          {LEGAL.product} ({LEGAL.site}) is a workspace for creative studios, editors and designers to manage
          projects, files, clients and social media, with an AI assistant built in. It is operated by{' '}
          {LEGAL.operator}, {LEGAL.country} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We are responsible for the
          personal data described here. Contact: <Mail />.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <p>
          <strong>Account details.</strong> Your name, email address, password (stored only as a one-way hash),
          profile picture and settings. If you use &ldquo;Continue with Google&rdquo;, we receive your name, email
          address and profile picture from Google.
        </p>
        <p>
          <strong>Your workspace content.</strong> Everything you and your team put into {LEGAL.product}:
          projects, tasks, notes, briefs, moodboards, calendar events, chat messages, client details, and the
          files, images, audio and video you upload, along with transcripts and AI answers about them.
        </p>
        <p>
          <strong>Connected social accounts.</strong> When you connect a social media account, we receive the
          data described in <a href="#social" className="text-accent hover:underline">section 4</a>.
        </p>
        <p>
          <strong>Billing.</strong> Your plan, payments and invoices. If you pay online, card or UPI details are
          handled by the payment provider; we never see or store full card numbers.
        </p>
        <p>
          <strong>Technical data.</strong> IP address, browser and device type, sign-in times and security logs,
          used to keep your account safe and the service running. If you turn on reminders, we store your
          device&apos;s push-notification address.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use your data',
    body: (
      <ul>
        <li>To provide the service: store and show your work, sync your files, and let your team collaborate.</li>
        <li>To run AI features you ask for (file analysis, chat, briefs, moodboards, social media advice).</li>
        <li>To send you account emails: verification, password resets, invitations, reminders and receipts.</li>
        <li>To handle payments, invoices, referral rewards and support requests.</li>
        <li>To prevent fraud and abuse, and to keep the service secure and working.</li>
      </ul>
    ),
  },
  {
    id: 'social',
    title: 'Connected social media accounts',
    body: (
      <>
        <p>
          You can connect Instagram, Facebook Pages, YouTube and TikTok accounts so {LEGAL.product} can show your
          performance and give AI advice on what to post. You choose to connect each account; nothing is
          connected automatically.
        </p>
        <p>
          <strong>What we read.</strong> Read-only access to the account&apos;s public profile (name, username,
          picture, bio), audience numbers (followers, following, post count) and your recent posts or videos
          with their statistics (views, reach, likes, comments, shares, saves). The permissions we request are:
        </p>
        <ul>
          <li>
            Instagram: <code>instagram_business_basic</code>, <code>instagram_business_manage_insights</code>
          </li>
          <li>
            Facebook Pages: <code>pages_show_list</code>, <code>pages_read_engagement</code>,{' '}
            <code>read_insights</code>
          </li>
          <li>
            YouTube: <code>youtube.readonly</code> (read-only)
          </li>
          <li>
            TikTok: <code>user.info.basic</code>, <code>user.info.profile</code>, <code>user.info.stats</code>,{' '}
            <code>video.list</code>
          </li>
        </ul>
        <p>
          <strong>What we never do.</strong> We do not post, comment, message, follow, or change anything on
          your social accounts. We never see your social media passwords: you log in on the platform&apos;s own
          page. We do not sell this data, use it for advertising, or share it with other users outside your
          workspace.
        </p>
        <p>
          <strong>How we use it.</strong> Only to show your analytics inside your workspace and, when you ask,
          to generate AI content suggestions for you. Access tokens are stored encrypted on our servers and
          used only to refresh your statistics, about twice a day.
        </p>
        <p>
          <strong>Other ways to add data.</strong> You can also add a YouTube channel from its public link, type
          numbers in, or import screenshots or exported files that our AI reads. Screenshots are sent to the AI
          provider to read the numbers and are not kept after that; only the numbers you confirm are saved.
        </p>
        <p>
          <strong>Google and YouTube.</strong> {LEGAL.product} uses YouTube API Services. By connecting YouTube
          you also agree to the{' '}
          <Ext href="https://www.youtube.com/t/terms">YouTube Terms of Service</Ext>, and Google&apos;s handling
          of your data is described in the{' '}
          <Ext href="https://policies.google.com/privacy">Google Privacy Policy</Ext>.{' '}
          {LEGAL.product}&apos;s use and transfer of information received from Google APIs adheres to the{' '}
          <Ext href="https://developers.google.com/terms/api-services-user-data-policy">
            Google API Services User Data Policy
          </Ext>
          , including the Limited Use requirements.
        </p>
        <p>
          <strong>Removing access.</strong> Remove an account any time in Social Media › Connected Accounts. You
          can also revoke our access on the platform:{' '}
          <Ext href="https://myaccount.google.com/permissions">Google / YouTube</Ext>,{' '}
          <Ext href="https://www.instagram.com/accounts/manage_access/">Instagram</Ext>,{' '}
          <Ext href="https://www.facebook.com/settings?tab=business_tools">Facebook</Ext>, or TikTok (Settings ›
          Security › Manage app permissions).
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI features',
    body: (
      <>
        <p>
          When you use an AI feature, the content needed for that request (for example a file, a transcript,
          moodboard images, or your post statistics) is sent to Google&apos;s Gemini API to produce the answer.
          Google processes it under the{' '}
          <Ext href="https://ai.google.dev/gemini-api/terms">Gemini API Additional Terms</Ext>; depending on the
          service tier in use, Google may review or use requests to improve its services, so avoid sending
          highly sensitive personal data to the AI. Audio and video transcription runs on our own server and is
          not sent to a third party.
        </p>
        <p>
          If you connect an outside AI assistant (such as Claude or ChatGPT) through AI Connectors, that
          assistant can read the workspace data you allowed, and its provider&apos;s own privacy policy applies
          to what it receives.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share data with',
    body: (
      <>
        <p>We do not sell personal data. We share it only with service providers that help us run {LEGAL.product}:</p>
        <ul>
          <li>MongoDB Atlas: database hosting.</li>
          <li>Amazon Web Services (S3, Stockholm region): file storage.</li>
          <li>Google: Gemini AI, Google sign-in, YouTube data, and email delivery (Gmail).</li>
          <li>Meta and TikTok: only when you connect those accounts, to read your data from them.</li>
          <li>Payment providers (such as Razorpay), when you pay online.</li>
          <li>Our server host, where the application runs.</li>
        </ul>
        <p>
          People you invite to a workspace, or send a share link to, can see the content you share with them.
          We may also disclose data if the law requires it, or to protect our users and the service.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security and storage',
    body: (
      <p>
        Data is sent over encrypted connections (HTTPS). Passwords are hashed, social media access tokens and app
        keys are encrypted, and each workspace&apos;s data is kept separate. Some of our providers store data
        outside {LEGAL.country} (for example, files in the EU). No system is perfectly secure, but we work to
        protect your data and will tell you about any breach that affects it as the law requires.
      </p>
    ),
  },
  {
    id: 'data-deletion',
    title: 'Keeping and deleting your data',
    body: (
      <>
        <p>We keep your data while your account is active, and delete it when it is no longer needed:</p>
        <ul>
          <li>
            <strong>A social account:</strong> removing it in Social Media › Connected Accounts deletes its access
            token and all synced posts and statistics immediately.
          </li>
          <li>
            <strong>Files and content:</strong> deleting them in the app removes them; files in the trash are
            removed for good when the trash is emptied.
          </li>
          <li>
            <strong>Your whole account:</strong> email <Mail /> from your account&apos;s address with the subject
            &ldquo;Delete my account&rdquo;. We delete your account, workspaces you own, their files and connected
            accounts within 30 days and confirm by email. We may keep invoices and payment records as tax law
            requires.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <p>
        You can ask to see, correct, export or delete your personal data, or withdraw consent you gave (for
        example by disconnecting an account). Under India&apos;s Digital Personal Data Protection Act, 2023, and
        other laws that apply to you, you may also raise a grievance with us at <Mail />; we reply within 30
        days. Workspace owners control the content in their workspaces, so we may refer some requests to them.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <p>
        We use only the cookies needed to keep you signed in and secure (session and security cookies), and
        local browser storage for settings such as the light or dark theme. We do not use advertising or
        third-party tracking cookies.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        {LEGAL.product} is meant for professionals and businesses. You must be at least 18 years old to create an
        account. We do not knowingly collect data from children.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        If we change this policy, we will update the date at the top. For important changes we will also tell
        you by email or in the app before they take effect.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data {LEGAL.product} collects, including data from social media
          accounts you choose to connect, how we use it, and the choices you have. In short: your work and your
          connected accounts are yours, we only use them to run the features you use, and we never sell them.
        </p>
      }
      sections={sections}
      other={{ to: '/terms', label: 'Terms of Service' }}
    />
  );
}
