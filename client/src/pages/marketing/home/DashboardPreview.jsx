import {
  AlarmClock,
  ArrowUp,
  CalendarDays,
  Captions,
  CircleCheckBig,
  FolderKanban,
  HardDrive,
  LayoutGrid,
  ListTodo,
  NotebookPen,
  Search,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Logo } from '../../../components/ui/Logo.jsx';
import { AI_GRADIENT } from '../../../features/ai/aiStyle.js';
import { cn } from '../../../lib/cn.js';

// A static rendering of the workspace dashboard with the AI assistant open,
// built from the same tokens as the app, so the hero shows the product itself.

const NAV = [
  { label: 'Dashboard', icon: LayoutGrid, active: true },
  { label: 'Projects', icon: FolderKanban },
  { label: 'My tasks', icon: ListTodo, count: 6 },
  { label: 'Quick notes', icon: NotebookPen },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Drive', icon: HardDrive },
  { label: 'Transcribe', icon: Captions },
  { label: 'Clients', icon: Users },
];

const STATS = [
  { label: 'Open tasks', value: 14, icon: ListTodo, tint: 'bg-lavender' },
  { label: 'Overdue', value: 2, icon: TriangleAlert, tint: 'bg-pink' },
  { label: 'Due this week', value: 5, icon: AlarmClock, tint: 'bg-peach' },
  { label: 'Done this week', value: 9, icon: CircleCheckBig, tint: 'bg-mint' },
];

const BOARD = [
  {
    title: 'To do',
    tasks: [
      { title: 'Subtitle the founder interview', tag: 'Saffron Tea', tint: 'bg-peach', due: 'Fri' },
      { title: 'Pull selects from day 2', tag: 'Northlight', tint: 'bg-lavender', due: 'Mon' },
    ],
  },
  {
    title: 'In progress',
    tasks: [
      { title: 'Brand film, cut v04', tag: 'Northlight', tint: 'bg-lavender', due: 'Today' },
      { title: 'Grade the estate wides', tag: 'Saffron Tea', tint: 'bg-peach', due: 'Thu' },
    ],
  },
  {
    title: 'In review',
    tasks: [{ title: 'Teaser, 15 seconds', tag: 'Northlight', tint: 'bg-lavender', due: 'Sent' }],
  },
];

const PROJECTS = [
  { name: 'Northlight · Brand film', progress: 72, due: '18 Dec' },
  { name: 'Saffron Tea · Launch reel', progress: 41, due: '4 Jan' },
  { name: 'Kiln Studio · Lookbook', progress: 88, due: '12 Dec' },
];

