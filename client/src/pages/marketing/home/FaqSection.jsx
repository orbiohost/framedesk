import { Plus } from 'lucide-react';

const QUESTIONS = [
  {
    q: 'What can the AI assistant do?',
    a: 'It transcribes your recordings, watches your videos, looks at your images and reads your documents. Then you ask in plain words: find a clip, summarise a brief, list what a client asked for, or suggest a title and caption. Answers link to the files they came from.',
  },
  {
    q: 'Is the AI included, or does it cost extra?',
    a: 'It is included on every plan, the free one too. Usage refreshes every few hours within a weekly limit, and bigger plans get more. If you need more than that, you can buy extra credits.',
  },
  {
    q: 'Which AI apps can I connect to FrameDesk?',
    a: 'Claude, ChatGPT, Gemini CLI, Claude Code, and any app that supports remote MCP servers, such as LM Studio, Cursor or VS Code with a local model. You paste the server URL from your account page and sign in, or create an API key.',
  },
  {
    q: 'Can a connected AI app change or delete my work?',
    a: 'No. Connectors are read-only and see only what your own account can see. You choose which workspaces each connection may read, and you can disconnect it at any time.',
  },
  {
    q: 'What counts toward my storage?',
    a: 'Every file you upload, including older versions and files in Trash. Trash empties itself after 30 days, and you can empty it sooner to free space straight away.',
  },
  {
    q: 'What happens when I run out of space?',
    a: 'New uploads pause until you free some space or add a storage pack. Nothing is ever deleted for you, and everyone can still view and download.',
  },
  {
    q: 'Do my clients need an account?',
    a: 'No. Send them a review link, with a password and an expiry date if you like. They can watch, leave timestamped notes and approve a version.',
  },
  {
    q: 'Can freelancers see all my clients?',
    a: 'Only if you let them. You can limit any member to specific projects and choose exactly what they can do there: upload, download, rename, delete or comment.',
  },
  {
    q: 'What if a payment fails?',
    a: 'Plans don’t renew by themselves. When one ends you get 7 days with full access to renew; after that the account moves to the free plan. Your files stay put, and uploads continue once you are under the free 2 GB or renew.',
  },
  {
    q: 'Can I earn more free storage?',
    a: 'Yes. Share your referral link from your account page. When a studio signs up with it and verifies their email, you get extra storage on any plan, free included, and they get a discount on their first paid plan.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. Every account starts free with 2 GB of storage and a smaller AI limit, for as long as you like, no card needed. Upgrade whenever you need more; your projects carry over.',
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="border-line scroll-mt-20 border-t">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
          Questions studios ask us
        </h2>
        <div className="divide-line border-line divide-y border-y">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus
                  className="text-muted h-4 w-4 shrink-0 transition-transform group-open:rotate-45"
                  aria-hidden="true"
                />
              </summary>
              <p className="text-muted mt-3 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
