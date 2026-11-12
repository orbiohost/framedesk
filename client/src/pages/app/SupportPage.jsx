import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useMyTickets } from '../../features/support/hooks.js';
import { SupportForm } from '../../features/support/SupportForm.jsx';
import { TICKET_TYPES } from '../../features/support/supportMeta.js';
import { TicketList } from '../../features/support/TicketList.jsx';

// Contact the FrameDesk team: questions, bug reports, feature requests and
// feedback, plus the history of what this person sent and the replies.
// ?type=bug (or question, feature, feedback) preselects the kind.
export function SupportPage() {
  const { workspace } = useOutletContext() ?? {};
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('type');
  const initialType = requested in TICKET_TYPES ? requested : 'question';
  const tickets = useMyTickets();

  return (
    <>
      <PageHeader
        title="Help & support"
        description="Ask a question, report a bug, request a feature or tell us what you think. A real person on the team reads every message."
      />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader title="Contact us" description="We usually reply within one working day." />
          <SupportForm key={initialType} workspaceId={workspace?.id} initialType={initialType} />
        </Card>
        <Card>
          <CardHeader title="Your requests" description="What you sent, and our replies." />
          <TicketList query={tickets} />
        </Card>
      </div>
    </>
  );
}
