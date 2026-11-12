import { Inbox, MessageCircleReply } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { StarRating } from './StarRating.jsx';
import { TICKET_STATUSES, TICKET_TYPES } from './supportMeta.js';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function formatTicketDate(value) {
  return value ? dateFormat.format(new Date(value)) : '';
}

export function TicketTypeBadge({ type }) {
  const meta = TICKET_TYPES[type];
  const Icon = meta.icon;
  return (
    <Badge tone="muted">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function TicketStatusBadge({ status }) {
  const meta = TICKET_STATUSES[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function TicketReply({ ticket }) {
  return (
    <div className="bg-lavender/40 border-accent/20 mt-3 rounded-2xl border p-3">
      <p className="text-accent dark:text-ink mb-1 flex items-center gap-1.5 text-xs font-semibold">
        <MessageCircleReply className="h-3.5 w-3.5" aria-hidden="true" />
        FrameDesk team
        {ticket.repliedAt && (
          <span className="text-muted font-normal">· {formatTicketDate(ticket.repliedAt)}</span>
        )}
      </p>
      <p className="whitespace-pre-line text-sm">{ticket.reply}</p>
    </div>
  );
}

function TicketItem({ ticket }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <TicketTypeBadge type={ticket.type} />
        <TicketStatusBadge status={ticket.status} />
        <span className="text-muted ml-auto text-xs">{formatTicketDate(ticket.createdAt)}</span>
      </div>
      <p className="mt-2 font-medium">{ticket.subject}</p>
      {ticket.rating && (
        <div className="mt-1">
          <StarRating value={ticket.rating} size="sm" />
        </div>
      )}
      <p className="text-muted mt-1 line-clamp-3 whitespace-pre-line text-sm">{ticket.message}</p>
      {ticket.reply && <TicketReply ticket={ticket} />}
    </li>
  );
}

// The signed-in person's own requests, newest first, with the team's replies.
export function TicketList({ query }) {
  const { data: tickets, isPending, isError, error } = query;
  if (isPending) {
    return (
      <div className="p-5">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-5">
        <Alert tone="error">{error.message}</Alert>
      </div>
    );
  }
  if (tickets.length === 0) {
    return (
      <EmptyState icon={Inbox} title="Nothing yet" className="m-5 border-0 py-10">
        Questions, bug reports and ideas you send show up here, with our replies.
      </EmptyState>
    );
  }
  return (
    <ul className="divide-line divide-y">
      {tickets.map((ticket) => (
        <TicketItem key={ticket.id} ticket={ticket} />
      ))}
    </ul>
  );
}
