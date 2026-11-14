import {
  CalendarDays,
  Captions,
  Check,
  FolderKanban,
  HardDrive,
  ListTodo,
  NotebookPen,
  Plug,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/cn.js';
import { Reveal } from './Reveal.jsx';

// This panel stays dark in both themes, so its colours are fixed rather than tokens.

const APPS = [
  {
    id: 'claude',
    label: 'Claude',
    setup: 'Settings → Connectors → Add custom connector',
    question: 'What is due this week for Northlight, and who has it?',
    tool: 'list_tasks',
    answer: 'Three tasks are due this week on Northlight · Brand film:',
    rows: [
      ['Brand film, cut v04', 'Kabir · today'],
      ['Pull selects from day 2', 'Riya · Monday'],
      ['Send teaser for approval', 'Arjun · Thursday'],
    ],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    setup: 'Settings → Apps & Connectors → New connector',
    question: 'Summarise what the client said on the last Saffron Tea call.',
    tool: 'get_transcript',
    answer: 'From the 14-minute call transcript, Meera asked for three things:',
    rows: [
      ['Hindi subtitles on the interview', '04:10'],
      ['A 15-second teaser for Reels', '09:26'],
      ['New tagline on the end card', '14:32'],
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    setup: 'Add FrameDesk to ~/.gemini/settings.json',
    question: 'Which projects have a deadline before the new year?',
    tool: 'list_projects',
    answer: 'Two open projects are due before 1 January:',
    rows: [
      ['Kiln Studio · Lookbook', '12 Dec · 88%'],
      ['Northlight · Brand film', '18 Dec · 72%'],
    ],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    setup: 'claude mcp add --transport http framedesk <server URL>',
    question: 'Find every file that mentions the new tagline.',
    tool: 'search',
    answer: 'The tagline appears in three places across your workspace:',
    rows: [
      ['Brand_Guidelines.pdf', 'Document'],
      ['Client call, 14:32', 'Transcript'],
      ['End card copy', 'Quick note'],
    ],
  },
  {
    id: 'local',
    label: 'Local models',
    setup: 'Add FrameDesk to mcp.json in LM Studio, Cursor or VS Code',
    question: 'What shoots and review calls are on the calendar next week?',
    tool: 'list_events',
    answer: 'Next week has one shoot and two review calls:',
    rows: [
      ['Saffron Tea · estate pickup shots', 'Tue 9:00'],
      ['Northlight review call', 'Wed 15:30'],
      ['Kiln Studio sign-off', 'Fri 11:00'],
    ],
  },
];

const CAN_READ = [
  { label: 'Projects', icon: FolderKanban },
  { label: 'Tasks', icon: ListTodo },
  { label: 'Clients', icon: Users },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Files', icon: HardDrive },
  { label: 'Transcripts', icon: Captions },
  { label: 'Notes', icon: NotebookPen },
  { label: 'Search', icon: Search },
];

const PROMISES = [
  'Read-only. A connected app can look, never edit or delete.',
  'It sees only what your own account can see.',
  'Choose which workspaces each connection may read.',
  'Disconnect an app or revoke a key in one click.',
];

function AppChat({ app }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#1f1e27] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-xs text-white/60">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-medium text-white/85">{app.label}</span>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          FrameDesk connected
        </span>
      </div>
      {/* Keyed so the conversation fades in again when another app is picked. */}
      <div
        key={app.id}
        className="animate-[ai-rise_320ms_ease-out_both] space-y-4 p-4 text-sm sm:p-5"
      >
        <p className="ml-auto w-fit max-w-[88%] rounded-[20px] rounded-br-md bg-white/10 px-4 py-2.5 text-white">
          {app.question}
        </p>
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#8b54e8]/30 text-[#d5bfff]">
            <Plug className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 truncate">
            Used <span className="font-medium text-white">FrameDesk</span> ·{' '}
            <span className="font-mono">{app.tool}</span>
          </span>
          <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
        </div>
        <div className="text-white/90">
          <p>{app.answer}</p>
          <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
            {app.rows.map(([name, detail]) => (
              <li key={name} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="min-w-0 truncate font-medium">{name}</span>
                <span className="shrink-0 text-xs text-white/55">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="truncate border-t border-white/10 px-4 py-3 font-mono text-[11.5px] text-white/45">
        {app.setup}
      </p>
    </div>
  );
}

export function ConnectorsShowcase() {
  const [active, setActive] = useState(APPS[0].id);
  const app = APPS.find((item) => item.id === active);

  return (
    <section id="connectors" className="scroll-mt-20 px-3 sm:px-5">
      <div className="relative overflow-hidden rounded-[36px] bg-[#16151b] text-white">
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#8b54e8]/30 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-32 h-[28rem] w-[28rem] rounded-full bg-[#c026d3]/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-24">
          <Reveal>
            <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#d5bfff]">
              <Plug className="h-3.5 w-3.5" aria-hidden="true" />
              AI connectors · MCP server
            </p>
            <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
              Your studio, inside the AI app you already use.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/65">
              FrameDesk has its own MCP server, the open standard AI apps use for connectors. Paste
              one URL, sign in, and Claude, ChatGPT, Gemini or a local model can answer questions
              about your projects, tasks, clients and files.
            </p>

            <ul className="mt-7 space-y-3">
              {PROMISES.map((promise) => (
                <li key={promise} className="flex gap-3 text-white/85">
                  <ShieldCheck
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300"
                    aria-hidden="true"
                  />
                  {promise}
                </li>
              ))}
            </ul>

            <p className="mb-2.5 mt-8 text-xs uppercase tracking-[0.14em] text-white/45">
              What a connected app can read
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {CAN_READ.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm text-white/85"
                >
                  <Icon className="h-3.5 w-3.5 text-[#d5bfff]" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>

            <Link
              to="/signup"
              className="mt-9 inline-flex rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#16151b] transition-transform hover:-translate-y-0.5"
            >
              Connect your AI app
            </Link>
          </Reveal>

          <Reveal delay={120} className="min-w-0">
            <div
              role="tablist"
              aria-label="AI app"
              className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
            >
              {APPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === active}
                  onClick={() => setActive(item.id)}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-offset-[#16151b]',
                    item.id === active
                      ? 'bg-white text-[#16151b]'
                      : 'border border-white/15 text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div role="tabpanel">
              <AppChat app={app} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
