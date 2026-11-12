import { CalendarRange, ChevronLeft, ChevronRight, List, Plus, Rows3 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { canEdit } from '../workspaces/roles.js';
import { AgendaList } from './AgendaList.jsx';
import { groupItemsByDay } from './calendarMeta.js';
import { rangeTitle, stepCursor, visibleRange } from './calendarRange.js';
import { EventFormDialog } from './EventFormDialog.jsx';
import { useCalendarFeed } from './hooks.js';
import { MonthGrid } from './MonthGrid.jsx';
import { WeekColumns } from './WeekColumns.jsx';

const VIEW_OPTIONS = [
  { value: 'month', label: 'Month', icon: CalendarRange },
  { value: 'week', label: 'Week', icon: Rows3 },
  { value: 'agenda', label: 'Agenda', icon: List },
];

// Where a due-date item leads: the project it belongs to, or the task list.
function dueItemPath(workspaceId, item) {
  if (item.kind === 'project_due') return `/w/${workspaceId}/projects/${item.project.id}`;
  if (item.project) return `/w/${workspaceId}/projects/${item.project.id}/tasks`;
  return `/w/${workspaceId}/tasks`;
}

export function CalendarView({ workspace, projectId, defaultView = 'month' }) {
  const navigate = useNavigate();
  const [view, setView] = useState(defaultView);
  const [cursor, setCursor] = useState(() => new Date());
  const [dialog, setDialog] = useState(null);
  const editable = canEdit(workspace);

  const range = visibleRange(view, cursor);
  const { data: items, isError, error } = useCalendarFeed(workspace.id, { ...range, projectId });
  const itemsByDay = groupItemsByDay(items);

  function openItem(item) {
    if (item.kind === 'event') setDialog({ event: item });
    else navigate(dueItemPath(workspace.id, item));
  }

  function newEventOn(date) {
    if (editable) setDialog({ event: null, date });
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor(stepCursor(view, cursor, -1))}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor(stepCursor(view, cursor, 1))}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <h2 className="font-display min-w-40 flex-1 text-2xl">{rangeTitle(view, range)}</h2>
        <SegmentedControl
          label="Calendar view"
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
        {editable && (
          <Button onClick={() => newEventOn(new Date())}>
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
        <MonthGrid
          days={range.days}
          cursor={cursor}
          itemsByDay={itemsByDay}
          onDayClick={newEventOn}
          onOpen={openItem}
        />
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

      <p className="text-muted mt-4 text-xs">
        Project and task due dates appear here automatically. Click a day to add a shoot, meeting or
        deadline.
      </p>

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