function Sidebar() {
  return (
    <aside className="border-line/70 hidden w-44 shrink-0 flex-col border-r p-3 md:flex">
      <Logo className="mb-4 px-1 [&>span]:text-[15px] [&>svg]:h-6 [&>svg]:w-6" />
      <ul className="space-y-0.5 text-[12.5px]">
        {NAV.map(({ label, icon: Icon, active, count }) => (
          <li
            key={label}
            className={cn(
              'flex items-center gap-2 rounded-full px-3 py-1.5',
              active ? 'pill-active font-medium' : 'text-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {count && (
              <span className="bg-subtle text-ink rounded-full px-1.5 text-[10px] tabular-nums">
                {count}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="bg-subtle/70 mt-auto rounded-2xl p-3">
        <p className="text-[11px] font-medium">Storage</p>
        <div className="bg-line mt-2 h-1.5 overflow-hidden rounded-full">
          <div className="bg-accent h-full w-[58%] rounded-full" />
        </div>
        <p className="text-muted mt-1.5 text-[10px] tabular-nums">146 GB of 250 GB</p>
      </div>
    </aside>
  );
}

function StatTiles() {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {STATS.map(({ label, value, icon: Icon, tint }) => (
        <div key={label} className="bg-subtle/70 flex items-center gap-2.5 rounded-2xl p-2.5">
          <span
            className={cn('text-ink grid h-8 w-8 shrink-0 place-items-center rounded-full', tint)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg tabular-nums leading-none">{value}</p>
            <p className="text-muted mt-0.5 truncate text-[10.5px]">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskBoard() {
  return (
    <div className="border-line/70 rounded-2xl border p-3">
      <p className="mb-2.5 text-xs font-semibold">Task board</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {BOARD.map((column, index) => (
          <div key={column.title} className={cn(index > 0 && 'hidden sm:block')}>
            <p className="text-muted mb-1.5 text-[10.5px] font-medium">
              {column.title} · {column.tasks.length}
            </p>
            <ul className="space-y-1.5">
              {column.tasks.map((task) => (
                <li key={task.title} className="bg-subtle/70 rounded-xl p-2.5">
                  <p className="text-[11.5px] font-medium leading-snug">{task.title}</p>
                  <p className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
                    <span className={cn('text-ink rounded-full px-1.5 py-0.5', task.tint)}>
                      {task.tag}
                    </span>
                    <span className="text-muted">{task.due}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Projects() {
  return (
    <div className="border-line/70 hidden rounded-2xl border p-3 sm:block">
      <p className="mb-2.5 text-xs font-semibold">Projects</p>
      <ul className="space-y-2.5">
        {PROJECTS.map((project) => (
          <li key={project.name}>
            <p className="flex items-center justify-between gap-3 text-[11.5px]">
              <span className="truncate font-medium">{project.name}</span>
              <span className="text-muted shrink-0 tabular-nums">Due {project.due}</span>
            </p>
            <div className="bg-subtle mt-1.5 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full rounded-full"
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TRANSCRIPTS = [
  { name: 'Founder_Interview_A.mov', detail: 'Hindi · 12 min', progress: 100 },
  { name: 'Client_call_02Dec.m4a', detail: 'English · 14 min', progress: 64 },
];

function Transcripts() {
  return (
    <div className="border-line/70 hidden rounded-2xl border p-3 lg:block">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold">
        <Captions className="text-accent h-3.5 w-3.5" aria-hidden="true" /> Transcribe
      </p>
      <ul className="space-y-2.5">
        {TRANSCRIPTS.map((item) => (
          <li key={item.name}>
            <p className="flex items-center justify-between gap-2 text-[11.5px]">
              <span className="truncate font-medium">{item.name}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px]',
                  item.progress === 100 ? 'bg-mint text-ink' : 'text-muted tabular-nums',
                )}
              >
                {item.progress === 100 ? 'Done' : `${item.progress}%`}
              </span>
            </p>
            <p className="text-muted text-[10.5px]">{item.detail}</p>
            {item.progress < 100 && (
              <div className="bg-subtle mt-1.5 h-1 overflow-hidden rounded-full">
                <div
                  className="bg-accent h-full rounded-full"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The assistant's floating window, as it sits over the dashboard.
function AssistantPanel() {
  return (
    <div className="border-line/70 bg-surface shadow-lift flex w-full flex-col overflow-hidden rounded-3xl border">
      <div className="border-line/60 relative flex items-center gap-2 border-b px-3 py-2.5">
        <span
          className={cn(AI_GRADIENT, 'pointer-events-none absolute inset-0 opacity-[0.08]')}
          aria-hidden="true"
        />
        <span
          className={cn(
            AI_GRADIENT,
            'relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-white',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="relative min-w-0">
          <p className="text-[12.5px] font-semibold leading-tight">FrameDesk AI</p>
          <p className="text-muted text-[10.5px] leading-tight">
            Knows your videos, images and docs
          </p>
        </div>
      </div>
      <div className="space-y-3 px-3 py-3 text-[12px] leading-relaxed">
        <p className="pill-active ml-auto w-fit max-w-[90%] rounded-[16px] rounded-br-md px-3 py-2">
          Which clips have the founder talking to camera?
        </p>
        <div className="flex gap-2">
          <span
            className={cn(
              AI_GRADIENT,
              'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white',
            )}
          >
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p>Three clips from day 2. The cleanest take:</p>
            <p className="bg-subtle/80 flex items-center gap-2 rounded-xl px-2 py-1.5">
              <span className="grid h-6 w-9 shrink-0 place-items-center rounded-md bg-[#1d1c1a] text-[8px] text-white/80">
                ▶
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">A001_C005_0412.MOV</span>
                <span className="text-accent font-mono text-[10px]">01:11 – 02:04</span>
              </span>
            </p>
            <p className="text-muted">She mentions the 4 January launch at 01:38.</p>
          </div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="border-line bg-subtle/50 flex items-center gap-2 rounded-full border py-1.5 pl-3.5 pr-1.5">
          <span className="text-muted flex-1 truncate text-[11.5px]">Ask about your files…</span>
          <span
            className={cn(AI_GRADIENT, 'grid h-6 w-6 place-items-center rounded-full text-white')}
          >
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <figure className="border-line/80 bg-surface shadow-ink/15 overflow-hidden rounded-[28px] border text-left shadow-2xl">
      <div className="border-line/70 flex items-center gap-1.5 border-b px-4 py-2.5">
        <span className="bg-line h-2.5 w-2.5 rounded-full" />
        <span className="bg-line h-2.5 w-2.5 rounded-full" />
        <span className="bg-line h-2.5 w-2.5 rounded-full" />
        <span className="bg-subtle text-muted mx-auto hidden items-center gap-2 rounded-full px-3 py-1 text-[11px] sm:flex">
          <Search className="h-3 w-3" aria-hidden="true" />
          Search projects, tasks, files and transcripts
        </span>
      </div>
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1 gap-3 space-y-3 p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:space-y-0">
          <div className="min-w-0 space-y-3">
            <div>
              <p className="font-display text-base leading-tight sm:text-lg">Good morning, Arjun</p>
              <p className="text-muted text-[11.5px]">Northlight Films · 3 projects in flight</p>
            </div>
            <StatTiles />
            <TaskBoard />
            <Projects />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <Transcripts />
            <AssistantPanel />
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        The FrameDesk dashboard: workspace navigation, task counts, a task board, project progress,
        and the AI assistant answering a question about uploaded video clips.
      </figcaption>
    </figure>
  );
}
