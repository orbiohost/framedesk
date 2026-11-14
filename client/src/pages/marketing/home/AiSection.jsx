import {
  ArrowUp,
  Captions,
  Check,
  FileText,
  Film,
  FolderKanban,
  Languages,
  Lightbulb,
  Sparkles,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import { AI_GRADIENT, AI_TEXT } from '../../../features/ai/aiStyle.js';
import { cn } from '../../../lib/cn.js';
import { Reveal } from './Reveal.jsx';

// Static slices of the assistant and the transcript screens.

function AiAvatar({ className }) {
  return (
    <span
      className={cn(
        AI_GRADIENT,
        'grid h-7 w-7 shrink-0 place-items-center rounded-full text-white',
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

function Chip({ icon: Icon, children }) {
  return (
    <span className="border-line/70 bg-subtle/60 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
      <Icon className="text-accent h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function Card({ className, children, delay }) {
  return (
    <Reveal
      delay={delay}
      className={cn(
        'border-line/70 bg-surface shadow-soft flex flex-col overflow-hidden rounded-3xl border',
        className,
      )}
    >
      {children}
    </Reveal>
  );
}

function CardText({ icon: Icon, tint, title, children }) {
  return (
    <div className="p-6 pb-5 md:p-7 md:pb-5">
      <span className={cn('text-ink mb-4 grid h-10 w-10 place-items-center rounded-2xl', tint)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="font-display text-xl leading-snug md:text-2xl">{title}</h3>
      <p className="text-muted mt-2 leading-relaxed">{children}</p>
    </div>
  );
}

const NEXT_STEPS = [
  {
    text: 'The 15-second teaser is in the brief but has no cut yet.',
    source: 'Saffron_Brief_v2.pdf',
    icon: FileText,
  },
  {
    text: 'Meera asked for Hindi subtitles on the founder interview.',
    source: 'Client call · 14:32',
    icon: Captions,
  },
  {
    text: 'The logo lockup needs the new tagline before final export.',
    source: 'Brand_Guidelines.pdf',
    icon: FileText,
  },
];

const STARTERS = [
  'Summarise this project’s files',
  'Which clips are ready to use?',
  'What feedback or changes were asked for?',
  'List anything with a deadline or a price',
];

function ProjectChat() {
  return (
    <div className="border-line/60 bg-subtle/30 flex flex-1 flex-col border-t px-5 py-5 md:px-7">
      <div className="space-y-4 text-sm">
        <div className="flex flex-col items-end gap-1.5">
          <Chip icon={FolderKanban}>Saffron Tea · Launch reel</Chip>
          <p className="pill-active max-w-[92%] rounded-[20px] rounded-br-md px-4 py-2.5">
            Read the brief and the client call. What do we still need to deliver?
          </p>
        </div>
        <div className="flex gap-3">
          <AiAvatar />
          <div className="min-w-0 flex-1 space-y-3">
            <p>Three things are still open before the 4 January launch:</p>
            <ol className="space-y-2.5">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.text} className="flex gap-2.5">
                  <span className="bg-lavender text-ink grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="leading-snug">{step.text}</p>
                    <p className="mt-1">
                      <Chip icon={step.icon}>{step.source}</Chip>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="bg-subtle/70 flex gap-2 rounded-2xl p-3 leading-snug">
              <Lightbulb className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium">Suggested next step:</span> start with the subtitles.
                The transcript is already done, so it is an export away.
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="border-line bg-subtle/50 mt-5 flex items-center gap-2 rounded-full border py-2 pl-4 pr-2">
        <span className="text-muted flex-1 truncate text-sm">
          Ask anything. Type / for a project or @ for a file
        </span>
        <span
          className={cn(AI_GRADIENT, 'grid h-8 w-8 place-items-center rounded-full text-white')}
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-auto pt-6">
        <p className="text-muted mb-2 text-xs">Or start with one of these</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {STARTERS.map((starter) => (
            <li
              key={starter}
              className="border-line/70 bg-surface flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm"
            >
              <span className="bg-lavender text-accent dark:text-ink grid h-7 w-7 shrink-0 place-items-center rounded-xl">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {starter}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const TRANSCRIPT = [
  { time: '00:04', text: 'We started Saffron with one estate and forty kilos of tea.' },
  { time: '00:11', text: 'Everything is still picked and packed by hand.', active: true },
  { time: '00:19', text: 'The new blend launches on the fourth of January.' },
];

function TranscriptSnippet() {
  return (
    <div className="border-line/60 mt-auto border-t px-5 py-5 md:px-7">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">Founder_Interview_A.mov</span>
        <span className="bg-mint text-ink rounded-full px-2 py-0.5">Done</span>
        <span className="text-muted ml-auto flex items-center gap-1">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" /> Hindi → English
        </span>
      </div>
      <ul className="space-y-1 text-sm">
        {TRANSCRIPT.map((line) => (
          <li
            key={line.time}
            className={cn('flex gap-3 rounded-xl px-2.5 py-2', line.active && 'bg-lavender/50')}
          >
            <span className="text-accent font-mono text-xs leading-5">{line.time}</span>
            <span className="leading-snug">{line.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted mr-1">Download</span>
        {['.txt', '.srt', '.vtt'].map((format) => (
          <span key={format} className="border-line rounded-full border px-2.5 py-1 font-mono">
            {format}
          </span>
        ))}
      </div>
    </div>
  );
}

const MOMENTS = [
  { time: '00:12', label: 'Wide of the estate at sunrise', shade: 'from-[#3b2f52] to-[#8a5a44]' },
  { time: '00:42', label: 'Product close-up, steam rising', shade: 'from-[#2a2a33] to-[#6b4a7a]' },
  { time: '01:11', label: 'Founder talks to camera', shade: 'from-[#4a3340] to-[#a8734f]' },
];

function MomentsSnippet() {
  return (
    <div className="border-line/60 mt-auto border-t px-5 py-5 md:px-7">
      <p className="text-muted mb-3 text-xs">Key moments · SaffronTea_Reel_v02.mp4</p>
      <ul className="space-y-2">
        {MOMENTS.map((moment) => (
          <li key={moment.time} className="flex items-center gap-3">
            <span
              className={cn(
                'relative h-10 w-[4.25rem] shrink-0 overflow-hidden rounded-lg bg-gradient-to-br',
                moment.shade,
              )}
            >
              <span className="absolute bottom-0.5 right-1 font-mono text-[9px] text-white/85">
                {moment.time}
              </span>
            </span>
            <span className="text-sm leading-snug">{moment.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SuggestSnippet() {
  return (
    <div className="border-line/60 mt-auto border-t px-5 py-5 md:px-7">
      <div className="grid gap-4 text-sm sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div>
            <p className="text-muted text-xs">Title</p>
            <p className="font-medium">Hand-picked at sunrise: the Saffron Tea story</p>
          </div>
          <div>
            <p className="text-muted text-xs">Caption</p>
            <p className="leading-snug">
              One estate, forty kilos, and a blend three years in the making. Launching 4 January.
            </p>
          </div>
        </div>
        <div>
          <p className="text-muted mb-1.5 text-xs">Tags</p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {['#saffrontea', '#brandfilm', '#teaestate', '#madeinindia', '#launch'].map((tag) => (
              <span key={tag} className="bg-pink/60 text-ink rounded-full px-2.5 py-1">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: UploadCloud,
    title: 'Upload as usual',
    body: 'Videos, audio, images and documents go into your Drive or a project.',
  },
  {
    icon: Sparkles,
    title: 'The assistant studies them',
    body: 'It watches, listens and reads in the background while you keep working.',
  },
  {
    icon: Check,
    title: 'Ask in plain words',
    body: 'Answers point to the exact file, so you can open it in one click.',
  },
];

export function AiSection() {
  return (
    <section id="ai" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="mx-auto mb-14 max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
            <AiAvatar className="h-6 w-6" />
            <span className={AI_TEXT}>FrameDesk AI</span>
          </p>
          <h2 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
            An assistant that has watched the footage and read the brief.
          </h2>
          <p className="text-muted mt-5 text-lg leading-relaxed">
            Stop scrubbing through rushes to find one line. Ask a question and get the answer, with
            the file and the timestamp it came from.
          </p>
        </Reveal>

        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-7 lg:row-span-2">
            <CardText
              icon={FileText}
              tint="bg-lavender"
              title="Ask about a project and its documents"
            >
              Point it at a project and it reads the briefs, scripts, transcripts and notes inside.
              Ask what was agreed, what is missing, or what to work on next.
            </CardText>
            <ProjectChat />
          </Card>

          <Card className="lg:col-span-5" delay={80}>
            <CardText icon={Captions} tint="bg-mint" title="Transcripts for every recording">
              Pick the language or let it detect one, in English, Hindi and other Indian languages.
              Click a line to jump to that second, or translate it to English.
            </CardText>
            <TranscriptSnippet />
          </Card>

          <Card className="lg:col-span-5" delay={160}>
            <CardText icon={Film} tint="bg-peach" title="It watches the video, not just the name">
              Find the clips with people talking to camera, or the take that mentions a price or a
              deadline, without opening each one.
            </CardText>
            <MomentsSnippet />
          </Card>

          <Card className="lg:col-span-12" delay={80}>
            <div className="grid lg:grid-cols-2">
              <CardText icon={Wand2} tint="bg-pink" title="Suggestions when you are stuck">
                Attach a cut and ask for a title, a caption and tags, a summary for the client, or
                whether anything looks wrong or missing.
              </CardText>
              <div className="lg:border-line/60 flex lg:border-l [&>div]:w-full [&>div]:lg:border-t-0">
                <SuggestSnippet />
              </div>
            </div>
          </Card>
        </div>

        <Reveal as="ol" className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="flex gap-4">
              <span className="border-line bg-surface grid h-11 w-11 shrink-0 place-items-center rounded-full border">
                <Icon className="text-accent h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium">
                  <span className="text-muted mr-1.5 tabular-nums">0{index + 1}</span>
                  {title}
                </p>
                <p className="text-muted mt-1 text-sm leading-relaxed">{body}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
