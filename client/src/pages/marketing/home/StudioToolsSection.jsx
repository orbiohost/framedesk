import {
  BellRing,
  Captions,
  Check,
  FileAudio,
  ImagePlus,
  Instagram,
  Languages,
  LayoutDashboard,
  ListChecks,
  PenLine,
  Shapes,
  Sparkles,
  SpellCheck,
  TrendingUp,
  Wand2,
  Youtube,
} from 'lucide-react';
import { AI_GRADIENT } from '../../../features/ai/aiStyle.js';
import { cn } from '../../../lib/cn.js';
import { Eyebrow, Reveal } from './Reveal.jsx';

// The tools that turn FrameDesk from "where files live" into where the work
// happens: briefs from meetings, moodboards, social media, a custom AI studio.
// Each card carries a small static slice of the real screen.

function BriefMock() {
  return (
    <div className="space-y-2 text-[12px]">
      <div className="border-line/70 bg-bg flex items-center gap-2 rounded-xl border px-3 py-2">
        <FileAudio className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Kickoff call with Saffron Tea · 38 min</span>
        <span className="text-success ml-auto shrink-0 font-medium">Transcribed</span>
      </div>
      <div className="border-line/70 bg-bg rounded-xl border px-3 py-2.5">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
          <Sparkles className="text-accent h-3.5 w-3.5" aria-hidden="true" /> Project brief
        </p>
        <p className="text-muted leading-snug">
          30-second launch film, warm morning light, Hindi voice-over, deliver by 12 Dec.
        </p>
        <ul className="mt-2 space-y-1">
          {[
            'Book the café for the 4th',
            'Send VO script for approval',
            'Two cut-downs for Reels',
          ].map((task) => (
            <li key={task} className="flex items-center gap-1.5">
              <ListChecks className="text-muted h-3.5 w-3.5" aria-hidden="true" />
              {task}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MoodboardMock() {
  return (
    <div className="bg-bg border-line/70 relative h-44 overflow-hidden rounded-xl border">
      <div className="bg-peach absolute left-3 top-3 h-20 w-24 rotate-[-4deg] rounded-lg shadow-sm" />
      <div className="bg-lavender absolute left-24 top-8 h-24 w-28 rotate-[3deg] rounded-lg shadow-sm" />
      <div className="bg-mint absolute right-4 top-4 h-16 w-20 rotate-[5deg] rounded-lg shadow-sm" />
      <div className="absolute bottom-3 right-3 max-w-[11rem] rounded-lg bg-yellow-100 px-2.5 py-1.5 text-[11px] text-[#3b3520] shadow-sm">
        Golden hour, handheld, soft grain
      </div>
      <svg
        className="text-accent absolute bottom-6 left-10 h-12 w-28"
        viewBox="0 0 110 48"
        fill="none"
      >
        <path
          d="M2 40 C 30 4, 70 4, 104 30"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M96 24 L105 31 L94 35"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function SocialMock() {
  const rows = [
    { icon: Instagram, name: 'Instagram', value: '12.4k', change: '+8%' },
    { icon: Youtube, name: 'YouTube', value: '3.1k', change: '+14%' },
  ];
  return (
    <div className="space-y-2 text-[12px]">
      {rows.map(({ icon: Icon, name, value, change }) => (
        <div
          key={name}
          className="border-line/70 bg-bg flex items-center gap-2.5 rounded-xl border px-3 py-2"
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">{name}</span>
          <span className="text-muted ml-auto tabular-nums">{value} followers</span>
          <span className="text-success flex items-center gap-0.5 font-medium">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            {change}
          </span>
        </div>
      ))}
      <div className="border-line/70 bg-bg flex items-end gap-1.5 rounded-xl border px-3 pb-2 pt-3">
        {[30, 42, 38, 55, 48, 66, 72, 61, 80, 92].map((height, index) => (
          <span
            key={index}
            className="bg-accent/70 flex-1 rounded-sm"
            style={{ height: `${height * 0.5}px` }}
          />
        ))}
      </div>
    </div>
  );
}

function StudioMock() {
  return (
    <div className="space-y-2 text-[12px]">
      <div className="border-line/70 bg-bg flex items-center gap-2.5 rounded-xl border px-3 py-2">
        <span
          className={cn(
            AI_GRADIENT,
            'grid h-7 w-7 shrink-0 place-items-center rounded-full text-white',
          )}
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Script writer</p>
          <p className="text-muted truncate">Knows our tone, our clients and past scripts</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <div className="bg-peach aspect-square rounded-lg" />
        <div className="bg-lavender aspect-square rounded-lg" />
        <div className="border-line/70 bg-bg text-muted grid aspect-square place-items-center rounded-lg border">
          <ImagePlus className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="text-muted">Thumbnails and storyboard frames from your reference images.</p>
    </div>
  );
}

const TOOLS = [
  {
    icon: Captions,
    tint: 'bg-mint',
    label: 'Notes & Briefs',
    title: 'Record the client call. Get the brief and the task list.',
    body: 'Upload a meeting or a voice note. FrameDesk transcribes it, in Hindi or English, and writes a project brief with deliverables, dates and to-dos you can send to the board in one click.',
    mock: BriefMock,
  },
  {
    icon: Shapes,
    tint: 'bg-peach',
    label: 'Moodboards',
    title: 'Pitch the look before you shoot it.',
    body: 'Drop references, frames and notes on a free canvas, sketch over them and draw arrows. Ask the AI to turn the board into a shot list or a creative brief.',
    mock: MoodboardMock,
  },
  {
    icon: LayoutDashboard,
    tint: 'bg-lavender',
    label: 'Social Media hub',
    title: 'Every channel’s numbers next to the work that made them.',
    body: 'Connect Instagram, Facebook, YouTube and TikTok, or import screenshots and the AI reads them. Show clients what their posts did without another tool.',
    mock: SocialMock,
  },
  {
    icon: Wand2,
    tint: 'bg-pink',
    label: 'AI Studio',
    title: 'Your own assistants, trained on how your studio works.',
    body: 'Build assistants with their own instructions and skills: a script writer, a client-email drafter, a caption maker. Create images from your references for thumbnails and storyboards.',
    mock: StudioMock,
  },
];

const EXTRAS = [
  { icon: BellRing, text: 'Reminders on your phone, even with the app closed' },
  { icon: Languages, text: 'Edit transcripts, type Hindi in English letters' },
  { icon: SpellCheck, text: 'Spell check in notes and briefs' },
  { icon: PenLine, text: 'Sticky notes pinned to your screen' },
];

const REPLACES = [
  'Shared drives',
  'Video review tools',
  'Task boards',
  'Transcription apps',
  'Moodboard apps',
  'Social analytics',
];

export function StudioToolsSection() {
  return (
    <section id="tools" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <Reveal className="mb-12 max-w-3xl">
        <Eyebrow>From brief to posted</Eyebrow>
        <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
          The whole job, not just the files.
        </h2>
        <p className="text-muted mt-4 text-lg leading-relaxed">
          Studios use FrameDesk from the first client call to the post going live. Every step
          happens on the same desk, so the AI knows the whole story.
        </p>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-2">
        {TOOLS.map(({ icon: Icon, tint, label, title, body, mock: Mock }, index) => (
          <Reveal
            key={label}
            delay={(index % 2) * 90}
            className="border-line/70 bg-surface shadow-soft hover:shadow-lift flex flex-col rounded-3xl border p-6 transition-shadow md:p-7"
          >
            <div className="mb-4 flex items-center gap-2.5">
              <span className={cn('text-ink grid h-9 w-9 place-items-center rounded-xl', tint)}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">{label}</span>
            </div>
            <h3 className="font-display text-2xl leading-snug tracking-tight">{title}</h3>
            <p className="text-muted mt-2 text-sm leading-relaxed">{body}</p>
            <div className="mt-6 flex-1" aria-hidden="true">
              <Mock />
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {EXTRAS.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="border-line/70 bg-subtle/50 flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm"
          >
            <Icon className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
            {text}
          </div>
        ))}
      </Reveal>

      <Reveal className="border-line/70 bg-surface mt-10 rounded-3xl border p-6 md:flex md:items-center md:gap-8 md:p-8">
        <div className="md:w-72 md:shrink-0">
          <p className="font-display text-2xl leading-snug tracking-tight">
            One subscription instead of six.
          </p>
          <p className="text-muted mt-1 text-sm">
            Cancel the extra apps. Priced in rupees, for Indian studios.
          </p>
        </div>
        <ul className="mt-5 flex flex-wrap gap-2 md:mt-0">
          {REPLACES.map((item) => (
            <li
              key={item}
              className="border-line/70 bg-bg inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
            >
              <Check className="text-success h-3.5 w-3.5" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
