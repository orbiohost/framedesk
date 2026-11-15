import { addDays, startOfDay } from 'date-fns';
import { Bell, BellRing, CalendarClock, CircleAlert, Settings } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { itemLabel } from '../features/calendar/calendarMeta.js';
import { useCalendarFeed } from '../features/calendar/hooks.js';
import { useNotifications, useThisDeviceEndpoint } from '../features/notifications/hooks.js';
import { ThisDeviceControl } from '../features/notifications/NotificationsSection.jsx';
import { pushSupport } from '../features/notifications/pushDevice.js';
import { useTasks } from '../features/tasks/hooks.js';
import { cn } from '../lib/cn.js';
import { formatDueLabel, formatTime, isOverdue } from '../lib/dates.js';
import { useDismiss } from '../lib/useDismiss.js';

const LOOKAHEAD_DAYS = 2;

// What needs attention now: my overdue tasks, then the next two days of the calendar.
function useAlerts(workspaceId) {
  const [from] = useState(() => startOfDay(new Date()));
  const { data: myTasks = [] } = useTasks(workspaceId, { assignee: 'me' });
  const { data: upcoming = [] } = useCalendarFeed(workspaceId, {
    from,
    to: addDays(from, LOOKAHEAD_DAYS + 1),
  });

  return useMemo(() => {
    const overdue = myTasks
      .filter((task) => task.status !== 'done' && isOverdue(task.dueDate))
      .map((task) => ({
        id: `o-${task.id}`,
        tone: 'danger',
        title: task.title,
        detail: `Overdue · was due ${formatDueLabel(task.dueDate)}`,
        to: `/w/${workspaceId}/tasks`,
      }));
    const soon = upcoming
      .filter((item) => item.status !== 'done' && item.status !== 'completed')
      .map((item) => ({
        id: `u-${item.id}`,
        tone: 'info',
        title: item.title,
        detail: `${itemLabel(item)} · ${formatDueLabel(item.startsAt)}${
          item.allDay ? '' : `, ${formatTime(item.startsAt)}`
        }`,
        to: `/w/${workspaceId}/calendar`,
      }));
    return [...overdue, ...soon];
  }, [workspaceId, myTasks, upcoming]);
}

// Offers device reminders until this device has them (or can't have them).
function DeviceRemindersFooter({ workspaceId, onNavigate }) {
  const { data } = useNotifications();
  const { data: endpoint } = useThisDeviceEndpoint();
  const support = pushSupport();
  const subscribed = Boolean(endpoint) && data?.devices.some((d) => d.endpoint === endpoint);
  const offer =
    data?.pushAvailable && !subscribed && ['ready', 'granted', 'needs-install'].includes(support);
  return (
    <div className="border-line/70 mt-2 space-y-2 border-t px-2 pb-1 pt-3">
      {offer && (
        <div className="bg-subtle/70 space-y-2 rounded-xl p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BellRing className="text-accent h-4 w-4" aria-hidden="true" />
            Get reminders on this device
          </p>
          <p className="text-muted text-xs">
            Before deadlines and events, even when FrameDesk is closed.
          </p>
          <ThisDeviceControl overview={data} compact />
        </div>
      )}
      <Link
        to={`/w/${workspaceId}/account?tab=notifications`}
        onClick={onNavigate}
        className="text-muted hover:text-ink flex items-center gap-2 rounded-lg px-1 py-1 text-xs"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" /> Reminder settings
      </Link>
    </div>
  );
}

export function NotificationsMenu({ workspaceId }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(containerRef, isOpen, close);
  const alerts = useAlerts(workspaceId);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={`Notifications${alerts.length ? `, ${alerts.length} new` : ''}`}
        className="bg-subtle hover:text-ink text-ink/80 relative grid h-10 w-10 place-items-center rounded-full"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {alerts.length > 0 && (
          <span className="bg-danger ring-surface absolute right-2 top-2 h-2 w-2 rounded-full ring-2" />
        )}
      </button>

      {isOpen && (
        <div className="border-line/70 bg-surface shadow-lift absolute right-0 top-full z-40 mt-2 w-80 rounded-2xl border p-2">
          <p className="px-2 pb-2 pt-1 text-sm font-semibold">Notifications</p>
          {alerts.length === 0 && (
            <p className="text-muted px-2 pb-3 text-sm">
              You&apos;re all caught up for the next two days.
            </p>
          )}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {alerts.map((alert) => {
              const Icon = alert.tone === 'danger' ? CircleAlert : CalendarClock;
              return (
                <li key={alert.id}>
                  <Link
                    to={alert.to}
                    onClick={close}
                    className="hover:bg-subtle flex gap-3 rounded-xl px-2 py-2"
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full',
                        alert.tone === 'danger'
                          ? 'bg-pink text-danger dark:text-ink'
                          : 'bg-lavender text-accent dark:text-ink',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{alert.title}</span>
                      <span className="text-muted block text-xs">{alert.detail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <DeviceRemindersFooter workspaceId={workspaceId} onNavigate={close} />
        </div>
      )}
    </div>
  );
}
