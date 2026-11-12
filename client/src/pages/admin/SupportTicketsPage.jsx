import { ChevronDown, Inbox, Mail } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { useAdminTickets, useUpdateTicket } from '../../features/support/hooks.js';
import { StarRating } from '../../features/support/StarRating.jsx';
import { TICKET_STATUS_OPTIONS, TICKET_TYPE_OPTIONS } from '../../features/support/supportMeta.js';
import {
  formatTicketDate,
  TicketReply,
  TicketStatusBadge,
  TicketTypeBadge,
} from '../../features/support/TicketList.jsx';
import { cn } from '../../lib/cn.js';

const STATUS_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: '', label: 'All' },
];

function TicketDetails({ ticket }) {
  const update = useUpdateTicket();
  const [reply, setReply] = useState('');

  function sendReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    update.mutate({ id: ticket.id, reply: reply.trim() }, { onSuccess: () => setReply('') });
  }

  return (
    <div className="border-line mt-3 space-y-4 border-t pt-4">
      <p className="whitespace-pre-line text-sm">{ticket.message}</p>
      <dl className="text-muted grid gap-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
        {ticket.workspace && (
          <>
            <dt className="font-medium">Workspace</dt>
            <dd>{ticket.workspace.name}</dd>
          </>
        )}
        {ticket.pageUrl && (
          <>
            <dt className="font-medium">Page</dt>
            <dd className="truncate">{ticket.pageUrl}</dd>
          </>
        )}
        {ticket.userAgent && (
          <>
            <dt className="font-medium">Browser</dt>
            <dd className="break-words">{ticket.userAgent}</dd>
          </>
        )}
      </dl>
      {ticket.reply && <TicketReply ticket={ticket} />}
      {update.error && <Alert tone="error">{update.error.message}</Alert>}
      <form onSubmit={sendReply} className="space-y-3">
        <TextAreaField
          id={`reply-${ticket.id}`}
          label={ticket.reply ? 'Send another reply' : 'Reply'}
          hint="Emailed to the person and shown in their Help & support page. Marks the ticket resolved."
          rows={4}
          maxLength={5000}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Button type="submit" loading={update.isPending} disabled={!reply.trim()}>
            Send reply
          </Button>
          <SelectField
            id={`status-${ticket.id}`}
            label="Status"
            className="w-44"
            options={TICKET_STATUS_OPTIONS}
            value={ticket.status}
            disabled={update.isPending}
            onChange={(event) => update.mutate({ id: ticket.id, status: event.target.value })}
          />
          {ticket.user?.email && (
            <a
              href={`mailto:${ticket.user.email}?subject=${encodeURIComponent(`Re: ${ticket.subject}`)}`}
              className="text-muted hover:text-ink flex h-10 items-center gap-1.5 text-sm"
            >
              <Mail className="h-4 w-4" aria-hidden="true" /> Email directly
            </a>
          )}
        </div>
      </form>
    </div>
  );
}

function TicketRow({ ticket }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TicketTypeBadge type={ticket.type} />
            <TicketStatusBadge status={ticket.status} />
            {ticket.rating && <StarRating value={ticket.rating} size="sm" />}
          </div>
          <p className="mt-1.5 font-medium">{ticket.subject}</p>
          <p className="text-muted text-sm">
            {ticket.user ? `${ticket.user.name} · ${ticket.user.email}` : 'Deleted user'} ·{' '}
            {formatTicketDate(ticket.createdAt)}
          </p>
          {!open && <p className="text-muted mt-1 line-clamp-1 text-sm">{ticket.message}</p>}
        </div>
        <ChevronDown
          className={cn(
            'text-muted mt-1 h-4 w-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {open && <TicketDetails ticket={ticket} />}
    </li>
  );
}

// Every question, bug report, feature request and piece of feedback users send.
export function SupportTicketsPage() {
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const { data: tickets, isPending, isError, error } = useAdminTickets({ status, type });

  return (
    <>
      <PageHeader
        title="Support"
        description="Questions, bug reports, feature requests and feedback from users. You also get an email for each new one; replying here emails the person."
      />
      <div className="mb-4 flex max-w-4xl flex-wrap items-end gap-3">
        <SegmentedControl
          label="Status"
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
          className="max-w-full overflow-x-auto"
        />
        <SelectField
          id="ticket-type"
          label="Type"
          className="w-48"
          placeholder="All types"
          options={TICKET_TYPE_OPTIONS}
          value={type}
          onChange={(event) => setType(event.target.value)}
        />
      </div>
      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-40 w-full max-w-4xl" />}
      {tickets?.length === 0 && (
        <EmptyState icon={Inbox} title="Nothing here" className="max-w-4xl">
          No tickets match these filters.
        </EmptyState>
      )}
      {tickets?.length > 0 && (
        <ul className="border-line bg-surface divide-line max-w-4xl divide-y rounded-lg border">
          {tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
    </>
  );
}
