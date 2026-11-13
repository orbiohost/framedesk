import { Plus, Users } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { ClientFormDialog } from '../../features/clients/ClientFormDialog.jsx';
import { useClients } from '../../features/clients/hooks.js';
import { canManage } from '../../features/workspaces/roles.js';

const ARCHIVE_FILTERS = [
  { value: 'false', label: 'Current' },
  { value: 'true', label: 'Archived' },
];

function ClientRow({ client, workspaceId }) {
  return (
    <li>
      <Link
        to={`/w/${workspaceId}/clients/${client.id}`}
        className="hover:bg-subtle/60 flex items-center gap-3 px-4 py-3.5 transition-colors"
      >
        <Avatar name={client.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{client.name}</p>
          <p className="text-muted truncate text-sm">
            {client.company ?? client.email ?? 'No company'}
          </p>
        </div>
        <p className="text-muted hidden text-sm sm:block">
          {client.openProjectCount} open · {client.projectCount} total
        </p>
      </Link>
    </li>
  );
}

export function ClientsPage() {
  const { workspace } = useOutletContext();
  const [archived, setArchived] = useState('false');
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const q = useDeferredValue(search.trim());
  const { data: clients, isPending, isError, error } = useClients(workspace.id, { archived, q });
  const manager = canManage(workspace);

  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          manager && (
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New client
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Show"
          options={ARCHIVE_FILTERS}
          value={archived}
          onChange={setArchived}
        />
        <SearchInput
          label="Search clients"
          placeholder="Search name or company"
          value={search}
          onChange={setSearch}
          className="w-full sm:ml-auto sm:w-64"
        />
      </div>

      {isError && <Alert tone="error">{error.message}</Alert>}
      {isPending && <Skeleton className="h-60 w-full" />}

      {clients?.length === 0 &&
        (q || archived === 'true' ? (
          <EmptyState title="No clients here">Nothing matches. Try a different search.</EmptyState>
        ) : (
          <EmptyState
            icon={Users}
            title="Add the people you work for"
            action={manager && <Button onClick={() => setIsCreating(true)}>Add a client</Button>}
          >
            Keep contact details, notes and every project for a client in one place.
          </EmptyState>
        ))}

      {clients?.length > 0 && (
        <ul className="border-line/60 bg-surface shadow-soft divide-line/70 divide-y overflow-hidden rounded-3xl border">
          {clients.map((client) => (
            <ClientRow key={client.id} client={client} workspaceId={workspace.id} />
          ))}
        </ul>
      )}

      <ClientFormDialog
        workspaceId={workspace.id}
        open={isCreating}
        onClose={() => setIsCreating(false)}
      />
    </>
  );
}
