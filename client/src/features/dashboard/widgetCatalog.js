import {
  CalendarDays,
  Captions,
  FolderKanban,
  HardDrive,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  MonitorPlay,
  NotebookPen,
  Timer,
  Users,
  Share2,
} from 'lucide-react';

// Every widget the dashboard can show.
// `spans`: widths it may take on the 12-column grid (first is the smallest).
// `tall`: takes half the screen height in fit-to-screen mode; others take a quarter.
export const WIDGETS = [
  {
    id: 'tasks',
    title: 'Task board',
    description: 'Tasks by status, with priority, due date and checklist progress.',
    icon: KanbanSquare,
    spans: [6, 8, 12],
    tall: true,
  },
  {
    id: 'calendar',
    title: 'Calendar',
    description: 'This month’s deadlines, meetings and shoots.',
    icon: CalendarDays,
    spans: [4, 5, 6],
    tall: true,
  },
  {
    id: 'meet',
    title: 'Meet schedule',
    description: 'Your next meeting, review call or shoot, with a join link.',
    icon: MonitorPlay,
    spans: [4, 5, 6],
    tall: true,
  },
  {
    id: 'chat',
    title: 'Team chat',
    description: 'A shared conversation for everyone in the workspace.',
    icon: MessagesSquare,
    spans: [4, 5, 6, 8],
    tall: true,
  },
  {
    id: 'timer',
    title: 'Focus timer',
    description: 'A 15, 25 or 50 minute countdown.',
    icon: Timer,
    spans: [3, 4],
    tall: false,
  },
  {
    id: 'notes',
    title: 'Notes',
    description: 'Quick notes and to-do lists, plus a private scratchpad.',
    icon: NotebookPen,
    spans: [3, 4, 6],
    tall: false,
  },
  {
    id: 'stats',
    title: 'Overview',
    description: 'Open, overdue and due-this-week tasks, plus active projects.',
    icon: LayoutDashboard,
    spans: [6, 8, 12],
    tall: false,
  },
  {
    id: 'my-tasks',
    title: 'My tasks',
    description: 'Everything assigned to you, soonest first. Tick tasks off in one click.',
    icon: ListChecks,
    spans: [4, 5, 6, 8],
    tall: true,
  },
  {
    id: 'projects',
    title: 'Projects',
    description: 'Open projects with progress and the nearest deadline first.',
    icon: FolderKanban,
    spans: [4, 5, 6, 8],
    tall: true,
  },
  {
    id: 'team',
    title: 'Team',
    description: 'Workspace members and how many tasks each has open.',
    icon: Users,
    spans: [3, 4, 5, 6],
    tall: true,
  },
  {
    id: 'storage',
    title: 'Drive storage',
    description: 'How much space is used, split by videos, images, audio and more.',
    icon: HardDrive,
    spans: [3, 4, 5, 6],
    tall: false,
  },
  {
    id: 'social',
    title: 'Social media',
    description: 'Audience reach, Instagram & WhatsApp metrics, and AI posting tips.',
    icon: Share2,
    spans: [4, 5, 6, 8],
    tall: true,
  },
  {
    id: 'transcribe',
    title: 'Transcribe',
    description: 'Recent transcripts with live progress. Drop a recording to transcribe it.',
    icon: Captions,
    spans: [4, 5, 6, 8],
    tall: true,
    // Only offered when the server has speech-to-text.
    needsTranscription: true,
  },
];

const BY_ID = new Map(WIDGETS.map((widget) => [widget.id, widget]));

export function widgetById(id) {
  return BY_ID.get(id);
}

// The layout people get until they customise it.
export const DEFAULT_LAYOUT = [
  { id: 'tasks', span: 8 },
  { id: 'calendar', span: 4 },
  { id: 'meet', span: 4 },
  { id: 'chat', span: 5 },
  { id: 'timer', span: 3 },
  { id: 'notes', span: 3 },
  { id: 'stats', span: 12 },
  { id: 'my-tasks', span: 6 },
  { id: 'projects', span: 6 },
];

// Drops widgets this version doesn't know and snaps widths to ones a widget allows.
export function normalizeLayout(widgets) {
  const seen = new Set();
  const result = [];
  for (const { id, span } of widgets) {
    const widget = BY_ID.get(id);
    if (!widget || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, span: widget.spans.includes(span) ? span : widget.spans[0] });
  }
  return result;
}

// The next allowed width, wrapping back to the smallest.
export function nextSpan(id, span) {
  const { spans } = BY_ID.get(id);
  const index = spans.indexOf(span);
  return spans[(index + 1) % spans.length];
}

// Grid classes must be literal strings so Tailwind keeps them.
const SPAN_CLASSES = {
  3: 'xl:col-span-3',
  4: 'xl:col-span-4',
  5: 'xl:col-span-5',
  6: 'xl:col-span-6',
  8: 'xl:col-span-8',
  12: 'xl:col-span-12',
};

export function spanClasses(id, span) {
  const widget = BY_ID.get(id);
  return [
    // Two columns on tablets: wide widgets take both.
    span >= 6 ? 'md:col-span-2' : 'md:col-span-1',
    SPAN_CLASSES[span],
    widget.tall ? 'fit:row-span-2' : 'fit:row-span-1',
  ].join(' ');
}

export const SPAN_LABELS = {
  3: 'Quarter',
  4: 'Third',
  5: 'Wide third',
  6: 'Half',
  8: 'Two thirds',
  12: 'Full width',
};
