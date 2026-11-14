import { isSameMonth, startOfMonth } from 'date-fns';
import { CalendarRange, ChevronLeft, ChevronRight, List, Plus, Rows3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { dayKey } from '../../lib/dates.js';
import { readLocal, writeLocal } from '../../lib/storage.js';
import { canEdit } from '../workspaces/roles.js';
import { AgendaList } from './AgendaList.jsx';
import { groupItemsByDay } from './calendarMeta.js';
import { rangeTitle, stepCursor, visibleRange } from './calendarRange.js';
import { DayPanel } from './DayPanel.jsx';
import { EventFormDialog } from './EventFormDialog.jsx';
import { useCalendarFeed } from './hooks.js';
import { MonthGrid } from './MonthGrid.jsx';
import { WeekColumns } from './WeekColumns.jsx';

const VIEW_OPTIONS = [
  { value: 'month', label: 'Month', icon: CalendarRange },
  { value: 'week', label: 'Week', icon: Rows3 },
  { value: 'agenda', label: 'Agenda', icon: List },
];
const VIEWS = VIEW_OPTIONS.map((option) => option.value);

const LEGEND = [
  { label: 'Shoot', tone: 'bg-peach' },
  { label: 'Meeting or call', tone: 'bg-lavender' },
  { label: 'Deadline', tone: 'bg-pink' },
  { label: 'Task due', tone: 'bg-mint' },
];

// Where a due-date item leads: the project it belongs to, or the task list.
function dueItemPath(workspaceId, item) {
  if (item.kind === 'project_due') return `/w/${workspaceId}/projects/${item.project.id}`;
  if (item.project) return `/w/${workspaceId}/projects/${item.project.id}/tasks`;
  return `/w/${workspaceId}/tasks`;
}

// The view last used is remembered in this browser; the workspace calendar and
// a project's calendar tab each keep their own.
function useRememberedView(storageKey, fallback) {
  const [view, setView] = useState(() => {
    const saved = readLocal(storageKey);
    return VIEWS.includes(saved) ? saved : fallback;
  });
  const change = (next) => {
    setView(next);
    writeLocal(storageKey, next);
  };
  return [view, change];
}

export function CalendarView({ workspace, projectId, defaultView = 'month' }) {
  const navigate = useNavigate();
  const [view, setView] = useRememberedView(
    projectId ? 'calendar:projectView' : 'calendar:view',
    defaultView,
  );
  const [cursor, setCursor] = useState(() => new Date());
  // The day picked in the month grid; its items are listed in full beside it.
  const [selected, setSelected] = useState(() => new Date());
  const [dialog, setDialog] = useState(null);
  const editable = canEdit(workspace);
  const location = useLocation();

  // The header search sends { focusDate } for an event: jump to its day, then
  // clear it so Back or a reload doesn't jump again.
  const focusDate = location.state?.focusDate;
  const [handledKey, setHandledKey] = useState(null);
  if (focusDate && location.key !== handledKey) {
    setHandledKey(location.key);
    const date = new Date(focusDate);
    if (!Number.isNaN(date.getTime())) {
      setCursor(date);
      setSelected(date);
    }
  }
  useEffect(() => {
    if (focusDate) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [focusDate, navigate, location.pathname, location.search]);

  const range = visibleRange(view, cursor);
  const { data: items, isError, error } = useCalendarFeed(workspace.id, { ...range, projectId });
  const itemsByDay = groupItemsByDay(items);

  function goTo(nextCursor) {
    const today = new Date();
    setCursor(nextCursor);
    setSelected(isSameMonth(nextCursor, today) ? today : startOfMonth(nextCursor));
  }

  function openItem(item) {
    if (item.kind === 'event') setDialog({ event: item });
    else navigate(dueItemPath(workspace.id, item));
  }

  function newEventOn(date) {
    if (editable) setDialog({ event: null, date });
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo(stepCursor(view, cursor, -1))}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo(stepCursor(view, cursor, 1))}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <h2 className="font-display ml-1 truncate text-xl sm:text-2xl">
            {rangeTitle(view, range)}
          </h2>
        </div>
        <Button variant="secondary" size="sm" onClick={() => goTo(new Date())}>
          Today
        </Button>
        <SegmentedControl
          label="Calendar view"
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
        {editable && (
          <Button onClick={() => newEventOn(view === 'month' ? selected : new Date())}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New event
          </Button>
        )}
      </div>

      {isError && (
        <Alert tone="error" className="mb-4">
          {error.message}
        </Alert>
      )}

      {view === 'month' && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <MonthGrid
            days={range.days}
            cursor={cursor}
            itemsByDay={itemsByDay}
            selected={selected}
            onSelect={setSelected}
            onCreate={newEventOn}
            onOpen={openItem}
          />
          <DayPanel
            day={selected}
            items={itemsByDay.get(dayKey(selected)) ?? []}
            canEdit={editable}
            onCreate={newEventOn}
            onOpen={openItem}
          />
        </div>
      )}
      {view === 'week' && (
        <WeekColumns
          days={range.days}
          itemsByDay={itemsByDay}
          canEdit={editable}
          onDayClick={newEventOn}
          onOpen={openItem}
        />
      )}
      {view === 'agenda' && (
        <AgendaList days={range.days} itemsByDay={itemsByDay} onOpen={openItem} />
      )}

      <ul
        aria-label="Colour key"
        className="text-muted mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      >
        {LEGEND.map((entry) => (
          <li key={entry.label} className="inline-flex items-center gap-1.5">
            <span
              className={`ring-ink/10 h-2.5 w-2.5 rounded-full ring-1 ${entry.tone}`}
              aria-hidden="true"
            />
            {entry.label}
          </li>
        ))}
        {editable && view !== 'agenda' && (
          <li className="hidden sm:block">Double-click a day to add an event.</li>
        )}
      </ul>

      <EventFormDialog
        workspaceId={workspace.id}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        event={dialog?.event}
        defaults={{ date: dialog?.date, projectId }}
        canEdit={editable}
      />
    </>
  );
}
