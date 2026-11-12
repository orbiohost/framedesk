import { addDays, formatDistanceToNowStrict, isFuture, startOfDay } from 'date-fns';
import {
  CalendarDays,
  Camera,
  ChevronDown,
  Clock,
  MapPin,
  MonitorPlay,
  Users,
  Video,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarStack } from '../../components/ui/Avatar.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { formatDueLabel, formatTime } from '../../lib/dates.js';
import { eventTypeLabel } from '../calendar/calendarMeta.js';
import { useCalendarFeed } from '../calendar/hooks.js';
import { useMembers } from '../members/hooks.js';
import { RoundIconButton, Widget } from './Widget.jsx';

const LOOKAHEAD_DAYS = 14;
const MEET_TYPES = ['meeting', 'review_call', 'shoot'];

function isLink(text) {
  return /^https?:\/\//i.test(text ?? '');
}

function timeRange(event) {
  if (event.allDay) return 'All day';
  return `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`;
}

function JoinButton({ event, workspaceId }) {
  if (isLink(event.location)) {
    return (
      <a
        href={event.location}
        target="_blank"
        rel="noopener noreferrer"
        className="pill-active flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Join meet <Video className="h-4 w-4" aria-hidden="true" />
      </a>
    );
  }
  return (
    <Link
      to={`/w/${workspaceId}/calendar`}
      className="border-line hover:bg-subtle flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
    >
      Details <CalendarDays className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function Preview({ event, attendeeNames }) {
  const Icon = event.type === 'shoot' ? Camera : MonitorPlay;
  const live = !isFuture(new Date(event.startsAt)) && isFuture(new Date(event.endsAt));

  return (
    <div className="from-lavender via-pink/80 to-peach relative flex h-44 w-full flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-4 sm:h-56 xl:h-48">
      <div className="flex items-center justify-between">
        <span className="bg-surface/70 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur">
          {live ? 'Happening now' : `In ${formatDistanceToNowStrict(new Date(event.startsAt))}`}
        </span>
        <span className="bg-surface/70 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur">
          {eventTypeLabel(event.type)}
        </span>
      </div>
      <div className="grid place-items-center">
        <span className="bg-surface/60 text-ink grid h-16 w-16 place-items-center rounded-full shadow-sm backdrop-blur">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        {attendeeNames.length > 0 ? (
          <AvatarStack names={attendeeNames} max={4} size="sm" />
        ) : (
          <span className="text-ink/70 flex items-center gap-1 text-xs">
            <Users className="h-3.5 w-3.5" aria-hidden="true" /> No one assigned
          </span>
        )}
        {live && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
          </span>
        )}
      </div>
    </div>
  );
}

export function MeetSchedule({ workspaceId, className }) {
  const [from] = useState(() => startOfDay(new Date()));
  const [showLater, setShowLater] = useState(false);
  const { data: items, isPending } = useCalendarFeed(workspaceId, {
    from,
    to: addDays(from, LOOKAHEAD_DAYS),
  });
  const { data: members = [] } = useMembers(workspaceId);
  const nameById = new Map(members.map((member) => [member.userId, member.name]));

  const meets = (items ?? [])
    .filter((item) => item.kind === 'event' && MEET_TYPES.includes(item.type))
    .filter((item) => isFuture(new Date(item.endsAt)))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const [next, ...later] = meets;

  return (
    <Widget
      icon={MonitorPlay}
      title="Meet schedule"
      className={className}
      actions={
        later.length > 0 && (
          <RoundIconButton
            label={showLater ? 'Hide later meetings' : 'Show later meetings'}
            onClick={() => setShowLater(!showLater)}
            aria-expanded={showLater}
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', showLater && 'rotate-180')}
              aria-hidden="true"
            />
          </RoundIconButton>
        )
      }
    >
      {isPending && <Skeleton className="h-44 rounded-3xl sm:h-56 xl:h-48" />}

      {!isPending && !next && (
        <div className="border-line text-muted flex h-44 w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed p-4 text-center text-sm sm:h-56 xl:h-48">
          No meetings, review calls or shoots in the next two weeks.
          <Link
            to={`/w/${workspaceId}/calendar`}
            className="text-accent font-medium hover:underline"
          >
            Schedule one
          </Link>
        </div>
      )}

      {next && (
        <>
          <Preview
            event={next}
            attendeeNames={next.assigneeIds.map((id) => nameById.get(id)).filter(Boolean)}
          />
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{next.title}</p>
              <p className="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDueLabel(next.startsAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {timeRange(next)}
                </span>
                {next.location && !isLink(next.location) && (
                  <span className="flex min-w-0 items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{next.location}</span>
                  </span>
                )}
              </p>
            </div>
            <JoinButton event={next} workspaceId={workspaceId} />
          </div>
        </>
      )}

      {showLater && later.length > 0 && (
        <ul className="border-line/70 mt-4 space-y-2 border-t pt-3">
          {later.slice(0, 4).map((event) => (
            <li key={event.id} className="flex items-center gap-3 text-sm">
              <span className="bg-lavender text-ink w-14 shrink-0 rounded-full py-1 text-center text-xs font-medium">
                {formatDueLabel(event.startsAt)}
              </span>
              <span className="min-w-0 flex-1 truncate">{event.title}</span>
              <span className="text-muted shrink-0 text-xs">
                {event.allDay ? 'All day' : formatTime(event.startsAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}
